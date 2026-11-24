package net.selvedge.wallet.signing

import java.security.SecureRandom
import java.util.Base64
import net.selvedge.engine.Base58
import net.selvedge.engine.SigningPermit
import net.selvedge.wallet.data.KeyValueStorage
import org.bouncycastle.crypto.params.Ed25519PrivateKeyParameters
import org.bouncycastle.crypto.signers.Ed25519Signer

private const val SEED_STORAGE_KEY = "test_wallet_seed"
private const val SEED_BYTE_LENGTH = 32

/**
 * Software key for emulators and tests. It is not hardware-backed and is labelled as such everywhere it appears.
 * Ed25519 comes from BouncyCastle because the platform provider for the name "Ed25519" is the Android Keystore,
 * which cannot generate exportable software keys.
 */
class TestWalletBackend(private val storage: KeyValueStorage) : SigningBackend {
    override val kind = BackendKind.TEST_WALLET
    override val honestLabel = "Test wallet (software key, not hardware)"

    private fun loadOrCreatePrivateKey(): Ed25519PrivateKeyParameters {
        val storedSeed = storage.read(SEED_STORAGE_KEY)
        if (storedSeed != null) return Ed25519PrivateKeyParameters(Base64.getDecoder().decode(storedSeed), 0)
        val seed = ByteArray(SEED_BYTE_LENGTH).also { bytes -> SecureRandom().nextBytes(bytes) }
        storage.write(SEED_STORAGE_KEY, Base64.getEncoder().encodeToString(seed))
        return Ed25519PrivateKeyParameters(seed, 0)
    }

    fun rawPublicKey(): ByteArray = loadOrCreatePrivateKey().generatePublicKey().encoded

    override suspend fun connect(): String = Base58.encode(rawPublicKey())

    override suspend fun signTransactionMessage(message: ByteArray, permit: SigningPermit): ByteArray {
        val signer = Ed25519Signer()
        signer.init(true, loadOrCreatePrivateKey())
        signer.update(message, 0, message.size)
        return signer.generateSignature()
    }
}
