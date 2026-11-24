package net.selvedge.engine

import java.math.BigInteger

object PolicyLimits {
    const val MAX_ALLOWED_PROGRAMS = 4
    const val MAX_ALLOWED_PAYEES = 4
    const val MAX_ALLOWED_TOOLS = 8
    val MIN_PERIOD_SECONDS: BigInteger = BigInteger.valueOf(60)
    val MAX_PERIOD_SECONDS: BigInteger = BigInteger.valueOf(31_536_000)
    val MAX_U64: BigInteger = BigInteger("18446744073709551615")
    val MAX_I64: BigInteger = BigInteger.valueOf(Long.MAX_VALUE)
    val MIN_I64: BigInteger = BigInteger.valueOf(Long.MIN_VALUE)
    const val NULL_KEY = "0000000000000000000000000000000000000000000000000000000000000000"
}

data class MandateState(
    val owner: String,
    val agent: String,
    val securityAuthority: String,
    val periodCap: BigInteger,
    val periodSeconds: BigInteger,
    val periodStart: BigInteger,
    val spentInPeriod: BigInteger,
    val expiry: BigInteger,
    val revoked: Boolean,
    val nonce: BigInteger,
    val allowedPrograms: List<String>,
    val allowedPayees: List<String>,
    val allowedTools: List<BigInteger>,
)

data class SpendRequest(
    val signer: String,
    val amount: BigInteger,
    val toolId: BigInteger,
    val program: String,
    val payee: String,
    val expectedNonce: BigInteger,
)

data class LimitUpdate(
    val periodCap: BigInteger,
    val periodSeconds: BigInteger,
    val expiry: BigInteger,
    val allowedPrograms: List<String>,
    val allowedPayees: List<String>,
    val allowedTools: List<BigInteger>,
)

private fun reject(rejection: String): Nothing = throw PolicyRejection(rejection)

private fun checkedI64(value: BigInteger): BigInteger {
    if (value > PolicyLimits.MAX_I64 || value < PolicyLimits.MIN_I64) reject("ArithmeticOverflow")
    return value
}

private fun isValidAllowlist(length: Int, capacity: Int): Boolean = length in 1..capacity

fun validateLimits(update: LimitUpdate, now: BigInteger) {
    if (update.periodCap.signum() == 0) reject("InvalidCap")
    if (update.periodSeconds < PolicyLimits.MIN_PERIOD_SECONDS || update.periodSeconds > PolicyLimits.MAX_PERIOD_SECONDS) reject("InvalidPeriod")
    if (update.expiry <= now) reject("InvalidExpiry")
    val listsValid = isValidAllowlist(update.allowedPrograms.size, PolicyLimits.MAX_ALLOWED_PROGRAMS) &&
        isValidAllowlist(update.allowedPayees.size, PolicyLimits.MAX_ALLOWED_PAYEES) &&
        isValidAllowlist(update.allowedTools.size, PolicyLimits.MAX_ALLOWED_TOOLS)
    if (!listsValid) reject("InvalidAllowlist")
}

fun rollPeriod(state: MandateState, now: BigInteger): MandateState {
    val periodEnd = checkedI64(state.periodStart + state.periodSeconds)
    if (now < periodEnd) return state
    val elapsed = checkedI64(now - state.periodStart)
    if (state.periodSeconds.signum() <= 0) reject("InvalidPeriod")
    val wholePeriods = elapsed.divide(state.periodSeconds)
    val advance = checkedI64(wholePeriods * state.periodSeconds)
    return state.copy(periodStart = checkedI64(state.periodStart + advance), spentInPeriod = BigInteger.ZERO)
}

fun authorizeSpend(state: MandateState, request: SpendRequest, now: BigInteger): MandateState {
    if (state.revoked) reject("Revoked")
    if (request.signer != state.agent) reject("UnauthorizedSigner")
    if (now >= state.expiry) reject("Expired")
    if (request.expectedNonce != state.nonce) reject("StaleNonce")
    if (request.amount.signum() == 0) reject("ZeroAmount")
    if (request.program !in state.allowedPrograms) reject("ProgramNotAllowed")
    if (request.payee !in state.allowedPayees) reject("PayeeNotAllowed")
    if (request.toolId !in state.allowedTools) reject("ToolNotAllowed")
    val rolled = rollPeriod(state, now)
    val spentAfter = rolled.spentInPeriod + request.amount
    if (spentAfter > PolicyLimits.MAX_U64) reject("ArithmeticOverflow")
    if (spentAfter > rolled.periodCap) reject("CapExceeded")
    val nextNonce = rolled.nonce + BigInteger.ONE
    if (nextNonce > PolicyLimits.MAX_U64) reject("ArithmeticOverflow")
    return rolled.copy(spentInPeriod = spentAfter, nonce = nextNonce)
}

fun authorizeRevoke(state: MandateState, signer: String): MandateState {
    if (signer != state.owner && signer != state.securityAuthority) reject("UnauthorizedSigner")
    if (state.revoked) reject("AlreadyRevoked")
    return state.copy(revoked = true)
}

fun authorizeLimitUpdate(state: MandateState, signer: String, update: LimitUpdate, now: BigInteger): MandateState {
    if (signer != state.owner) reject("UnauthorizedSigner")
    if (state.revoked) reject("Revoked")
    validateLimits(update, now)
    val rolled = rollPeriod(state, now)
    if (update.periodCap < rolled.spentInPeriod) reject("CapBelowSpent")
    return rolled.copy(
        periodCap = update.periodCap,
        periodSeconds = update.periodSeconds,
        expiry = update.expiry,
        allowedPrograms = update.allowedPrograms,
        allowedPayees = update.allowedPayees,
        allowedTools = update.allowedTools,
    )
}

fun authorizeAgentRotation(state: MandateState, signer: String, newAgent: String): MandateState {
    if (signer != state.owner) reject("UnauthorizedSigner")
    if (state.revoked) reject("Revoked")
    if (newAgent == state.owner || newAgent == PolicyLimits.NULL_KEY) reject("InvalidAgent")
    val nextNonce = state.nonce + BigInteger.ONE
    if (nextNonce > PolicyLimits.MAX_U64) reject("ArithmeticOverflow")
    return state.copy(agent = newAgent, nonce = nextNonce)
}
