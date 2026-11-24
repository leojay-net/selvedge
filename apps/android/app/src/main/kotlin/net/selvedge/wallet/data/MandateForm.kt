package net.selvedge.wallet.data

import java.math.BigDecimal
import java.math.BigInteger
import net.selvedge.engine.Base58
import net.selvedge.engine.EngineException
import net.selvedge.engine.PolicyLimits
import net.selvedge.engine.PolicyRejection
import net.selvedge.engine.validateLimits

object MandateFormLimits {
    const val USDC_DECIMALS = 6
    const val SECONDS_PER_DAY = 86_400L
    const val MAXIMUM_EXPIRY_DAYS = 365L
    const val PUBLIC_KEY_BYTES = 32
}

enum class PeriodChoice(val label: String, val seconds: Long) {
    HOUR("Hourly", 3_600L),
    DAY("Daily", 86_400L),
    WEEK("Weekly", 604_800L),
}

enum class MandateField { NAME, AGENT_KEY, CAP, EXPIRY, PROGRAMS, PAYEES, TOOLS }

data class MandateFormInput(
    val name: String,
    val agentKey: String,
    val capUsdc: String,
    val period: PeriodChoice,
    val expiryDays: String,
    val programs: String,
    val payees: String,
    val tools: String,
)

sealed interface MandateFormResult {
    data class Valid(val draft: MandateDraft) : MandateFormResult
    data class Invalid(val errors: Map<MandateField, String>) : MandateFormResult
}

private val REJECTION_MESSAGES = mapOf(
    "InvalidCap" to "The spending cap must be greater than zero.",
    "InvalidPeriod" to "The period must be between one minute and one year.",
    "InvalidExpiry" to "The expiry must be in the future.",
    "InvalidAllowlist" to "Each allow-list needs at least one entry and no more than the program limit.",
    "CapBelowSpent" to "The new cap is below what the agent has already spent this period.",
    "Revoked" to "This mandate is revoked and can no longer change.",
    "UnauthorizedSigner" to "Only the owner can change this mandate.",
    "AlreadyRevoked" to "This mandate is already revoked.",
    "ArithmeticOverflow" to "That amount is too large.",
)

fun describeRejection(rejection: PolicyRejection): String = REJECTION_MESSAGES[rejection.rejection] ?: "The mandate program would reject this: ${rejection.rejection}."

fun parseUsdcAmount(text: String): BigInteger? {
    val trimmed = text.trim()
    if (trimmed.isEmpty()) return null
    val parsed = try {
        BigDecimal(trimmed)
    } catch (failure: NumberFormatException) {
        return null
    }
    if (parsed.signum() <= 0 || parsed.scale() > MandateFormLimits.USDC_DECIMALS) return null
    return parsed.movePointRight(MandateFormLimits.USDC_DECIMALS).toBigIntegerExact()
}

fun isValidPublicKey(address: String): Boolean = try {
    Base58.decode(address).size == MandateFormLimits.PUBLIC_KEY_BYTES
} catch (failure: EngineException) {
    false
} catch (failure: IllegalArgumentException) {
    false
}

private fun splitList(text: String): List<String> = text.split(',', '\n', ' ').map { entry -> entry.trim() }.filter { entry -> entry.isNotEmpty() }

private fun invalidKeys(entries: List<String>): List<String> = entries.filterNot(::isValidPublicKey)

fun validateMandateForm(input: MandateFormInput, nowSeconds: Long, requireAgentKey: Boolean): MandateFormResult {
    val errors = mutableMapOf<MandateField, String>()
    if (requireAgentKey) {
        if (input.name.isBlank()) errors[MandateField.NAME] = "Give the agent a name."
        if (!isValidPublicKey(input.agentKey.trim())) errors[MandateField.AGENT_KEY] = "Enter the agent's 32-byte public key in base58."
    }
    val capUnits = parseUsdcAmount(input.capUsdc)
    if (capUnits == null) errors[MandateField.CAP] = "Enter an amount above zero with at most six decimals."
    else if (capUnits > PolicyLimits.MAX_U64) errors[MandateField.CAP] = "That amount is too large."
    val days = input.expiryDays.trim().toLongOrNull()
    if (days == null || days < 1 || days > MandateFormLimits.MAXIMUM_EXPIRY_DAYS) errors[MandateField.EXPIRY] = "Enter whole days from 1 to ${MandateFormLimits.MAXIMUM_EXPIRY_DAYS}."
    val programs = splitList(input.programs)
    val payees = splitList(input.payees)
    val tools = splitList(input.tools)
    if (programs.isEmpty() || programs.size > PolicyLimits.MAX_ALLOWED_PROGRAMS || invalidKeys(programs).isNotEmpty()) {
        errors[MandateField.PROGRAMS] = "Enter 1 to ${PolicyLimits.MAX_ALLOWED_PROGRAMS} valid program addresses."
    }
    if (payees.isEmpty() || payees.size > PolicyLimits.MAX_ALLOWED_PAYEES || invalidKeys(payees).isNotEmpty()) {
        errors[MandateField.PAYEES] = "Enter 1 to ${PolicyLimits.MAX_ALLOWED_PAYEES} valid payee addresses."
    }
    val toolNumbers = tools.map { tool -> tool.toLongOrNull() }
    if (tools.isEmpty() || tools.size > PolicyLimits.MAX_ALLOWED_TOOLS || toolNumbers.any { number -> number == null || number < 0 }) {
        errors[MandateField.TOOLS] = "Enter 1 to ${PolicyLimits.MAX_ALLOWED_TOOLS} tool numbers."
    }
    if (errors.isNotEmpty() || capUnits == null || days == null) return MandateFormResult.Invalid(errors)
    val draft = MandateDraft(capUnits.toString(), input.period.seconds, nowSeconds + days * MandateFormLimits.SECONDS_PER_DAY, programs, payees, tools)
    return try {
        validateLimits(draft.toLimitUpdate(), BigInteger.valueOf(nowSeconds))
        MandateFormResult.Valid(draft)
    } catch (rejection: PolicyRejection) {
        MandateFormResult.Invalid(mapOf(MandateField.CAP to describeRejection(rejection)))
    }
}

fun formatUsdc(units: String): String {
    val amount = BigDecimal(BigInteger(units), MandateFormLimits.USDC_DECIMALS).stripTrailingZeros()
    return amount.toPlainString() + " USDC"
}
