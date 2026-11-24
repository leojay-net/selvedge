package net.selvedge.wallet.mwa

import android.content.Context
import android.net.Uri
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import com.solana.mobilewalletadapter.walletlib.association.AssociationUri
import com.solana.mobilewalletadapter.walletlib.authorization.AuthIssuerConfig
import com.solana.mobilewalletadapter.walletlib.protocol.MobileWalletAdapterConfig
import com.solana.mobilewalletadapter.walletlib.scenario.AuthorizeRequest
import com.solana.mobilewalletadapter.walletlib.scenario.DeauthorizedEvent
import com.solana.mobilewalletadapter.walletlib.scenario.LocalScenario
import com.solana.mobilewalletadapter.walletlib.scenario.ReauthorizeRequest
import com.solana.mobilewalletadapter.walletlib.scenario.Scenario
import com.solana.mobilewalletadapter.walletlib.scenario.SignAndSendTransactionsRequest
import com.solana.mobilewalletadapter.walletlib.scenario.SignMessagesRequest
import com.solana.mobilewalletadapter.walletlib.scenario.SignTransactionsRequest
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.launch
import net.selvedge.engine.Base58
import net.selvedge.wallet.AppContainer
import net.selvedge.wallet.biometric.BiometricAuthenticator
import net.selvedge.wallet.data.WalletConnection
import net.selvedge.wallet.review.FlowState
import net.selvedge.wallet.review.ReviewFailedException
import net.selvedge.wallet.review.ReviewFlow
import net.selvedge.wallet.signing.ActivityLauncherBridge
import net.selvedge.wallet.signing.BackendKind

sealed interface MwaScreen {
    data object Waiting : MwaScreen
    data class Authorize(val dappName: String, val request: AuthorizeRequest, val connection: WalletConnection) : MwaScreen
    data class Review(val flow: ReviewFlow, val position: Int, val total: Int, val dappName: String) : MwaScreen
    data class Problem(val message: String) : MwaScreen
}

private const val SUPPORTED_MAX_TRANSACTIONS = 10
private const val SUPPORTED_MAX_MESSAGES = 10
private const val NO_CONNECTION_WARNING_MILLIS = 3000L
private const val WALLET_NAME = "Selvedge"
private const val PAYLOAD_TRANSACTION_VERSION = 0

