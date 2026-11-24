package net.selvedge.engine

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertTrue

class SigningGateTest {
    @Test
    fun dangerVerdictCannotBeApprovedWithoutBiometric() {
        val gate = SigningGate(RiskVerdict.DANGER)
        assertTrue(gate.requiresBiometric)
        assertFailsWith<GateViolation> { gate.confirmWithoutBiometric() }
        assertFailsWith<GateViolation> { gate.permitForSigning() }
    }

    @Test
    fun biometricSuccessBeforeAcknowledgingTheWarningIsRefused() {
        val gate = SigningGate(RiskVerdict.DANGER)
        assertFailsWith<GateViolation> { gate.biometricSucceeded() }
        assertFailsWith<GateViolation> { gate.permitForSigning() }
    }

    @Test
    fun dangerVerdictIsApprovedAfterWarningAndBiometricSuccess() {
        val gate = SigningGate(RiskVerdict.DANGER)
        gate.acknowledgeWarning()
        gate.biometricSucceeded()
        assertEquals(GateStage.APPROVED, gate.stage)
        assertEquals(RiskVerdict.DANGER, gate.permitForSigning().verdict)
    }

    @Test
    fun biometricFailureRejectsAndNeverYieldsAPermit() {
        val gate = SigningGate(RiskVerdict.DANGER)
        gate.acknowledgeWarning()
        gate.biometricFailed()
        assertEquals(GateStage.REJECTED, gate.stage)
        assertFailsWith<GateViolation> { gate.permitForSigning() }
        assertFailsWith<GateViolation> { gate.biometricSucceeded() }
    }

    @Test
    fun everyCallSequenceOnADangerGateWithoutBiometricSuccessYieldsNoPermit() {
        val operations: List<(SigningGate) -> Unit> = listOf(
            { gate -> gate.acknowledgeWarning() },
            { gate -> gate.confirmWithoutBiometric() },
            { gate -> gate.biometricFailed() },
            { gate -> gate.reject() },
        )
        for (first in operations) for (second in operations) for (third in operations) {
            val gate = SigningGate(RiskVerdict.DANGER)
            for (operation in listOf(first, second, third)) runCatching { operation(gate) }
            assertFailsWith<GateViolation> { gate.permitForSigning() }
        }
    }

    @Test
    fun nonDangerVerdictsConfirmWithOneTapAndRefuseBiometricShortcut() {
        for (verdict in listOf(RiskVerdict.SAFE, RiskVerdict.CAUTION)) {
            val gate = SigningGate(verdict)
            assertFailsWith<GateViolation> { gate.biometricSucceeded() }
            gate.confirmWithoutBiometric()
            assertEquals(verdict, gate.permitForSigning().verdict)
        }
    }
}
