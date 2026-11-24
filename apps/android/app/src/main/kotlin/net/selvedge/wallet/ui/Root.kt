package net.selvedge.wallet.ui

import androidx.activity.compose.BackHandler
import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.safeDrawing
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import net.selvedge.wallet.theme.LocalSelvedgeMotion
import net.selvedge.wallet.theme.SelvedgeColor
import net.selvedge.wallet.theme.SelvedgeTheme

private const val MILLIS_PER_SECOND = 1000L

private fun tabOf(destination: Destination): Tab? = when (destination) {
    Destination.Agents -> Tab.AGENTS
    Destination.Activity -> Tab.ACTIVITY
    Destination.Settings -> Tab.SETTINGS
    else -> null
}

@Composable
private fun FullScreen(content: @Composable () -> Unit) {
    Box(Modifier.fillMaxSize().background(SelvedgeColor.neutral50).windowInsetsPadding(WindowInsets.safeDrawing)) { content() }
}

@Composable
fun SelvedgeRoot(controller: AppController) {
    SelvedgeTheme {
        val motion = LocalSelvedgeMotion.current
        val destination = controller.current
        BackHandler(enabled = controller.backStack.size > 1) { controller.back() }
        AnimatedContent(
            targetState = destination,
            transitionSpec = { fadeIn(tween(motion.mediumMillis)) togetherWith fadeOut(tween(motion.shortMillis)) },
            label = "destination",
        ) { target ->
            val tab = tabOf(target)
            if (tab != null) {
                TabShell(tab, { selected -> controller.switchTab(selected.destination) }) { TabContent(controller, target) }
            } else {
                FullScreen { DetailContent(controller, target) }
            }
        }
    }
}

@Composable
private fun TabContent(controller: AppController, destination: Destination) {
    val store = controller.container.store
    when (destination) {
        Destination.Agents -> {
            val agents by store.agents.collectAsState()
            AgentListScreen(
                agents,
                onSpawn = { controller.navigate(Destination.SpawnAgent) },
                onOpen = { agent -> controller.navigate(Destination.MandateEditor(agent.id)) },
                onReview = { controller.navigate(Destination.ReviewPaste) },
            )
        }
        Destination.Activity -> {
            val entries by store.activity.collectAsState()
            ActivityScreen(entries, onReview = { controller.navigate(Destination.ReviewPaste) })
        }
        Destination.Settings -> {
            val connection by store.connection.collectAsState()
            val settings by store.settings.collectAsState()
            SettingsScreen(connection, settings, controller.container.seedVaultInstalled, store::saveSettings, controller::disconnect)
        }
        else -> Unit
    }
}

@Composable
private fun DetailContent(controller: AppController, destination: Destination) {
    val store = controller.container.store
    val nowSeconds = System.currentTimeMillis() / MILLIS_PER_SECOND
    when (destination) {
        Destination.Onboarding -> OnboardingScreen(controller.container.seedVaultInstalled, controller.connecting, controller.connectError, controller::connect)
        Destination.SpawnAgent -> SpawnAgentScreen(nowSeconds, controller.mandateError, controller::back) { name, key, draft -> controller.spawnAgent(name, key, draft) }
        is Destination.MandateEditor -> {
            val agents by store.agents.collectAsState()
            agents.firstOrNull { agent -> agent.id == destination.agentId }?.let { agent ->
                MandateEditorScreen(
                    agent, nowSeconds, controller.mandateError, controller::back,
                    onSave = { draft -> controller.updateMandate(agent.id, draft) },
                    onRevoke = { controller.navigate(Destination.Revoke(agent.id)) },
                )
            }
        }
        is Destination.Revoke -> {
            val agents by store.agents.collectAsState()
            agents.firstOrNull { agent -> agent.id == destination.agentId }?.let { agent ->
                RevokeScreen(agent, controller.mandateError, controller::back) { controller.revokeAgent(agent.id) }
            }
        }
        Destination.ReviewPaste -> ReviewPasteScreen(controller.reviewBusy, controller.reviewError, controller::back, controller::beginReview)
        is Destination.TransactionReview -> TransactionReviewScreen(destination.flow, onFinished = controller::back)
        else -> Unit
    }
}
