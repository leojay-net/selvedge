package net.selvedge.engine

sealed interface Detail {
    data class Text(val value: String) : Detail
    data class Whole(val value: Long) : Detail
    data class Flag(val value: Boolean) : Detail
    data object Nothing : Detail
}

enum class RiskSeverity(val wire: String) { INFO("info"), WARNING("warning"), CRITICAL("critical") }

enum class RiskVerdict(val wire: String) { SAFE("safe"), CAUTION("caution"), DANGER("danger") }

data class DecodedInstruction(
    val programId: String,
    val programLabel: String,
    val known: Boolean,
    val kind: String,
    val accounts: List<String>,
    val details: Map<String, Detail>,
)

data class AddressTableLookup(
    val tableAddress: String,
    val writableIndexes: List<Int>,
    val readonlyIndexes: List<Int>,
)

data class DecodedTransaction(
    val version: String,
    val signatureCount: Int,
    val requiredSignerCount: Int,
    val feePayer: String,
    val requiredSigners: List<String>,
    val recentBlockhash: String,
    val staticAccountKeys: List<String>,
    val addressTableLookups: List<AddressTableLookup>,
    val lookupsResolved: Boolean,
    val resolvedAccountKeys: List<String>,
    val instructions: List<DecodedInstruction>,
)

data class AssetDelta(
    val owner: String,
    val asset: String,
    val before: String,
    val after: String,
    val change: String,
)

data class MintInfo(val mint: String, val tokenProgram: String, val extensions: List<String>)

data class ReviewContext(
    val walletAddresses: List<String>,
    val knownAddresses: List<String>,
    val mintInfo: List<MintInfo>,
)

data class RiskFinding(
    val ruleId: String,
    val severity: RiskSeverity,
    val title: String,
    val detail: String,
    val evidence: Map<String, Detail>,
)

data class RiskAssessment(
    val rulesetVersion: String,
    val findings: List<RiskFinding>,
    val score: Int,
    val verdict: RiskVerdict,
)

data class SimulationStatus(val succeeded: Boolean, val errorDescription: String?)

data class SimulationOutcome(
    val succeeded: Boolean,
    val errorDescription: String?,
    val unitsConsumed: Long?,
    val logs: List<String>,
    val deltas: List<AssetDelta>,
)

data class ReviewResult(
    val decoded: DecodedTransaction,
    val simulation: SimulationOutcome?,
    val assessment: RiskAssessment,
    val explanation: String,
)

open class EngineException(val code: String, message: String) : RuntimeException(message)

class TransactionParseException(message: String) : EngineException("transaction_parse_failed", message)

class SimulationRpcException(message: String) : EngineException("simulation_rpc_failed", message)

class SimulationTimeoutException(rpcMethod: String, timeoutMilliseconds: Int) :
    EngineException("simulation_timeout", "RPC method $rpcMethod exceeded $timeoutMilliseconds ms")

class PolicyRejection(val rejection: String) :
    EngineException("policy_rejected", "Mandate policy rejected the operation: $rejection")
