package net.selvedge.wallet.ui

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.slideInVertically
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.text.BasicText
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.runtime.collectAsState
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.launch
import net.selvedge.engine.RiskSeverity
import net.selvedge.engine.RiskVerdict
import net.selvedge.wallet.brand.AppIcon
import net.selvedge.wallet.review.FlowState
import net.selvedge.wallet.review.ReviewFlow
import net.selvedge.wallet.theme.LocalSelvedgeMotion
import net.selvedge.wallet.theme.SelvedgeColor
import net.selvedge.wallet.theme.SelvedgeSpace
import net.selvedge.wallet.theme.SelvedgeType

@Composable
fun ReviewPasteScreen(busy: Boolean, errorMessage: String?, onBack: () -> Unit, onReview: (String) -> Unit) {
    var transaction by rememberSaveable { mutableStateOf("") }
    ScreenColumn {
        TopBarWithBack("Review a transaction", onBack)
        BasicText("Paste a base64 transaction. Selvedge decodes it, simulates it, and explains what it would do before anything is signed.", style = SelvedgeType.body)
        SelvedgeField("Transaction (base64)", transaction, { transaction = it }, errorMessage = errorMessage, mono = true, singleLine = false, enabled = !busy)
        SelvedgeButton("Review", { onReview(transaction) }, Modifier.fillMaxWidth(), enabled = transaction.isNotBlank(), loading = busy, icon = AppIcon.SHIELD)
    }
}

private fun severityVerdict(severity: RiskSeverity): RiskVerdict = when (severity) {
    RiskSeverity.CRITICAL -> RiskVerdict.DANGER
    RiskSeverity.WARNING -> RiskVerdict.CAUTION
    RiskSeverity.INFO -> RiskVerdict.SAFE
}

@Composable
private fun FindingsList(flow: ReviewFlow) {
    val assessment = flow.outcome.result.assessment
    if (assessment.findings.isEmpty()) {
        BasicText("No risk rules matched this transaction.", style = SelvedgeType.body)
        return
    }
    assessment.findings.forEach { finding ->
        SelvedgeCard {
            Column(verticalArrangement = Arrangement.spacedBy(SelvedgeSpace.s8)) {
                VerdictBadge(severityVerdict(finding.severity))
                BasicText(finding.title, style = SelvedgeType.bodyStrong)
                BasicText(finding.detail, style = SelvedgeType.small)
                BasicText(finding.ruleId, style = SelvedgeType.monoSmall)
            }
        }
    }
}

@Composable
private fun ExplanationBlock(flow: ReviewFlow, showHeadline: Boolean = true) {
    val lines = flow.outcome.result.explanation.lines()
    Column(verticalArrangement = Arrangement.spacedBy(SelvedgeSpace.s8)) {
        if (showHeadline) lines.take(1).forEach { headline -> BasicText(headline, style = SelvedgeType.title) }
        lines.drop(1).filter { line -> line.startsWith("You ") }.forEach { movement -> BasicText(movement, style = SelvedgeType.amount) }
    }
}

