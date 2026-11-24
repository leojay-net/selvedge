package net.selvedge.wallet.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.text.BasicText
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.input.KeyboardType
import net.selvedge.engine.ProgramIds
import net.selvedge.engine.RiskVerdict
import net.selvedge.wallet.brand.AppIcon
import net.selvedge.wallet.data.AgentRecord
import net.selvedge.wallet.data.MandateDraft
import net.selvedge.wallet.data.MandateField
import net.selvedge.wallet.data.MandateFormInput
import net.selvedge.wallet.data.MandateFormResult
import net.selvedge.wallet.data.PeriodChoice
import net.selvedge.wallet.data.formatUsdc
import net.selvedge.wallet.data.validateMandateForm
import net.selvedge.wallet.signing.BackendKind
import net.selvedge.wallet.theme.SelvedgeColor
import net.selvedge.wallet.theme.SelvedgeSpace
import net.selvedge.wallet.theme.SelvedgeType

private const val DEFAULT_EXPIRY_DAYS = "30"
private const val DEFAULT_TOOLS = "1"
private const val SECONDS_PER_DAY = 86_400L

@Composable
fun OnboardingScreen(seedVaultInstalled: Boolean, connecting: Boolean, errorMessage: String?, onConnect: (BackendKind) -> Unit) {
    ScreenColumn {
        BrandHeader()
        BasicText("Agents that can only do what you allow.", style = SelvedgeType.large)
        BasicText(
            "Selvedge reviews every transaction in plain English, vetoes the risky ones, and signs only within a mandate you control.",
            style = SelvedgeType.body,
        )
        if (errorMessage != null) StatusBanner(errorMessage, SelvedgeColor.danger, SelvedgeColor.dangerSurface, AppIcon.WARNING)
        SelvedgeCard {
            Column(verticalArrangement = Arrangement.spacedBy(SelvedgeSpace.s12)) {
                BasicText("Seed Vault", style = SelvedgeType.title)
                BasicText(
                    if (seedVaultInstalled) "Keys stay in the Seed Vault and every signature asks you to confirm there."
                    else "Seed Vault was not found on this device. It is available on Solana Mobile hardware or through the Seed Vault simulator.",
                    style = SelvedgeType.body,
                )
                SelvedgeButton("Connect Seed Vault", { onConnect(BackendKind.SEED_VAULT) }, Modifier.fillMaxWidth(), enabled = seedVaultInstalled && !connecting, loading = connecting, icon = AppIcon.KEY)
            }
        }
        SelvedgeCard {
            Column(verticalArrangement = Arrangement.spacedBy(SelvedgeSpace.s12)) {
                BasicText("Test wallet", style = SelvedgeType.title)
                BasicText(
                    "A software key stored on this device, for emulators and demos. It is not hardware-backed. Never put real funds in it.",
                    style = SelvedgeType.body,
                )
                SelvedgeButton("Use test wallet", { onConnect(BackendKind.TEST_WALLET) }, Modifier.fillMaxWidth(), kind = ButtonKind.SECONDARY, enabled = !connecting, icon = AppIcon.WALLET)
            }
        }
    }
}

@Composable
fun AgentListScreen(agents: List<AgentRecord>, onSpawn: () -> Unit, onOpen: (AgentRecord) -> Unit, onReview: () -> Unit) {
    ScreenColumn {
        BrandHeader()
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
            SectionTitle("Agents")
            SelvedgeButton("New agent", onSpawn, icon = AppIcon.PLUS)
        }
        StatusBanner(
            "Mandates are stored on this device and checked with the same rules as the on-chain program. This build does not submit them to Solana.",
            SelvedgeColor.neutral300, SelvedgeColor.neutral0, AppIcon.SHIELD,
        )
        if (agents.isEmpty()) {
            EmptyState("No agents yet", "Create an agent and give it a spending mandate. It can never spend outside it.") {
                SelvedgeButton("Create your first agent", onSpawn, icon = AppIcon.PLUS)
            }
        } else {
            agents.forEach { agent -> AgentCard(agent, onClick = { onOpen(agent) }) }
        }
        SelvedgeButton("Review a transaction", onReview, Modifier.fillMaxWidth(), kind = ButtonKind.SECONDARY, icon = AppIcon.SHIELD)
    }
}

