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
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import java.text.DateFormat
import java.util.Date
import net.selvedge.engine.RiskVerdict
import net.selvedge.wallet.brand.AppIcon
import net.selvedge.wallet.data.ActivityEntry
import net.selvedge.wallet.data.ActivityKind
import net.selvedge.wallet.data.AppSettings
import net.selvedge.wallet.data.WalletConnection
import net.selvedge.wallet.signing.BackendKind
import net.selvedge.wallet.theme.SelvedgeColor
import net.selvedge.wallet.theme.SelvedgeSpace
import net.selvedge.wallet.theme.SelvedgeType

private fun verdictFor(kind: ActivityKind): RiskVerdict = when (kind) {
    ActivityKind.REVIEW_APPROVED, ActivityKind.AGENT_SPAWNED, ActivityKind.MANDATE_UPDATED -> RiskVerdict.SAFE
    ActivityKind.REVIEW_REJECTED -> RiskVerdict.CAUTION
    ActivityKind.REVIEW_VETOED, ActivityKind.MANDATE_REVOKED -> RiskVerdict.DANGER
}

private fun kindLabel(kind: ActivityKind): String = when (kind) {
    ActivityKind.REVIEW_APPROVED -> "Signed"
    ActivityKind.REVIEW_REJECTED -> "Declined"
    ActivityKind.REVIEW_VETOED -> "Vetoed"
    ActivityKind.AGENT_SPAWNED -> "Created"
    ActivityKind.MANDATE_UPDATED -> "Updated"
    ActivityKind.MANDATE_REVOKED -> "Revoked"
}

@Composable
fun ActivityScreen(entries: List<ActivityEntry>, onReview: () -> Unit) {
    val formatter = remember { DateFormat.getDateTimeInstance(DateFormat.MEDIUM, DateFormat.SHORT) }
    ScreenColumn {
        BrandHeader()
        SectionTitle("Activity")
        if (entries.isEmpty()) {
            EmptyState("Nothing has happened yet", "Reviews, signatures, vetoes and mandate changes appear here.") {
                SelvedgeButton("Review a transaction", onReview, kind = ButtonKind.SECONDARY, icon = AppIcon.SHIELD)
            }
        } else {
            entries.forEach { entry ->
                SelvedgeCard {
                    Column(verticalArrangement = Arrangement.spacedBy(SelvedgeSpace.s4)) {
                        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                            BasicText(entry.title, style = SelvedgeType.bodyStrong, modifier = Modifier.weight(1f))
                            VerdictBadgeLabelled(verdictFor(entry.kind), kindLabel(entry.kind))
                        }
                        BasicText(entry.detail, style = SelvedgeType.small)
                        BasicText(formatter.format(Date(entry.timestamp)), style = SelvedgeType.caption)
                    }
                }
            }
        }
    }
}

@Composable
private fun VerdictBadgeLabelled(verdict: RiskVerdict, label: String) {
    val style = verdictStyle(verdict)
    Row(
        Modifier.semantics(mergeDescendants = true) { stateDescription = label },
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(SelvedgeSpace.s4),
    ) {
        SelvedgeIcon(style.icon, style.color, size = 16.dp)
        BasicText(label, style = SelvedgeType.caption.copy(color = style.color))
    }
}

@Composable
fun SettingsScreen(
    connection: WalletConnection?,
    settings: AppSettings,
    seedVaultInstalled: Boolean,
    onSaveSettings: (AppSettings) -> Unit,
    onDisconnect: () -> Unit,
) {
    var rpcUrl by remember(settings.rpcUrl) { mutableStateOf(settings.rpcUrl) }
    val usingTestWallet = connection?.backend == BackendKind.TEST_WALLET.storedName
    ScreenColumn {
        BrandHeader()
        SectionTitle("Settings")
        SelvedgeCard {
            Column(verticalArrangement = Arrangement.spacedBy(SelvedgeSpace.s12)) {
                BasicText("Signing wallet", style = SelvedgeType.title)
                FactRow("Backend", if (usingTestWallet) "Test wallet (software key, not hardware)" else "Seed Vault")
                FactRow("Public key", connection?.publicKey ?: "Not connected", mono = true)
                FactRow("Seed Vault on this device", if (seedVaultInstalled) "Found" else "Not found")
                if (usingTestWallet) {
                    StatusBanner("This key lives in app storage. It is for emulators and demos only.", SelvedgeColor.caution, SelvedgeColor.cautionSurface, AppIcon.WARNING)
                }
                SelvedgeButton("Disconnect wallet", onDisconnect, Modifier.fillMaxWidth(), kind = ButtonKind.SECONDARY, enabled = connection != null)
            }
        }
        SelvedgeCard {
            Column(verticalArrangement = Arrangement.spacedBy(SelvedgeSpace.s12)) {
                BasicText("Transaction simulation", style = SelvedgeType.title)
                SelvedgeField("RPC endpoint", rpcUrl, { rpcUrl = it }, mono = true, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Uri), helper = "Used to simulate transactions before you sign. Devnet by default.")
                SelvedgeButton("Save endpoint", { onSaveSettings(settings.copy(rpcUrl = rpcUrl.trim())) }, Modifier.fillMaxWidth(), enabled = rpcUrl.trim().startsWith("https://") && rpcUrl.trim() != settings.rpcUrl)
                SelvedgeButton(
                    if (settings.simulationEnabled) "Turn simulation off" else "Turn simulation on",
                    { onSaveSettings(settings.copy(simulationEnabled = !settings.simulationEnabled)) },
                    Modifier.fillMaxWidth(),
                    kind = ButtonKind.SECONDARY,
                )
                BasicText("With simulation off, a clean result is shown as caution because balance changes are unknown.", style = SelvedgeType.caption)
            }
        }
        SelvedgeCard {
            Column(verticalArrangement = Arrangement.spacedBy(SelvedgeSpace.s8)) {
                BasicText("About", style = SelvedgeType.title)
                BasicText("Selvedge 0.1.0. Fonts Fraunces, Inter and JetBrains Mono are bundled under the SIL Open Font License.", style = SelvedgeType.small)
            }
        }
    }
}
