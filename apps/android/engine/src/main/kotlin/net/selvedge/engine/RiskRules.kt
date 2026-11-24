package net.selvedge.engine

import java.math.BigInteger

class RuleInput(
    val decoded: DecodedTransaction,
    val deltas: List<AssetDelta>,
    val simulation: SimulationStatus?,
    val context: ReviewContext,
)

private class ExtensionHazard(val severity: RiskSeverity, val description: String)

private val TOKEN_PROGRAMS = setOf(ProgramIds.TOKEN, ProgramIds.TOKEN_2022)
private val APPROVAL_KINDS = setOf("approve", "approve-checked")
private val MANDATE_CHANGE_KINDS = setOf("update-limits", "rotate-agent", "close-mandate")
private val ASSIGN_KINDS = setOf("assign", "assign-with-seed")

private val PERMANENT_DELEGATE = ExtensionHazard(RiskSeverity.CRITICAL, "gives a permanent delegate the power to move or burn any holder's tokens")
private val TRANSFER_HOOK = ExtensionHazard(RiskSeverity.WARNING, "runs another program on every transfer of this token")
private val CONFIDENTIAL_TRANSFER = ExtensionHazard(RiskSeverity.WARNING, "hides transfer amounts, so the review cannot show them")

private val HAZARD_EXTENSION_KINDS = mapOf(
    "initialize-permanent-delegate" to PERMANENT_DELEGATE,
    "transfer-hook-extension" to TRANSFER_HOOK,
    "confidential-transfer-extension" to CONFIDENTIAL_TRANSFER,
)
private val MINT_EXTENSION_HAZARDS = mapOf(
    "permanent-delegate" to PERMANENT_DELEGATE,
    "transfer-hook" to TRANSFER_HOOK,
    "confidential-transfer" to CONFIDENTIAL_TRANSFER,
)

private fun text(value: String): Detail = Detail.Text(value)
private fun textOrNothing(value: String?): Detail = if (value == null) Detail.Nothing else Detail.Text(value)

private fun isTrusted(address: String, context: ReviewContext): Boolean =
    address in context.walletAddresses || address in context.knownAddresses

private fun isWallet(address: String, context: ReviewContext): Boolean = address in context.walletAddresses

private fun tokenInstructions(decoded: DecodedTransaction): List<DecodedInstruction> =
    decoded.instructions.filter { instruction -> instruction.programId in TOKEN_PROGRAMS }

private fun finding(
    ruleId: String,
    severity: RiskSeverity,
    title: String,
    detail: String,
    evidence: Map<String, Detail>,
): RiskFinding = RiskFinding(ruleId, severity, title, detail, evidence)

private fun parseUnits(value: Detail?): BigInteger = if (value is Detail.Text) BigInteger(value.value) else BigInteger.ZERO

private fun walletTokenOutflow(deltas: List<AssetDelta>, context: ReviewContext): Boolean =
    deltas.any { delta ->
        isWallet(delta.owner, context) && BigInteger(delta.change).signum() < 0 && delta.asset != Assets.NATIVE
    }

private fun unlimitedDelegation(input: RuleInput): List<RiskFinding> {
    val findings = mutableListOf<RiskFinding>()
    for (instruction in tokenInstructions(input.decoded)) {
        if (instruction.kind !in APPROVAL_KINDS) continue
        val amount = parseUnits(instruction.details["amount"])
        val delegate = (if (instruction.kind == "approve") instruction.accounts.getOrNull(1) else instruction.accounts.getOrNull(2)) ?: continue
        if (amount >= RiskThresholds.UNLIMITED_APPROVAL_MINIMUM) {
            findings.add(
                finding(
                    "SV-001", RiskSeverity.CRITICAL, "Unlimited token delegation",
                    "This lets $delegate spend an effectively unlimited amount of your tokens at any time.",
                    mapOf("delegate" to text(delegate), "amount" to text(amount.toString())),
                ),
            )
        } else if (!isTrusted(delegate, input.context)) {
            findings.add(
                finding(
                    "SV-002", RiskSeverity.WARNING, "Token delegation to an unfamiliar address",
                    "This lets $delegate spend up to $amount token units from your account.",
                    mapOf("delegate" to text(delegate), "amount" to text(amount.toString())),
                ),
            )
        }
    }
    return findings
}