@Composable
private fun AgentCard(agent: AgentRecord, onClick: () -> Unit) {
    val mandate = agent.mandate
    SelvedgeCard(onClick = onClick, modifier = Modifier.semantics(mergeDescendants = true) { role = Role.Button }) {
        Column(verticalArrangement = Arrangement.spacedBy(SelvedgeSpace.s8)) {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                BasicText(agent.name, style = SelvedgeType.title)
                if (mandate.revoked) {
                    VerdictBadge(RiskVerdict.DANGER)
                } else {
                    VerdictBadge(RiskVerdict.SAFE)
                }
            }
            BasicText(if (mandate.revoked) "Revoked. This agent cannot spend." else "Active mandate", style = SelvedgeType.small)
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(SelvedgeSpace.s24)) {
                Column(Modifier.weight(1f)) {
                    BasicText("Cap per period", style = SelvedgeType.caption)
                    BasicText(formatUsdc(mandate.periodCap), style = SelvedgeType.amount)
                }
                Column(Modifier.weight(1f)) {
                    BasicText("Spent this period", style = SelvedgeType.caption)
                    BasicText(formatUsdc(mandate.spentInPeriod), style = SelvedgeType.amount)
                }
            }
        }
    }
}

@Composable
private fun PeriodChooser(selected: PeriodChoice, onSelect: (PeriodChoice) -> Unit) {
    Column(verticalArrangement = Arrangement.spacedBy(SelvedgeSpace.s4)) {
        BasicText("Period", style = SelvedgeType.smallStrong)
        Row(horizontalArrangement = Arrangement.spacedBy(SelvedgeSpace.s8)) {
            PeriodChoice.entries.forEach { choice ->
                SelvedgeButton(
                    choice.label,
                    { onSelect(choice) },
                    Modifier.semantics { this.selected = choice == selected },
                    kind = if (choice == selected) ButtonKind.PRIMARY else ButtonKind.SECONDARY,
                )
            }
        }
    }
}

@Composable
private fun MandateForm(
    initial: MandateFormInput,
    requireAgentKey: Boolean,
    submitLabel: String,
    nowSeconds: Long,
    serverError: String?,
    onSubmit: (MandateFormInput, MandateDraft) -> Unit,
) {
    var name by rememberSaveable { mutableStateOf(initial.name) }
    var agentKey by rememberSaveable { mutableStateOf(initial.agentKey) }
    var cap by rememberSaveable { mutableStateOf(initial.capUsdc) }
    var period by rememberSaveable { mutableStateOf(initial.period) }
    var expiry by rememberSaveable { mutableStateOf(initial.expiryDays) }
    var programs by rememberSaveable { mutableStateOf(initial.programs) }
    var payees by rememberSaveable { mutableStateOf(initial.payees) }
    var tools by rememberSaveable { mutableStateOf(initial.tools) }
    var errors by remember { mutableStateOf<Map<MandateField, String>>(emptyMap()) }

    if (requireAgentKey) {
        SelvedgeField("Agent name", name, { name = it }, errorMessage = errors[MandateField.NAME])
        SelvedgeField("Agent public key", agentKey, { agentKey = it }, errorMessage = errors[MandateField.AGENT_KEY], helper = "The key the agent signs with. Base58.", mono = true)
    }
    SelvedgeField("Spending cap per period (USDC)", cap, { cap = it }, errorMessage = errors[MandateField.CAP], keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal))
    PeriodChooser(period) { period = it }
    SelvedgeField("Expires in (days)", expiry, { expiry = it }, errorMessage = errors[MandateField.EXPIRY], keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number))
    SelvedgeField("Allowed programs", programs, { programs = it }, errorMessage = errors[MandateField.PROGRAMS], helper = "Comma separated addresses. Defaults to the token program.", mono = true, singleLine = false)
    SelvedgeField("Allowed payees", payees, { payees = it }, errorMessage = errors[MandateField.PAYEES], helper = "Comma separated addresses the agent may pay.", mono = true, singleLine = false)
    SelvedgeField("Allowed tools", tools, { tools = it }, errorMessage = errors[MandateField.TOOLS], helper = "Comma separated tool numbers.")
    if (serverError != null) StatusBanner(serverError, SelvedgeColor.danger, SelvedgeColor.dangerSurface, AppIcon.WARNING)
    SelvedgeButton(submitLabel, {
        val input = MandateFormInput(name, agentKey, cap, period, expiry, programs, payees, tools)
        when (val result = validateMandateForm(input, nowSeconds, requireAgentKey)) {
            is MandateFormResult.Valid -> {
                errors = emptyMap()
                onSubmit(input, result.draft)
            }
            is MandateFormResult.Invalid -> errors = result.errors
        }
    }, Modifier.fillMaxWidth())
}