@Composable
fun TransactionReviewScreen(flow: ReviewFlow, onFinished: () -> Unit) {
    val state by flow.state.collectAsState()
    val scope = rememberCoroutineScope()
    val verdict = flow.outcome.effectiveVerdict
    if (verdict == RiskVerdict.DANGER && state !is FlowState.Signed && state !is FlowState.Rejected) {
        DangerWarningScreen(flow, state, onDecline = { flow.reject(); onFinished() }, onOverride = { scope.launch { flow.overrideWithBiometric() } })
        return
    }
    ScreenColumn {
        TopBarWithBack("Review", onFinished)
        SelvedgeCard {
            Column(verticalArrangement = Arrangement.spacedBy(SelvedgeSpace.s12)) {
                VerdictBadge(verdict)
                ExplanationBlock(flow)
            }
        }
        flow.outcome.simulationUnavailableReason?.let { reason ->
            StatusBanner("Balance changes could not be simulated. $reason", SelvedgeColor.caution, SelvedgeColor.cautionSurface, AppIcon.WARNING)
        }
        BasicText("Findings", style = SelvedgeType.title, modifier = Modifier.semantics { heading() })
        FindingsList(flow)
        FlowResult(state)
        when (state) {
            is FlowState.Signed -> SelvedgeButton("Done", onFinished, Modifier.fillMaxWidth())
            FlowState.Rejected -> SelvedgeButton("Close", onFinished, Modifier.fillMaxWidth(), kind = ButtonKind.SECONDARY)
            else -> {
                SelvedgeButton(
                    if (verdict == RiskVerdict.CAUTION) "Sign anyway" else "Sign",
                    { scope.launch { flow.confirm() } },
                    Modifier.fillMaxWidth(),
                    enabled = state is FlowState.Reviewing || state is FlowState.Failed,
                    loading = state is FlowState.Signing,
                    icon = AppIcon.CHECK,
                )
                SelvedgeButton("Decline", { flow.reject(); onFinished() }, Modifier.fillMaxWidth(), kind = ButtonKind.SECONDARY, enabled = state !is FlowState.Signing)
            }
        }
        BasicText("Nothing is signed until you confirm. Ruleset ${flow.outcome.result.assessment.rulesetVersion}.", style = SelvedgeType.caption)
    }
}

@Composable
private fun FlowResult(state: FlowState) {
    when (state) {
        is FlowState.Signed -> StatusBanner("Signed. The transaction was returned to the app that asked for it.", SelvedgeColor.safe, SelvedgeColor.safeSurface, AppIcon.CHECK)
        FlowState.Rejected -> StatusBanner("Declined. Nothing was signed.", SelvedgeColor.neutral500, SelvedgeColor.neutral0, AppIcon.CLOSE)
        is FlowState.Failed -> StatusBanner(state.message, SelvedgeColor.danger, SelvedgeColor.dangerSurface, AppIcon.WARNING)
        else -> Unit
    }
}

@Composable
fun DangerWarningScreen(flow: ReviewFlow, state: FlowState, onDecline: () -> Unit, onOverride: () -> Unit) {
    val motion = LocalSelvedgeMotion.current
    var visible by remember { mutableStateOf(motion.reduced) }
    LaunchedEffect(Unit) { visible = true }
    ScreenColumn(background = SelvedgeColor.dangerSurface) {
        AnimatedVisibility(
            visible = visible,
            enter = fadeIn(tween(motion.mediumMillis)) + slideInVertically(tween(motion.longMillis)) { fullHeight -> fullHeight / 8 },
        ) {
            Column(verticalArrangement = Arrangement.spacedBy(SelvedgeSpace.s16)) {
                SelvedgeIcon(AppIcon.WARNING, SelvedgeColor.danger, size = 48.dp)
                BasicText("Do not sign this transaction", style = SelvedgeType.large.copy(color = SelvedgeColor.danger), modifier = Modifier.semantics { heading() })
                ExplanationBlock(flow, showHeadline = false)
                FindingsList(flow)
            }
        }
        flow.outcome.simulationUnavailableReason?.let { reason ->
            StatusBanner("Balance changes could not be simulated. $reason", SelvedgeColor.caution, SelvedgeColor.cautionSurface, AppIcon.WARNING)
        }
        if (state is FlowState.Failed) StatusBanner(state.message, SelvedgeColor.danger, SelvedgeColor.neutral0, AppIcon.WARNING)
        SelvedgeButton("Decline and keep my funds safe", onDecline, Modifier.fillMaxWidth(), icon = AppIcon.SHIELD)
        SelvedgeButton(
            "Override with biometrics",
            onOverride,
            Modifier.fillMaxWidth(),
            kind = ButtonKind.DANGER,
            enabled = state is FlowState.WarningShown,
            loading = state is FlowState.AwaitingBiometric || state is FlowState.Signing,
            icon = AppIcon.KEY,
        )
        BasicText("Overriding needs your fingerprint or face. There is no other way past this screen.", style = SelvedgeType.caption)
    }
}
