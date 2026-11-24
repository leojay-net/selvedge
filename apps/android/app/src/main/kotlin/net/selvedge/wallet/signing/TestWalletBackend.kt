package net.selvedge.wallet.signing

import java.security.KeyFactory
import java.security.KeyPair
import java.security.KeyPairGenerator
import java.security.Signature
import java.security.spec.PKCS8EncodedKeySpec
import java.security.spec.X509EncodedKeySpec
import java.util.Base64
import net.selvedge.engine.Base58
import net.selvedge.engine.SigningPermit
import net.selvedge.wallet.data.KeyValueStorage

private const val ED25519 = "Ed25519"
private const val PRIVATE_KEY_STORAGE_KEY = "test_wallet_private"
private const val PUBLIC_KEY_STORAGE_KEY = "test_wallet_public"
private const val X509_ED25519_PREFIX_LENGTH = 12
private const val PUBLIC_KEY_LENGTH = 32

private val X509_ED25519_PREFIX = byteArrayOf(0x30, 0x2a, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x70, 0x03, 0x21, 0x00)

/** Software key for emulators and tests. It is not hardware-backed and is labelled as such everywhere it appears. */
class TestWalletBackend(private val storage: KeyValueStorage) : SigningBackend {
    override val kind = BackendKind.TEST_WALLET
    override val honestLabel = "Test wallet (software key, not hardware)"

    private fun loadOrCreateKeyPair(): KeyPair {
        val storedPrivate = storage.read(PRIVATE_KEY_STORAGE_KEY)
        val storedPublic = storage.read(PUBLIC_KEY_STORAGE_KEY)
        val factory = KeyFactory.getInstance(ED25519)
        if (storedPrivate != null && storedPublic != null) {
            val privateKey = factory.generatePrivate(PKCS8EncodedKeySpec(Base64.getDecoder().decode(storedPrivate)))
            val publicKey = factory.generatePublic(X509EncodedKeySpec(Base64.getDecoder().decode(storedPublic)))
            return KeyPair(publicKey, privateKey)
        }
        val generated = KeyPairGenerator.getInstance(ED25519).generateKeyPair()
        storage.write(PRIVATE_KEY_STORAGE_KEY, Base64.getEncoder().encodeToString(generated.private.encoded))
        storage.write(PUBLIC_KEY_STORAGE_KEY, Base64.getEncoder().encodeToString(generated.public.encoded))
        return generated
    }

    fun rawPublicKey(): ByteArray {
        val encoded = loadOrCreateKeyPair().public.encoded
        check(encoded.size == X509_ED25519_PREFIX_LENGTH + PUBLIC_KEY_LENGTH) { "Unexpected Ed25519 public key encoding length ${encoded.size}" }
        check(encoded.copyOfRange(0, X509_ED25519_PREFIX_LENGTH).contentEquals(X509_ED25519_PREFIX)) { "Unexpected Ed25519 public key prefix" }
        return encoded.copyOfRange(X509_ED25519_PREFIX_LENGTH, encoded.size)
    }

    override suspend fun connect(): String = Base58.encode(rawPublicKey())

    override suspend fun signTransactionMessage(message: ByteArray, permit: SigningPermit): ByteArray {
        val signer = Signature.getInstance(ED25519)
        signer.initSign(loadOrCreateKeyPair().private)
        signer.update(message)
        return signer.sign()
    }
}