private fun authorityChange(input: RuleInput): List<RiskFinding> {
    val findings = mutableListOf<RiskFinding>()
    for (instruction in tokenInstructions(input.decoded)) {
        if (instruction.kind != "set-authority") continue
        val newAuthority = (instruction.details["newAuthority"] as? Detail.Text)?.value
        val target = instruction.accounts.getOrNull(0) ?: "unknown"
        val authorityType = (instruction.details["authorityType"] as? Detail.Text)?.value
        if (newAuthority != null && isWallet(newAuthority, input.context)) continue
        findings.add(
            finding(
                "SV-003", RiskSeverity.CRITICAL, "Control of a token account or mint is being handed over",
                "The $authorityType authority of $target would move to ${newAuthority ?: "no one"}.",
                mapOf("account" to text(target), "authorityType" to textOrNothing(authorityType), "newAuthority" to textOrNothing(newAuthority)),
            ),
        )
    }
    return findings
}

private fun closeAccountSweep(input: RuleInput): List<RiskFinding> {
    val findings = mutableListOf<RiskFinding>()
    for (instruction in tokenInstructions(input.decoded)) {
        if (instruction.kind != "close-account") continue
        val destination = instruction.accounts.getOrNull(1)
        if (destination == null || isTrusted(destination, input.context)) continue
        val account = instruction.accounts.getOrNull(0)
        findings.add(
            finding(
                "SV-004", RiskSeverity.CRITICAL, "Account is closed and its balance sent elsewhere",
                "Closing ${account ?: "an account"} would send its remaining lamports to $destination.",
                mapOf("account" to textOrNothing(account), "destination" to text(destination)),
            ),
        )
    }
    return findings
}

private fun balanceDrain(input: RuleInput): List<RiskFinding> {
    val findings = mutableListOf<RiskFinding>()
    for (delta in input.deltas) {
        if (!isWallet(delta.owner, input.context)) continue
        val before = BigInteger(delta.before)
        val change = BigInteger(delta.change)
        if (change.signum() >= 0 || before.signum() <= 0) continue
        if (delta.asset == Assets.NATIVE && before < RiskThresholds.DRAIN_IGNORED_NATIVE_LAMPORTS) continue
        val lostPermille = change.negate().multiply(EngineConstants.PERMILLE_DENOMINATOR).divide(before)
        val percent = lostPermille.divide(BigInteger.TEN)
        val evidence = mapOf(
            "owner" to text(delta.owner), "asset" to text(delta.asset), "lostPermille" to text(lostPermille.toString()),
        )
        if (lostPermille >= RiskThresholds.CRITICAL_DRAIN_PERMILLE) {
            findings.add(
                finding(
                    "SV-005", RiskSeverity.CRITICAL, "Nearly your entire balance leaves",
                    "About $percent% of your ${assetLabel(delta.asset)} balance would leave your wallet.", evidence,
                ),
            )
        } else if (lostPermille >= RiskThresholds.WARNING_DRAIN_PERMILLE) {
            findings.add(
                finding(
                    "SV-005", RiskSeverity.WARNING, "More than half of a balance leaves",
                    "About $percent% of your ${assetLabel(delta.asset)} balance would leave your wallet.", evidence,
                ),
            )
        }
    }
    return findings
}

private fun unknownProgram(input: RuleInput): List<RiskFinding> {
    val unknownPrograms = input.decoded.instructions.filter { instruction -> !instruction.known }.map { instruction -> instruction.programId }
    if (unknownPrograms.isEmpty()) return emptyList()
    val uniquePrograms = unknownPrograms.distinct()
    val hasOutflow = input.deltas.any { delta -> isWallet(delta.owner, input.context) && BigInteger(delta.change).signum() < 0 }
    val suffix = if (hasOutflow) " and it reduces your balance" else ""
    return listOf(
        finding(
            "SV-006", if (hasOutflow) RiskSeverity.CRITICAL else RiskSeverity.WARNING,
            "Calls a program Selvedge does not recognise",
            "The transaction runs ${uniquePrograms.joinToString(", ")}, which cannot be decoded$suffix.",
            mapOf("programs" to text(uniquePrograms.joinToString(",")), "withOutflow" to Detail.Flag(hasOutflow)),
        ),
    )
}

