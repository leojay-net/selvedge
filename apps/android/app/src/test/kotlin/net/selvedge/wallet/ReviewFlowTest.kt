package net.selvedge.wallet

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertIs
import kotlin.test.assertTrue
import kotlinx.coroutines.runBlocking
import net.selvedge.engine.RiskVerdict
import net.selvedge.engine.SigningPermit
import net.selvedge.wallet.biometric.BiometricAuthenticator
import net.selvedge.wallet.biometric.BiometricResult
import net.selvedge.wallet.data.ActivityKind
import net.selvedge.wallet.data.MemoryStorage
import net.selvedge.wallet.data.SelvedgeStore
import net.selvedge.wallet.review.FlowState
import net.selvedge.wallet.review.ReviewFlow
import net.selvedge.wallet.signing.BackendKind
import net.selvedge.wallet.signing.SigningBackend

private const val DANGER_CASE = "unlimited delegation is critical"
private const val SAFE_CASE = "small transfer to a known friend is safe"
private const val SIGNATURE_LENGTH = 64

private class RecordingBackend : SigningBackend {
    var signatureRequests = 0
    override val kind = BackendKind.TEST_WALLET
    override val honestLabel = "recording test backend"
    override suspend fun connect(): String = "unused"
    override suspend fun signTransactionMessage(message: ByteArray, permit: SigningPermit): ByteArray {
        signatureRequests += 1
        return ByteArray(SIGNATURE_LENGTH) { 7 }
    }
}

private class ScriptedBiometric(private val result: BiometricResult) : BiometricAuthenticator {
    var prompts = 0
    override suspend fun authenticate(title: String, subtitle: String): BiometricResult {
        prompts += 1
        return result
    }
}

class ReviewFlowTest {
    private fun flowFor(caseName: String, backend: SigningBackend, biometric: BiometricAuthenticator, store: SelvedgeStore, simulationAvailable: Boolean = true): ReviewFlow {
        val sample = SampleReviews.load(caseName, simulationAvailable)
        return ReviewFlow(sample.outcome, sample.transactionBytes, sample.outcome.result.decoded.feePayer, backend, biometric, store)
    }

    @Test
    fun dangerVerdictStartsOnTheWarningAndCannotBeConfirmedWithoutBiometrics() = runBlocking {
        val backend = RecordingBackend()
        val biometric = ScriptedBiometric(BiometricResult.Success)
        val flow = flowFor(DANGER_CASE, backend, biometric, SelvedgeStore(MemoryStorage()))
        assertEquals(RiskVerdict.DANGER, flow.outcome.effectiveVerdict)
        assertEquals(FlowState.WarningShown, flow.state.value)
        flow.confirm()
        assertIs<FlowState.Failed>(flow.state.value)
        assertEquals(0, backend.signatureRequests)
        assertEquals(0, biometric.prompts)
    }

    @Test
    fun biometricFailureKeepsTheTransactionUnsignedAndRecordsAVeto() = runBlocking {
        val backend = RecordingBackend()
        val store = SelvedgeStore(MemoryStorage())
        val flow = flowFor(DANGER_CASE, backend, ScriptedBiometric(BiometricResult.Failure("cancelled")), store)
        flow.overrideWithBiometric()
        assertIs<FlowState.Failed>(flow.state.value)
        assertEquals(0, backend.signatureRequests)
        assertEquals(ActivityKind.REVIEW_VETOED, store.activity.value.first().kind)
        flow.overrideWithBiometric()
        assertEquals(0, backend.signatureRequests)
    }

    @Test
    fun missingBiometricHardwareBlocksTheOverrideForGood() = runBlocking {
        val backend = RecordingBackend()
        val flow = flowFor(DANGER_CASE, backend, ScriptedBiometric(BiometricResult.Unavailable("No fingerprint is enrolled.")), SelvedgeStore(MemoryStorage()))
        flow.overrideWithBiometric()
        val failed = assertIs<FlowState.Failed>(flow.state.value)
        assertTrue(failed.message.contains("stays blocked"))
        assertEquals(0, backend.signatureRequests)
    }

    @Test
    fun biometricSuccessSignsExactlyOnceAndInsertsTheSignature() = runBlocking {
        val backend = RecordingBackend()
        val biometric = ScriptedBiometric(BiometricResult.Success)
        val store = SelvedgeStore(MemoryStorage())
        val flow = flowFor(DANGER_CASE, backend, biometric, store)
        flow.overrideWithBiometric()
        val signed = assertIs<FlowState.Signed>(flow.state.value)
        assertEquals(1, backend.signatureRequests)
        assertEquals(1, biometric.prompts)
        assertTrue(signed.signedTransaction.isNotEmpty())
        assertEquals(ActivityKind.REVIEW_APPROVED, store.activity.value.first().kind)
    }

    @Test
    fun safeVerdictSignsWithOneConfirmationAndNoBiometricPrompt() = runBlocking {
        val backend = RecordingBackend()
        val biometric = ScriptedBiometric(BiometricResult.Success)
        val flow = flowFor(SAFE_CASE, backend, biometric, SelvedgeStore(MemoryStorage()))
        assertEquals(FlowState.Reviewing, flow.state.value)
        flow.confirm()
        assertIs<FlowState.Signed>(flow.state.value)
        assertEquals(0, biometric.prompts)
    }

    @Test
    fun aCleanVerdictWithoutSimulationIsShownAsCaution() {
        val sample = SampleReviews.load(SAFE_CASE, simulationAvailable = false)
        assertEquals(RiskVerdict.SAFE, sample.outcome.result.assessment.verdict)
        assertEquals(RiskVerdict.CAUTION, sample.outcome.effectiveVerdict)
    }

    @Test
    fun decliningRecordsAnActivityEntryAndNeverSigns() = runBlocking {
        val backend = RecordingBackend()
        val store = SelvedgeStore(MemoryStorage())
        val flow = flowFor(DANGER_CASE, backend, ScriptedBiometric(BiometricResult.Success), store)
        flow.reject()
        assertEquals(FlowState.Rejected, flow.state.value)
        assertEquals(0, backend.signatureRequests)
        assertEquals(ActivityKind.REVIEW_VETOED, store.activity.value.first().kind)
    }
}