/** Hosts one Mobile Wallet Adapter session: authorize, then review and sign each requested transaction. */
class MwaSession(
    private val context: Context,
    private val container: AppContainer,
    private val launcher: ActivityLauncherBridge,
    private val biometric: BiometricAuthenticator,
    private val scope: CoroutineScope,
    private val onFinished: () -> Unit,
) : LocalScenario.Callbacks {
    var screen by mutableStateOf<MwaScreen>(MwaScreen.Waiting)
        private set

    private var scenario: Scenario? = null
    private val pendingReview = HashMap<ReviewFlow, CompletableDeferred<Unit>>()

    fun start(associationUri: Uri) {
        val parsed = AssociationUri.parse(associationUri)
        if (parsed == null) {
            screen = MwaScreen.Problem("This wallet link is not a valid Mobile Wallet Adapter request.")
            return
        }
        val configuration = MobileWalletAdapterConfig(false, SUPPORTED_MAX_TRANSACTIONS, SUPPORTED_MAX_MESSAGES, arrayOf<Any>(MobileWalletAdapterConfig.LEGACY_TRANSACTION_VERSION, PAYLOAD_TRANSACTION_VERSION), NO_CONNECTION_WARNING_MILLIS)
        val created = parsed.createScenario(context, configuration, AuthIssuerConfig(WALLET_NAME), this)
        scenario = created
        created.start()
    }

    fun close() {
        scenario?.close()
        scenario = null
    }

    fun reviewFinished(flow: ReviewFlow) {
        pendingReview.remove(flow)?.complete(Unit)
    }

    private fun connectedWallet(): WalletConnection? = container.store.connection.value

    private fun backendKind(connection: WalletConnection): BackendKind = BackendKind.entries.first { kind -> kind.storedName == connection.backend }

    override fun onAuthorizeRequest(request: AuthorizeRequest) {
        scope.launch {
            val connection = connectedWallet()
            if (connection == null) {
                request.completeWithDecline()
                screen = MwaScreen.Problem("Open Selvedge and connect a wallet first, then try again from the app.")
                return@launch
            }
            screen = MwaScreen.Authorize(request.identityName ?: "An app", request, connection)
        }
    }

    fun approveAuthorization(request: AuthorizeRequest, connection: WalletConnection) {
        request.completeWithAuthorize(Base58.decode(connection.publicKey), WALLET_NAME, null, null)
        screen = MwaScreen.Waiting
    }

    fun declineAuthorization(request: AuthorizeRequest) {
        request.completeWithDecline()
        screen = MwaScreen.Waiting
    }

    override fun onReauthorizeRequest(request: ReauthorizeRequest) {
        request.completeWithReauthorize()
    }

    override fun onSignTransactionsRequest(request: SignTransactionsRequest) {
        scope.launch { handleSignRequest(request) }
    }

    private suspend fun handleSignRequest(request: SignTransactionsRequest) {
        val connection = connectedWallet()
        if (connection == null || !Base58.decode(connection.publicKey).contentEquals(request.authorizedPublicKey)) {
            request.completeWithAuthorizationNotValid()
            return
        }
        val dappName = request.identityName ?: "An app"
        val backend = container.backendFor(backendKind(connection), launcher)
        val payloads = request.payloads
        val signed = ArrayList<ByteArray>()
        for ((index, payload) in payloads.withIndex()) {
            val flow = try {
                val encoded = java.util.Base64.getEncoder().encodeToString(payload)
                val trustedPayees = container.store.agents.value.filter { agent -> !agent.mandate.revoked }.flatMap { agent -> agent.mandate.allowedPayees }
                val outcome = container.reviewService.review(encoded, connection.publicKey, trustedPayees, container.store.settings.value)
                ReviewFlow(outcome, payload, connection.publicKey, backend, biometric, container.store)
            } catch (failure: ReviewFailedException) {
                val invalid = BooleanArray(payloads.size) { position -> position == index }
                request.completeWithInvalidPayloads(invalid)
                screen = MwaScreen.Problem(failure.message ?: "A transaction could not be read.")
                return
            }
            val finished = CompletableDeferred<Unit>()
            pendingReview[flow] = finished
            screen = MwaScreen.Review(flow, index + 1, payloads.size, dappName)
            finished.await()
            val result = flow.state.value
            if (result !is FlowState.Signed) {
                request.completeWithDecline()
                screen = MwaScreen.Waiting
                return
            }
            signed.add(result.signedTransaction)
        }
        request.completeWithSignedPayloads(signed.toTypedArray())
        screen = MwaScreen.Waiting
    }

    override fun onSignMessagesRequest(request: SignMessagesRequest) {
        request.completeWithDecline()
    }

    override fun onSignAndSendTransactionsRequest(request: SignAndSendTransactionsRequest) {
        request.completeWithDecline()
    }

    override fun onDeauthorizedEvent(event: DeauthorizedEvent) {
        event.complete()
    }

    override fun onLowPowerAndNoConnection() {
        scope.launch { screen = MwaScreen.Problem("Battery saver is on and no app has connected. Turn it off and try again.") }
    }

    override fun onScenarioReady() = Unit
    override fun onScenarioServingClients() = Unit
    override fun onScenarioServingComplete() {
        scope.launch { onFinished() }
    }

    override fun onScenarioComplete() {
        scope.launch { onFinished() }
    }

    override fun onScenarioError() {
        scope.launch { screen = MwaScreen.Problem("The connection to the app was lost.") }
    }

    override fun onScenarioTeardownComplete() = Unit
}
