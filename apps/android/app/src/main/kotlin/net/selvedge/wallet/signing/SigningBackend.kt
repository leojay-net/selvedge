package net.selvedge.wallet.signing

import net.selvedge.engine.SigningPermit

enum class BackendKind(val storedName: String) {
    SEED_VAULT("seed_vault"),
    TEST_WALLET("test_wallet"),
}

class SigningFailedException(message: String, cause: Throwable? = null) : Exception(message, cause)

/**
 * Every signature goes through this interface and requires a [SigningPermit], which only
 * [net.selvedge.engine.SigningGate] can issue after the review and any biometric override.
 */
interface SigningBackend {
    val kind: BackendKind
    val honestLabel: String

    suspend fun connect(): String

    suspend fun signTransactionMessage(message: ByteArray, permit: SigningPermit): ByteArray
}
