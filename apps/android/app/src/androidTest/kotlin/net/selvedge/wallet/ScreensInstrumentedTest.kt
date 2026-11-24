package net.selvedge.wallet

import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.test.ExperimentalTestApi
import androidx.compose.ui.test.junit4.accessibility.enableAccessibilityChecks
import androidx.compose.ui.test.assertIsEnabled
import androidx.compose.ui.test.assertIsNotEnabled
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onFirst
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.onRoot
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.tryPerformAccessibilityChecks
import androidx.compose.ui.unit.DpSize
import androidx.test.ext.junit.runners.AndroidJUnit4
import kotlin.test.assertEquals
import kotlin.test.assertTrue
import net.selvedge.engine.ProgramIds
import net.selvedge.engine.RiskVerdict
import net.selvedge.engine.SigningPermit
import net.selvedge.wallet.biometric.BiometricAuthenticator
import net.selvedge.wallet.biometric.BiometricResult
import net.selvedge.wallet.data.ActivityEntry
import net.selvedge.wallet.data.ActivityKind
import net.selvedge.wallet.data.AgentRecord
import net.selvedge.wallet.data.AppSettings
import net.selvedge.wallet.data.MemoryStorage
import net.selvedge.wallet.data.SelvedgeStore
import net.selvedge.wallet.data.StoredMandate
import net.selvedge.wallet.data.WalletConnection
import net.selvedge.wallet.review.FlowState
import net.selvedge.wallet.review.ReviewFlow
import net.selvedge.wallet.signing.BackendKind
import net.selvedge.wallet.signing.SigningBackend
import net.selvedge.wallet.ui.ActivityScreen
import net.selvedge.wallet.ui.AgentListScreen
import net.selvedge.wallet.ui.MandateEditorScreen
import net.selvedge.wallet.ui.OnboardingScreen
import net.selvedge.wallet.ui.ReviewPasteScreen
import net.selvedge.wallet.ui.RevokeScreen
import net.selvedge.wallet.ui.SettingsScreen
import net.selvedge.wallet.ui.SpawnAgentScreen
import net.selvedge.wallet.ui.Tab
import net.selvedge.wallet.ui.TabShell
import net.selvedge.wallet.ui.TransactionReviewScreen
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

private const val PAYEE = "EwBNZzFxdjvp6hXbwJsuovs8epVL7oGN17pYyAG3uNrE"
private const val DANGER_CASE = "unlimited delegation is critical"
private const val SAFE_CASE = "small transfer to a known friend is safe"
private const val CAUTION_CASE = "limited delegation to a stranger is a warning"
private const val DANGER_RED_ARGB = 0xFFFBEDEC.toInt()
private const val SIGNATURE_LENGTH = 64
private const val NOW_SECONDS = 1_800_000_000L

private class CountingBackend : SigningBackend {
    var signatures = 0
    override val kind = BackendKind.TEST_WALLET
    override val honestLabel = "counting test backend"
    override suspend fun connect(): String = PAYEE
    override suspend fun signTransactionMessage(message: ByteArray, permit: SigningPermit): ByteArray {
        signatures += 1
        return ByteArray(SIGNATURE_LENGTH)
    }
}

private class FixedBiometric(private val result: BiometricResult) : BiometricAuthenticator {
    var prompts = 0
    override suspend fun authenticate(title: String, subtitle: String): BiometricResult {
        prompts += 1
        return result
    }
}

private val sampleMandate = StoredMandate(PAYEE, PAYEE, PAYEE, "25000000", 86_400, NOW_SECONDS, "4500000", NOW_SECONDS + 2_592_000, false, "3", listOf(ProgramIds.TOKEN), listOf(PAYEE), listOf("1"))
private val sampleAgent = AgentRecord("agent-1", "Scout", sampleMandate, 1)
private val revokedAgent = AgentRecord("agent-2", "Archivist", sampleMandate.copy(revoked = true), 0)
private val sampleActivity = listOf(
    ActivityEntry("1", 1_800_000_000_000, ActivityKind.REVIEW_VETOED, "Transaction declined", "Do not sign this transaction."),
    ActivityEntry("2", 1_799_990_000_000, ActivityKind.REVIEW_APPROVED, "Transaction signed", "No risks were found in this transaction."),
    ActivityEntry("3", 1_799_980_000_000, ActivityKind.AGENT_SPAWNED, "Agent Scout created", "Mandate recorded on this device"),
)

