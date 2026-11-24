package net.selvedge.wallet.review

import java.util.UUID
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import net.selvedge.engine.GateViolation
import net.selvedge.engine.RiskVerdict
import net.selvedge.engine.SigningGate
import net.selvedge.engine.TransactionParseException
import net.selvedge.engine.openEnvelope
import net.selvedge.engine.signerIndexOf
import net.selvedge.wallet.biometric.BiometricAuthenticator
import net.selvedge.wallet.biometric.BiometricResult
import net.selvedge.wallet.data.ActivityEntry
import net.selvedge.wallet.data.ActivityKind
import net.selvedge.wallet.data.SelvedgeStore
import net.selvedge.wallet.signing.SigningBackend
import net.selvedge.wallet.signing.SigningFailedException

sealed interface FlowState {
    data object Reviewing : FlowState
    data object WarningShown : FlowState
    data object AwaitingBiometric : FlowState
    data object Signing : FlowState
    class Signed(val signedTransaction: ByteArray) : FlowState
    data object Rejected : FlowState
    data class Failed(val message: String) : FlowState
}

private const val SHORT_TITLE_LENGTH = 48

/** Walks one transaction through gate three: review, red warning, biometric override, then signing. */
class ReviewFlow(
    val outcome: ReviewOutcome,
    private val transactionBytes: ByteArray,
    private val walletAddress: String,
    private val backend: SigningBackend,
    private val biometric: BiometricAuthenticator,
    private val store: SelvedgeStore,
    private val clock: () -> Long = System::currentTimeMillis,
) {
    private val gate = SigningGate(outcome.effectiveVerdict)
    private val mutableState = MutableStateFlow<FlowState>(if (gate.requiresBiometric) FlowState.WarningShown else FlowState.Reviewing)
    val state: StateFlow<FlowState> = mutableState.asStateFlow()

    val requiresBiometric: Boolean get() = gate.requiresBiometric

    private fun record(kind: ActivityKind, title: String) {
        val summary = outcome.result.explanation.lineSequence().firstOrNull().orEmpty().take(SHORT_TITLE_LENGTH)
        store.appendActivity(ActivityEntry(UUID.randomUUID().toString(), clock(), kind, title, summary))
    }

    fun reject() {
        gate.reject()
        record(if (outcome.effectiveVerdict == RiskVerdict.DANGER) ActivityKind.REVIEW_VETOED else ActivityKind.REVIEW_REJECTED, "Transaction declined")
        mutableState.value = FlowState.Rejected
    }

    suspend fun confirm() {
        try {
            gate.confirmWithoutBiometric()
        } catch (violation: GateViolation) {
            mutableState.value = FlowState.Failed(violation.message ?: "Confirmation refused")
            return
        }
        signAfterGate()
    }

    suspend fun overrideWithBiometric() {
        try {
            gate.acknowledgeWarning()
        } catch (violation: GateViolation) {
            mutableState.value = FlowState.Failed(violation.message ?: "Override refused")
            return
        }
        mutableState.value = FlowState.AwaitingBiometric
        when (val result = biometric.authenticate("Override this warning", "Confirm with your fingerprint or face to sign a transaction flagged as dangerous.")) {
            BiometricResult.Success -> {
                gate.biometricSucceeded()
                signAfterGate()
            }
            is BiometricResult.Failure -> {
                gate.biometricFailed()
                record(ActivityKind.REVIEW_VETOED, "Override failed")
                mutableState.value = FlowState.Failed("Biometric check failed: ${result.reason}")
            }
            is BiometricResult.Unavailable -> {
                gate.biometricFailed()
                record(ActivityKind.REVIEW_VETOED, "Override unavailable")
                mutableState.value = FlowState.Failed(result.reason + " This transaction stays blocked.")
            }
        }
    }

    private suspend fun signAfterGate() {
        mutableState.value = FlowState.Signing
        try {
            val permit = gate.permitForSigning()
            val envelope = openEnvelope(transactionBytes)
            val signerIndex = signerIndexOf(outcome.result.decoded, walletAddress)
            val signature = backend.signTransactionMessage(envelope.messageBytes, permit)
            val signed = envelope.withSignatureAt(signerIndex, signature)
            record(ActivityKind.REVIEW_APPROVED, "Transaction signed")
            mutableState.value = FlowState.Signed(signed)
        } catch (failure: SigningFailedException) {
            mutableState.value = FlowState.Failed(failure.message ?: "Signing failed")
        } catch (failure: TransactionParseException) {
            mutableState.value = FlowState.Failed(failure.message ?: "Signing failed")
        }
    }
}