private fun newRecipientTransfer(input: RuleInput): List<RiskFinding> {
    val findings = mutableListOf<RiskFinding>()
    for (instruction in input.decoded.instructions) {
        if (instruction.programId != ProgramIds.SYSTEM || instruction.kind != "transfer") continue
        val lamports = parseUnits(instruction.details["lamports"])
        val destination = instruction.accounts.getOrNull(1)
        if (destination == null || isTrusted(destination, input.context)) continue
        if (lamports >= RiskThresholds.NEW_RECIPIENT_WARNING_LAMPORTS) {
            findings.add(
                finding(
                    "SV-007", RiskSeverity.WARNING, "Large transfer to an address you have not used",
                    "$lamports lamports would go to $destination.",
                    mapOf("destination" to text(destination), "asset" to text(Assets.NATIVE), "amount" to text(lamports.toString())),
                ),
            )
        }
    }
    for (delta in input.deltas) {
        if (delta.asset == Assets.NATIVE || isTrusted(delta.owner, input.context)) continue
        val gained = BigInteger(delta.change)
        if (gained >= RiskThresholds.NEW_RECIPIENT_WARNING_TOKEN_UNITS && walletTokenOutflow(input.deltas, input.context)) {
            findings.add(
                finding(
                    "SV-007", RiskSeverity.WARNING, "Large transfer to an address you have not used",
                    "${formatAssetAmount(delta.asset, gained)} would go to ${shortenAddress(delta.owner)}.",
                    mapOf("destination" to text(delta.owner), "asset" to text(delta.asset), "amount" to text(gained.toString())),
                ),
            )
        }
    }
    return findings
}

private fun token2022Hazards(input: RuleInput): List<RiskFinding> {
    val findings = mutableListOf<RiskFinding>()
    for (instruction in input.decoded.instructions) {
        val hazard = HAZARD_EXTENSION_KINDS[instruction.kind]
        if (instruction.programId != ProgramIds.TOKEN_2022 || hazard == null) continue
        findings.add(
            finding("SV-008", hazard.severity, "Risky Token-2022 extension", "This instruction ${hazard.description}.", mapOf("kind" to text(instruction.kind))),
        )
    }
    for (instruction in tokenInstructions(input.decoded)) {
        if (instruction.kind != "transfer-checked") continue
        val mint = instruction.accounts.getOrNull(1)
        val info = input.context.mintInfo.firstOrNull { candidate -> candidate.mint == mint } ?: continue
        for (extension in info.extensions) {
            val hazard = MINT_EXTENSION_HAZARDS[extension] ?: continue
            findings.add(
                finding(
                    "SV-008", hazard.severity, "Token has a risky extension", "Token ${info.mint} ${hazard.description}.",
                    mapOf("mint" to text(info.mint), "extension" to text(extension)),
                ),
            )
        }
    }
    return findings
}

private fun computeBudgetAnomaly(input: RuleInput): List<RiskFinding> {
    val anomalies = mutableListOf<String>()
    val limits = input.decoded.instructions.filter { instruction -> instruction.kind == "set-compute-unit-limit" }
    val prices = input.decoded.instructions.filter { instruction -> instruction.kind == "set-compute-unit-price" }
    if (limits.size > 1 || prices.size > 1) anomalies.add("the compute budget is set more than once")
    for (price in prices) {
        if (parseUnits(price.details["microLamports"]) > RiskThresholds.MAXIMUM_COMPUTE_UNIT_PRICE_MICRO_LAMPORTS) {
            anomalies.add("the priority fee price is far above normal levels")
        }
    }
    for (limit in limits) {
        val units = (limit.details["units"] as? Detail.Whole)?.value ?: 0L
        if (units > RiskThresholds.MAXIMUM_COMPUTE_UNIT_LIMIT) anomalies.add("the compute limit exceeds what the network allows")
    }
    if (anomalies.isEmpty()) return emptyList()
    return listOf(
        finding(
            "SV-009", RiskSeverity.WARNING, "Unusual compute budget",
            "In this transaction ${anomalies.joinToString(", and ")}.",
            mapOf("anomalyCount" to Detail.Whole(anomalies.size.toLong())),
        ),
    )
}

private fun lookupTableObfuscation(input: RuleInput): List<RiskFinding> {
    val decoded = input.decoded
    if (decoded.addressTableLookups.isEmpty()) return emptyList()
    if (!decoded.lookupsResolved) {
        return listOf(
            finding(
                "SV-010", RiskSeverity.WARNING, "Some accounts are hidden behind lookup tables",
                "The lookup tables could not be read, so part of this transaction cannot be reviewed.",
                mapOf("tables" to text(decoded.addressTableLookups.joinToString(",") { lookup -> lookup.tableAddress })),
            ),
        )
    }
    val lookedUpCount = decoded.resolvedAccountKeys.size - decoded.staticAccountKeys.size
    val sharePercent = (lookedUpCount * EngineConstants.PERCENT_DENOMINATOR) / decoded.resolvedAccountKeys.size
    if (sharePercent > RiskThresholds.MAXIMUM_LOOKUP_TABLE_SHARE_PERCENT) {
        return listOf(
            finding(
                "SV-010", RiskSeverity.WARNING, "Most accounts come from lookup tables",
                "Most of the accounts in this transaction are not written in the transaction itself.",
                mapOf("lookedUpCount" to Detail.Whole(lookedUpCount.toLong()), "sharePercent" to Detail.Whole(sharePercent.toLong())),
            ),
        )
    }
    return emptyList()
}