private class Screen(val name: String, val content: @Composable () -> Unit)

private fun reviewScreen(caseName: String, backend: SigningBackend, biometric: BiometricAuthenticator, flowSink: (ReviewFlow) -> Unit = {}): Screen {
    val sample = SampleReviews.load(caseName)
    val flow = ReviewFlow(sample.outcome, sample.transactionBytes, sample.outcome.result.decoded.feePayer, backend, biometric, SelvedgeStore(MemoryStorage()))
    flowSink(flow)
    return Screen("review-${caseName.take(12).trim().replace(' ', '-')}") { TransactionReviewScreen(flow, onFinished = {}) }
}

private fun catalogue(): List<Screen> {
    val backend = CountingBackend()
    val biometric = FixedBiometric(BiometricResult.Success)
    return listOf(
        Screen("onboarding") { OnboardingScreen(seedVaultInstalled = false, connecting = false, errorMessage = null, onConnect = {}) },
        Screen("agents-empty") { TabShell(Tab.AGENTS, {}) { AgentListScreen(emptyList(), {}, {}, {}) } },
        Screen("agents") { TabShell(Tab.AGENTS, {}) { AgentListScreen(listOf(sampleAgent, revokedAgent), {}, {}, {}) } },
        Screen("spawn") { SpawnAgentScreen(NOW_SECONDS, null, {}, { _, _, _ -> }) },
        Screen("mandate") { MandateEditorScreen(sampleAgent, NOW_SECONDS, null, {}, {}, {}) },
        Screen("revoke") { RevokeScreen(sampleAgent, null, {}, {}) },
        Screen("activity-empty") { TabShell(Tab.ACTIVITY, {}) { ActivityScreen(emptyList(), {}) } },
        Screen("activity") { TabShell(Tab.ACTIVITY, {}) { ActivityScreen(sampleActivity, {}) } },
        Screen("settings") { TabShell(Tab.SETTINGS, {}) { SettingsScreen(WalletConnection("test_wallet", PAYEE), AppSettings(), false, {}, {}) } },
        Screen("review-paste") { ReviewPasteScreen(busy = false, errorMessage = null, onBack = {}, onReview = {}) },
        Screen("review-paste-error") { ReviewPasteScreen(busy = false, errorMessage = "This is not valid base64.", onBack = {}, onReview = {}) },
        reviewScreen(SAFE_CASE, backend, biometric),
        reviewScreen(CAUTION_CASE, backend, biometric),
        reviewScreen(DANGER_CASE, backend, biometric),
    )
}

@RunWith(AndroidJUnit4::class)
@OptIn(ExperimentalTestApi::class)
class ScreensInstrumentedTest {
    @get:Rule
    val composeRule = createComposeRule()

    private fun renderAll(size: DpSize, sizeName: String) {
        val screens = catalogue()
        var index by mutableIntStateOf(0)
        composeRule.setContent { SizedScreen(size) { screens[index].content() } }
        for (position in screens.indices) {
            index = position
            composeRule.waitForIdle()
            val bitmap = ScreenshotSink.save(composeRule.onRoot(), "${screens[position].name}-$sizeName")
            assertTrue(bitmap.width > 0 && bitmap.height > 0, "${screens[position].name} rendered an empty image")
        }
    }

    @Test
    fun everyScreenRendersAtPhoneWidth() = renderAll(ScreenSizes.phone, "phone")

    @Test
    fun everyScreenRendersAtTabletWidth() = renderAll(ScreenSizes.tablet, "tablet")

