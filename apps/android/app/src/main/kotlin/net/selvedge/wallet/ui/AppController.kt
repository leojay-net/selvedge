package net.selvedge.wallet.ui

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import java.math.BigInteger
import java.util.Base64
import java.util.UUID
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.launch
import net.selvedge.engine.PolicyRejection
import net.selvedge.engine.authorizeLimitUpdate
import net.selvedge.engine.authorizeRevoke
import net.selvedge.wallet.AppContainer
import net.selvedge.wallet.biometric.BiometricAuthenticator
import net.selvedge.wallet.data.ActivityEntry
import net.selvedge.wallet.data.AgentRecord
import net.selvedge.wallet.data.ActivityKind
import net.selvedge.wallet.data.MandateDraft
import net.selvedge.wallet.data.StoredMandate
import net.selvedge.wallet.data.WalletConnection
import net.selvedge.wallet.data.base58ToHexKey
import net.selvedge.wallet.data.describeRejection
import net.selvedge.wallet.data.toEngineState
import net.selvedge.wallet.data.toLimitUpdate
import net.selvedge.wallet.data.withEngineState
import net.selvedge.wallet.review.ReviewFailedException
import net.selvedge.wallet.review.ReviewFlow
import net.selvedge.wallet.signing.ActivityLauncherBridge
import net.selvedge.wallet.signing.BackendKind
import net.selvedge.wallet.signing.SigningBackend
import net.selvedge.wallet.signing.SigningFailedException

sealed interface Destination {
    data object Onboarding : Destination
    data object Agents : Destination
    data object Activity : Destination
    data object Settings : Destination
    data object SpawnAgent : Destination
    data class MandateEditor(val agentId: String) : Destination
    data class Revoke(val agentId: String) : Destination
    data object ReviewPaste : Destination
    data class TransactionReview(val flow: ReviewFlow) : Destination
}

private const val MILLIS_PER_SECOND = 1000L

class AppController(
    val container: AppContainer,
    private val launcher: ActivityLauncherBridge,
    private val biometric: BiometricAuthenticator,
    private val scope: CoroutineScope,
    private val clock: () -> Long = System::currentTimeMillis,
) {
    val backStack = mutableStateListOf<Destination>()
    var connecting by mutableStateOf(false)
        private set
    var connectError by mutableStateOf<String?>(null)
        private set
    var reviewBusy by mutableStateOf(false)
        private set
    var reviewError by mutableStateOf<String?>(null)
        private set
    var mandateError by mutableStateOf<String?>(null)
        private set

    private val store get() = container.store

    init {
        backStack.add(if (store.connection.value == null) Destination.Onboarding else Destination.Agents)
    }

    val current: Destination get() = backStack.last()

    fun navigate(destination: Destination) {
        mandateError = null
        reviewError = null
        backStack.add(destination)
    }

    fun switchTab(destination: Destination) {
        backStack.clear()
        backStack.add(destination)
    }

    fun back() {
        mandateError = null
        reviewError = null
        if (backStack.size > 1) backStack.removeAt(backStack.lastIndex)
    }

    private fun nowSeconds(): Long = clock() / MILLIS_PER_SECOND

    private fun activeBackend(): SigningBackend {
        val connection = store.connection.value ?: throw SigningFailedException("No wallet is connected")
        val kind = BackendKind.entries.first { candidate -> candidate.storedName == connection.backend }
        return container.backendFor(kind, launcher)
    }

    fun connect(kind: BackendKind) {
        connecting = true
        connectError = null
        scope.launch {
            try {
                val backend = container.backendFor(kind, launcher)
                val publicKey = backend.connect()
                store.saveConnection(WalletConnection(kind.storedName, publicKey))
                switchTab(Destination.Agents)
            } catch (failure: SigningFailedException) {
                connectError = failure.message
            } catch (failure: java.security.GeneralSecurityException) {
                connectError = "This device cannot create the test key: ${failure.message}"
            } finally {
                connecting = false
            }
        }
    }

    fun disconnect() {
        store.saveConnection(null)
        switchTab(Destination.Onboarding)
    }

    fun spawnAgent(name: String, agentKey: String, draft: MandateDraft) {
        val owner = store.connection.value?.publicKey ?: return
        val now = nowSeconds()
        val mandate = StoredMandate(
            owner = owner,
            agent = agentKey.trim(),
            securityAuthority = owner,
            periodCap = draft.periodCap,
            periodSeconds = draft.periodSeconds,
            periodStart = now,
            spentInPeriod = "0",
            expiry = draft.expiry,
            revoked = false,
            nonce = "0",
            allowedPrograms = draft.allowedPrograms,
            allowedPayees = draft.allowedPayees,
            allowedTools = draft.allowedTools,
        )
        store.saveAgent(AgentRecord(UUID.randomUUID().toString(), name.trim(), mandate, clock()))
        recordActivity(ActivityKind.AGENT_SPAWNED, "Agent ${name.trim()} created", "Mandate recorded on this device")
        back()
    }

    fun updateMandate(agentId: String, draft: MandateDraft) {
        val agent = store.findAgent(agentId) ?: return
        try {
            val updated = authorizeLimitUpdate(agent.mandate.toEngineState(), base58ToHexKey(agent.mandate.owner), draft.toLimitUpdate(), BigInteger.valueOf(nowSeconds()))
            store.saveAgent(agent.copy(mandate = agent.mandate.withEngineState(updated)))
            recordActivity(ActivityKind.MANDATE_UPDATED, "Mandate updated for ${agent.name}", "Limits changed by the owner")
            back()
        } catch (rejection: PolicyRejection) {
            mandateError = describeRejection(rejection)
        }
    }

    fun revokeAgent(agentId: String) {
        val agent = store.findAgent(agentId) ?: return
        try {
            val revoked = authorizeRevoke(agent.mandate.toEngineState(), base58ToHexKey(agent.mandate.owner))
            store.saveAgent(agent.copy(mandate = agent.mandate.withEngineState(revoked)))
            recordActivity(ActivityKind.MANDATE_REVOKED, "Mandate revoked for ${agent.name}", "The agent can no longer spend")
            backStack.clear()
            backStack.add(Destination.Agents)
        } catch (rejection: PolicyRejection) {
            mandateError = describeRejection(rejection)
        }
    }

    fun beginReview(transactionBase64: String) {
        val connection = store.connection.value ?: return
        reviewBusy = true
        reviewError = null
        scope.launch {
            try {
                val bytes = Base64.getDecoder().decode(transactionBase64.trim())
                val trustedPayees = store.agents.value.filter { agent -> !agent.mandate.revoked }.flatMap { agent -> agent.mandate.allowedPayees }
                val outcome = container.reviewService.review(transactionBase64.trim(), connection.publicKey, trustedPayees, store.settings.value)
                navigate(Destination.TransactionReview(ReviewFlow(outcome, bytes, connection.publicKey, activeBackend(), biometric, store)))
            } catch (failure: ReviewFailedException) {
                reviewError = failure.message
            } catch (failure: IllegalArgumentException) {
                reviewError = "This is not valid base64."
            } catch (failure: SigningFailedException) {
                reviewError = failure.message
            } finally {
                reviewBusy = false
            }
        }
    }

    private fun recordActivity(kind: ActivityKind, title: String, detail: String) {
        store.appendActivity(ActivityEntry(UUID.randomUUID().toString(), clock(), kind, title, detail))
    }
}