private fun accountAssignment(input: RuleInput): List<RiskFinding> {
    val findings = mutableListOf<RiskFinding>()
    for (instruction in input.decoded.instructions) {
        if (instruction.programId != ProgramIds.SYSTEM || instruction.kind !in ASSIGN_KINDS) continue
        val newOwner = (instruction.details["owner"] as? Detail.Text)?.value
        val account = instruction.accounts.getOrNull(0)
        if (newOwner == null || newOwner == ProgramIds.SYSTEM || account == null) continue
        if (!isWallet(account, input.context)) continue
        findings.add(
            finding(
                "SV-011", RiskSeverity.CRITICAL, "Your wallet account is handed to another program",
                "Assigning $account to $newOwner lets that program take control of the account.",
                mapOf("account" to text(account), "newOwner" to text(newOwner)),
            ),
        )
    }
    return findings
}

private fun mandateChange(input: RuleInput): List<RiskFinding> {
    val findings = mutableListOf<RiskFinding>()
    for (instruction in input.decoded.instructions) {
        if (instruction.programId != ProgramIds.MANDATE) continue
        if (instruction.kind in MANDATE_CHANGE_KINDS) {
            findings.add(
                finding(
                    "SV-012", RiskSeverity.WARNING, "Changes an agent mandate",
                    "This ${instruction.kind.replaceFirst("-", " ")} changes what an agent is allowed to do with your funds.",
                    mapOf("kind" to text(instruction.kind)),
                ),
            )
        } else if (instruction.kind == "revoke-mandate") {
            findings.add(
                finding(
                    "SV-012", RiskSeverity.INFO, "Revokes an agent mandate", "The agent loses all spending authority.",
                    mapOf("kind" to text(instruction.kind)),
                ),
            )
        }
    }
    return findings
}

private fun simulationFailed(input: RuleInput): List<RiskFinding> {
    val simulation = input.simulation ?: return emptyList()
    if (simulation.succeeded) return emptyList()
    return listOf(
        finding(
            "SV-013", RiskSeverity.WARNING, "The transaction fails in simulation",
            "Simulation reported: ${simulation.errorDescription ?: "unknown error"}.",
            mapOf("error" to textOrNothing(simulation.errorDescription)),
        ),
    )
}

val RISK_RULES: List<(RuleInput) -> List<RiskFinding>> = listOf(
    ::unlimitedDelegation, ::authorityChange, ::closeAccountSweep, ::balanceDrain, ::unknownProgram,
    ::newRecipientTransfer, ::token2022Hazards, ::computeBudgetAnomaly, ::lookupTableObfuscation,
    ::accountAssignment, ::mandateChange, ::simulationFailed,
)

fun scoreFindings(findings: List<RiskFinding>): Int {
    var total = 0
    for (finding in findings) {
        total += when (finding.severity) {
            RiskSeverity.CRITICAL -> RiskThresholds.CRITICAL_WEIGHT
            RiskSeverity.WARNING -> RiskThresholds.WARNING_WEIGHT
            RiskSeverity.INFO -> RiskThresholds.INFO_WEIGHT
        }
    }
    return minOf(total, EngineConstants.RISK_SCORE_CAP)
}

fun verdictFor(findings: List<RiskFinding>, score: Int): RiskVerdict {
    val hasCritical = findings.any { finding -> finding.severity == RiskSeverity.CRITICAL }
    if (hasCritical || score >= EngineConstants.DANGER_SCORE_MINIMUM) return RiskVerdict.DANGER
    val hasWarning = findings.any { finding -> finding.severity == RiskSeverity.WARNING }
    if (hasWarning || score >= EngineConstants.CAUTION_SCORE_MINIMUM) return RiskVerdict.CAUTION
    return RiskVerdict.SAFE
}

fun assessRisk(input: RuleInput): RiskAssessment {
    val findings = RISK_RULES.flatMap { rule -> rule(input) }
    val score = scoreFindings(findings)
    return RiskAssessment(EngineConstants.RISK_RULESET_VERSION, findings, score, verdictFor(findings, score))
}
