package net.selvedge.wallet.review

import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import net.selvedge.engine.EngineException
import net.selvedge.engine.ProgramIds
import net.selvedge.engine.ReviewContext
import net.selvedge.engine.ReviewResult
import net.selvedge.engine.RiskVerdict
import net.selvedge.engine.RuleInput
import net.selvedge.engine.SimulationOutcome
import net.selvedge.engine.SimulationRpcClient
import net.selvedge.engine.SimulationStatus
import net.selvedge.engine.assessRisk
import net.selvedge.engine.decodeTransactionBase64
import net.selvedge.engine.explainReview
import net.selvedge.wallet.data.AppSettings

class ReviewOutcome(
    val transactionBase64: String,
    val result: ReviewResult,
    val simulationUnavailableReason: String?,
    val effectiveVerdict: RiskVerdict,
)

class ReviewFailedException(message: String, cause: Throwable) : Exception(message, cause)

private val INFRASTRUCTURE_ADDRESSES = listOf(ProgramIds.SYSTEM, ProgramIds.TOKEN, ProgramIds.TOKEN_2022, ProgramIds.MANDATE)

/** Without a simulation the balance changes are unknown, so a clean verdict is never shown as safe. */
fun effectiveVerdictFor(verdict: RiskVerdict, simulationAvailable: Boolean): RiskVerdict =
    if (verdict == RiskVerdict.SAFE && !simulationAvailable) RiskVerdict.CAUTION else verdict

class ReviewService(private val ioDispatcher: CoroutineDispatcher = Dispatchers.IO) {
    private fun simulate(transactionBase64: String, watchedAddresses: List<String>, settings: AppSettings): Pair<SimulationOutcome?, String?> {
        if (!settings.simulationEnabled) return null to "Simulation is turned off in settings."
        return try {
            SimulationRpcClient(settings.rpcUrl).simulate(transactionBase64, watchedAddresses) to null
        } catch (failure: EngineException) {
            null to (failure.message ?: "Simulation failed")
        }
    }

    suspend fun review(
        transactionBase64: String,
        walletAddress: String,
        trustedPayees: List<String>,
        settings: AppSettings,
    ): ReviewOutcome = withContext(ioDispatcher) {
        val reviewContext = ReviewContext(listOf(walletAddress), INFRASTRUCTURE_ADDRESSES + trustedPayees, emptyList())
        try {
            val decoded = decodeTransactionBase64(transactionBase64)
            val (simulation, unavailableReason) = simulate(transactionBase64, decoded.resolvedAccountKeys.distinct(), settings)
            val deltas = simulation?.deltas ?: emptyList()
            val status = simulation?.let { outcome -> SimulationStatus(outcome.succeeded, outcome.errorDescription) }
            val assessment = assessRisk(RuleInput(decoded, deltas, status, reviewContext))
            val result = ReviewResult(decoded, simulation, assessment, explainReview(assessment, deltas, reviewContext))
            ReviewOutcome(transactionBase64, result, unavailableReason, effectiveVerdictFor(assessment.verdict, simulation != null))
        } catch (failure: EngineException) {
            throw ReviewFailedException("This transaction could not be read: ${failure.message}", failure)
        } catch (failure: IllegalArgumentException) {
            throw ReviewFailedException("This transaction is not valid base64.", failure)
        }
    }
}
