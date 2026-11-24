package net.selvedge.engine

enum class GateStage { REVIEWING, WARNING_ACKNOWLEDGED, APPROVED, REJECTED }

class GateViolation(message: String) : EngineException("signing_gate_violation", message)

/** Proof that the user cleared every gate for one transaction; only [SigningGate] can create one. */
class SigningPermit internal constructor(val verdict: RiskVerdict)

/**
 * Gate three of the Selvedge defence in depth. A danger verdict cannot reach a [SigningPermit]
 * without a successful biometric prompt, whatever sequence of calls is made.
 */
class SigningGate(private val verdict: RiskVerdict) {
    var stage: GateStage = GateStage.REVIEWING
        private set

    private var permit: SigningPermit? = null

    val requiresBiometric: Boolean get() = verdict == RiskVerdict.DANGER

    fun acknowledgeWarning() {
        if (stage != GateStage.REVIEWING) throw GateViolation("Warning can only be acknowledged while reviewing")
        stage = GateStage.WARNING_ACKNOWLEDGED
    }

    fun confirmWithoutBiometric() {
        if (requiresBiometric) throw GateViolation("A danger verdict requires biometric confirmation")
        if (stage != GateStage.REVIEWING) throw GateViolation("Confirmation is only valid while reviewing")
        approve()
    }

    fun biometricSucceeded() {
        if (!requiresBiometric) throw GateViolation("Biometric confirmation was not requested for this verdict")
        if (stage != GateStage.WARNING_ACKNOWLEDGED) throw GateViolation("The red warning must be acknowledged before the biometric prompt")
        approve()
    }

    fun biometricFailed() {
        if (stage == GateStage.APPROVED) throw GateViolation("The transaction is already approved")
        stage = GateStage.REJECTED
    }

    fun reject() {
        if (stage == GateStage.APPROVED) throw GateViolation("The transaction is already approved")
        stage = GateStage.REJECTED
    }

    fun permitForSigning(): SigningPermit = permit ?: throw GateViolation("No approval has been granted")

    private fun approve() {
        stage = GateStage.APPROVED
        permit = SigningPermit(verdict)
    }
}