@Composable
fun SpawnAgentScreen(nowSeconds: Long, serverError: String?, onBack: () -> Unit, onSpawn: (String, String, MandateDraft) -> Unit) {
    ScreenColumn {
        TopBarWithBack("New agent", onBack)
        BasicText("An agent can only spend inside this mandate. You can tighten it or revoke it at any time.", style = SelvedgeType.body)
        val initial = MandateFormInput("", "", "25", PeriodChoice.DAY, DEFAULT_EXPIRY_DAYS, ProgramIds.TOKEN, "", DEFAULT_TOOLS)
        MandateForm(initial, true, "Create agent", nowSeconds, serverError) { input, draft -> onSpawn(input.name, input.agentKey, draft) }
    }
}

@Composable
fun MandateEditorScreen(agent: AgentRecord, nowSeconds: Long, serverError: String?, onBack: () -> Unit, onSave: (MandateDraft) -> Unit, onRevoke: () -> Unit) {
    val mandate = agent.mandate
    ScreenColumn {
        TopBarWithBack(agent.name, onBack)
        SelvedgeCard {
            Column(verticalArrangement = Arrangement.spacedBy(SelvedgeSpace.s12)) {
                FactRow("Agent key", mandate.agent, mono = true)
                FactRow("Spent this period", formatUsdc(mandate.spentInPeriod))
                FactRow("Status", if (mandate.revoked) "Revoked" else "Active")
            }
        }
        if (mandate.revoked) {
            StatusBanner("This mandate is revoked. Revocation is final.", SelvedgeColor.danger, SelvedgeColor.dangerSurface, AppIcon.REVOKE)
        } else {
            val remainingDays = ((mandate.expiry - nowSeconds) / SECONDS_PER_DAY).coerceAtLeast(1).toString()
            val initial = MandateFormInput(
                agent.name, mandate.agent, formatUsdc(mandate.periodCap).removeSuffix(" USDC"),
                PeriodChoice.entries.firstOrNull { choice -> choice.seconds == mandate.periodSeconds } ?: PeriodChoice.DAY,
                remainingDays, mandate.allowedPrograms.joinToString(", "), mandate.allowedPayees.joinToString(", "), mandate.allowedTools.joinToString(", "),
            )
            MandateForm(initial, false, "Save mandate", nowSeconds, serverError) { _, draft -> onSave(draft) }
            SelvedgeButton("Revoke this agent", onRevoke, Modifier.fillMaxWidth(), kind = ButtonKind.DANGER, icon = AppIcon.REVOKE)
        }
    }
}

@Composable
fun RevokeScreen(agent: AgentRecord, serverError: String?, onBack: () -> Unit, onConfirm: () -> Unit) {
    ScreenColumn {
        TopBarWithBack("Revoke ${agent.name}", onBack)
        StatusBanner("The agent loses all spending authority immediately. Revocation is final and cannot be undone.", SelvedgeColor.danger, SelvedgeColor.dangerSurface, AppIcon.REVOKE)
        BasicText("To let this agent spend again you would create a new agent and a new mandate.", style = SelvedgeType.body)
        if (serverError != null) StatusBanner(serverError, SelvedgeColor.danger, SelvedgeColor.dangerSurface, AppIcon.WARNING)
        SelvedgeButton("Revoke permanently", onConfirm, Modifier.fillMaxWidth(), kind = ButtonKind.DANGER, icon = AppIcon.REVOKE)
        SelvedgeButton("Keep the mandate", onBack, Modifier.fillMaxWidth(), kind = ButtonKind.SECONDARY)
    }
}