    @Test
    fun dangerWarningScreenIsRedAndExplainsTheRisk() {
        val screen = reviewScreen(DANGER_CASE, CountingBackend(), FixedBiometric(BiometricResult.Success))
        composeRule.setContent { SizedScreen(ScreenSizes.phone) { screen.content() } }
        composeRule.onAllNodesWithText("Do not sign this transaction", substring = true).onFirst().assertExists()
        composeRule.onNodeWithText("Override with biometrics").assertIsEnabled()
        val bitmap = ScreenshotSink.save(composeRule.onRoot(), "danger-warning-check")
        assertTrue(ScreenshotSink.containsColor(bitmap, DANGER_RED_ARGB, minimumPixels = 1000), "danger screen must use the danger surface")
    }

    @Test
    fun accessibilityChecksPassOnEveryScreenAtPhoneWidth() {
        composeRule.enableAccessibilityChecks()
        val screens = catalogue()
        var index by mutableIntStateOf(0)
        composeRule.setContent { SizedScreen(ScreenSizes.phone) { screens[index].content() } }
        for (position in screens.indices) {
            index = position
            composeRule.waitForIdle()
            composeRule.onRoot().tryPerformAccessibilityChecks()
        }
    }

    @Test
    fun overrideButtonRunsTheBiometricPromptAndOnlyThenSigns() {
        val backend = CountingBackend()
        val biometric = FixedBiometric(BiometricResult.Success)
        var flow: ReviewFlow? = null
        val screen = reviewScreen(DANGER_CASE, backend, biometric) { created -> flow = created }
        composeRule.setContent { SizedScreen(ScreenSizes.phone) { screen.content() } }
        assertEquals(0, backend.signatures)
        composeRule.onNodeWithText("Override with biometrics").performClick()
        composeRule.waitUntil(timeoutMillis = 5_000) { flow?.state?.value is FlowState.Signed }
        assertEquals(1, biometric.prompts)
        assertEquals(1, backend.signatures)
    }

    @Test
    fun failedBiometricLeavesTheDangerTransactionUnsigned() {
        val backend = CountingBackend()
        val biometric = FixedBiometric(BiometricResult.Failure("Fingerprint not recognised"))
        var flow: ReviewFlow? = null
        val screen = reviewScreen(DANGER_CASE, backend, biometric) { created -> flow = created }
        composeRule.setContent { SizedScreen(ScreenSizes.phone) { screen.content() } }
        composeRule.onNodeWithText("Override with biometrics").performClick()
        composeRule.waitUntil(timeoutMillis = 5_000) { flow?.state?.value is FlowState.Failed }
        composeRule.onNodeWithText("Biometric check failed", substring = true).assertExists()
        composeRule.onNodeWithText("Override with biometrics").assertIsNotEnabled()
        assertEquals(0, backend.signatures)
    }

    @Test
    fun decliningTheDangerTransactionNeverSigns() {
        val backend = CountingBackend()
        val biometric = FixedBiometric(BiometricResult.Success)
        val screen = reviewScreen(DANGER_CASE, backend, biometric)
        composeRule.setContent { SizedScreen(ScreenSizes.phone) { screen.content() } }
        composeRule.onNodeWithText("Decline and keep my funds safe").performClick()
        composeRule.waitForIdle()
        assertEquals(0, backend.signatures)
        assertEquals(0, biometric.prompts)
    }

    @Test
    fun safeTransactionSignsWithOneTap() {
        val backend = CountingBackend()
        var flow: ReviewFlow? = null
        val screen = reviewScreen(SAFE_CASE, backend, FixedBiometric(BiometricResult.Success)) { created -> flow = created }
        composeRule.setContent { SizedScreen(ScreenSizes.phone) { screen.content() } }
        composeRule.onNodeWithText("Sign").performClick()
        composeRule.waitUntil(timeoutMillis = 5_000) { flow?.state?.value is FlowState.Signed }
        assertEquals(RiskVerdict.SAFE, flow?.outcome?.effectiveVerdict)
        assertEquals(1, backend.signatures)
    }
}
