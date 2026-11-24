package net.selvedge.wallet.signing

import android.content.Context
import android.content.Intent
import android.net.Uri
import com.solanamobile.seedvault.Wallet
import com.solanamobile.seedvault.WalletContractV1
import net.selvedge.engine.Base58
import net.selvedge.engine.SigningPermit

class ActivityOutcome(val resultCode: Int, val data: Intent?)

fun interface ActivityLauncherBridge {
    suspend fun launch(intent: Intent): ActivityOutcome
}

private class VaultAccount(val derivationPath: Uri, val publicKey: ByteArray)

/**
 * Signs through the Seed Vault Wallet SDK. On a device with the Seed Vault this is hardware-backed;
 * on an emulator it can only be backed by the Seed Vault simulator, which makes no security guarantees.
 */
class SeedVaultBackend(
    private val context: Context,
    private val launcher: ActivityLauncherBridge,
) : SigningBackend {
    override val kind = BackendKind.SEED_VAULT
    override val honestLabel = "Seed Vault"

    private var authToken: Long? = null
    private var account: VaultAccount? = null

    private fun firstAuthorizedSeed(): Long? {
        val cursor = Wallet.getAuthorizedSeeds(context, arrayOf(WalletContractV1.AUTHORIZED_SEEDS_AUTH_TOKEN)) ?: return null
        cursor.use { rows -> return if (rows.moveToFirst()) rows.getLong(0) else null }
    }

    private suspend fun authorizeSeedIfNeeded(): Long {
        firstAuthorizedSeed()?.let { return it }
        val outcome = launcher.launch(Wallet.authorizeSeed(context, WalletContractV1.PURPOSE_SIGN_SOLANA_TRANSACTION))
        try {
            return Wallet.onAuthorizeSeedResult(outcome.resultCode, outcome.data)
        } catch (failure: Wallet.ActionFailedException) {
            throw SigningFailedException("Seed Vault did not authorize access: ${failure.message}", failure)
        }
    }

    private fun firstAccount(token: Long): VaultAccount {
        val columns = arrayOf(WalletContractV1.ACCOUNTS_BIP32_DERIVATION_PATH, WalletContractV1.ACCOUNTS_PUBLIC_KEY_RAW)
        val cursor = Wallet.getAccounts(context, token, columns) ?: throw SigningFailedException("Seed Vault returned no account table")
        cursor.use { rows ->
            if (!rows.moveToFirst()) throw SigningFailedException("The authorized seed has no accounts")
            return VaultAccount(Uri.parse(rows.getString(0)), rows.getBlob(1))
        }
    }

    override suspend fun connect(): String {
        val token = authorizeSeedIfNeeded()
        val vaultAccount = firstAccount(token)
        authToken = token
        account = vaultAccount
        return Base58.encode(vaultAccount.publicKey)
    }

    override suspend fun signTransactionMessage(message: ByteArray, permit: SigningPermit): ByteArray {
        val token = authToken ?: throw SigningFailedException("Seed Vault is not connected")
        val vaultAccount = account ?: throw SigningFailedException("Seed Vault is not connected")
        val outcome = launcher.launch(Wallet.signTransaction(context, token, vaultAccount.derivationPath, message))
        try {
            val responses = Wallet.onSignTransactionsResult(outcome.resultCode, outcome.data)
            return responses.first().signatures.first()
        } catch (failure: Wallet.ActionFailedException) {
            throw SigningFailedException("Seed Vault refused to sign: ${failure.message}", failure)
        } catch (failure: NoSuchElementException) {
            throw SigningFailedException("Seed Vault returned no signature", failure)
        }
    }

    companion object {
        fun isInstalled(context: Context): Boolean =
            context.packageManager.resolveContentProvider(WalletContractV1.AUTHORITY_WALLET_PROVIDER, 0) != null
    }
}
