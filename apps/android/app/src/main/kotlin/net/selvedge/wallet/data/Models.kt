package net.selvedge.wallet.data

import java.math.BigInteger
import kotlinx.serialization.Serializable
import net.selvedge.engine.Base58
import net.selvedge.engine.LimitUpdate
import net.selvedge.engine.MandateState

@Serializable
data class StoredMandate(
    val owner: String,
    val agent: String,
    val securityAuthority: String,
    val periodCap: String,
    val periodSeconds: Long,
    val periodStart: Long,
    val spentInPeriod: String,
    val expiry: Long,
    val revoked: Boolean,
    val nonce: String,
    val allowedPrograms: List<String>,
    val allowedPayees: List<String>,
    val allowedTools: List<String>,
)

@Serializable
data class AgentRecord(val id: String, val name: String, val mandate: StoredMandate, val createdAt: Long)

enum class ActivityKind { REVIEW_APPROVED, REVIEW_REJECTED, REVIEW_VETOED, AGENT_SPAWNED, MANDATE_UPDATED, MANDATE_REVOKED }

@Serializable
data class ActivityEntry(val id: String, val timestamp: Long, val kind: ActivityKind, val title: String, val detail: String)

@Serializable
data class WalletConnection(val backend: String, val publicKey: String)

@Serializable
data class AppSettings(val rpcUrl: String = DEFAULT_RPC_URL, val simulationEnabled: Boolean = true) {
    companion object {
        const val DEFAULT_RPC_URL = "https://api.devnet.solana.com"
    }
}

private const val KEY_HEX_LENGTH = 64

fun base58ToHexKey(address: String): String {
    val bytes = Base58.decode(address)
    require(bytes.size == KEY_HEX_LENGTH / 2) { "Address $address is not a 32-byte public key" }
    return bytes.joinToString("") { byte -> "%02x".format(byte) }
}

fun hexKeyToBase58(hexKey: String): String {
    require(hexKey.length == KEY_HEX_LENGTH) { "Key is not 64 hex characters" }
    val bytes = ByteArray(hexKey.length / 2) { index -> hexKey.substring(index * 2, index * 2 + 2).toInt(16).toByte() }
    return Base58.encode(bytes)
}

fun StoredMandate.toEngineState(): MandateState = MandateState(
    owner = base58ToHexKey(owner),
    agent = base58ToHexKey(agent),
    securityAuthority = base58ToHexKey(securityAuthority),
    periodCap = BigInteger(periodCap),
    periodSeconds = BigInteger.valueOf(periodSeconds),
    periodStart = BigInteger.valueOf(periodStart),
    spentInPeriod = BigInteger(spentInPeriod),
    expiry = BigInteger.valueOf(expiry),
    revoked = revoked,
    nonce = BigInteger(nonce),
    allowedPrograms = allowedPrograms.map(::base58ToHexKey),
    allowedPayees = allowedPayees.map(::base58ToHexKey),
    allowedTools = allowedTools.map { toolId -> BigInteger(toolId) },
)

fun StoredMandate.withEngineState(state: MandateState): StoredMandate = copy(
    agent = hexKeyToBase58(state.agent),
    periodCap = state.periodCap.toString(),
    periodSeconds = state.periodSeconds.toLong(),
    periodStart = state.periodStart.toLong(),
    spentInPeriod = state.spentInPeriod.toString(),
    expiry = state.expiry.toLong(),
    revoked = state.revoked,
    nonce = state.nonce.toString(),
    allowedPrograms = state.allowedPrograms.map(::hexKeyToBase58),
    allowedPayees = state.allowedPayees.map(::hexKeyToBase58),
    allowedTools = state.allowedTools.map { toolId -> toolId.toString() },
)

fun MandateDraft.toLimitUpdate(): LimitUpdate = LimitUpdate(
    periodCap = BigInteger(periodCap),
    periodSeconds = BigInteger.valueOf(periodSeconds),
    expiry = BigInteger.valueOf(expiry),
    allowedPrograms = allowedPrograms.map(::base58ToHexKey),
    allowedPayees = allowedPayees.map(::base58ToHexKey),
    allowedTools = allowedTools.map { toolId -> BigInteger(toolId) },
)

data class MandateDraft(
    val periodCap: String,
    val periodSeconds: Long,
    val expiry: Long,
    val allowedPrograms: List<String>,
    val allowedPayees: List<String>,
    val allowedTools: List<String>,
)
