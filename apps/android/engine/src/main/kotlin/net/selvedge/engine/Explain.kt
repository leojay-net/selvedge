package net.selvedge.engine

import java.math.BigInteger

private const val ADDRESS_PREFIX_LENGTH = 4
private const val ADDRESS_SUFFIX_LENGTH = 4
private const val ADDRESS_ELISION = "..."

private val VERDICT_HEADLINES = mapOf(
    RiskVerdict.DANGER to "Do not sign this transaction.",
    RiskVerdict.CAUTION to "Review this transaction carefully before signing.",
    RiskVerdict.SAFE to "No risks were found in this transaction.",
)

fun shortenAddress(address: String): String {
    if (address.length <= ADDRESS_PREFIX_LENGTH + ADDRESS_SUFFIX_LENGTH + ADDRESS_ELISION.length) return address
    return address.take(ADDRESS_PREFIX_LENGTH) + ADDRESS_ELISION + address.takeLast(ADDRESS_SUFFIX_LENGTH)
}

fun assetLabel(asset: String): String = EngineConstants.KNOWN_ASSET_SYMBOLS[asset]?.symbol ?: shortenAddress(asset)

fun formatAssetAmount(asset: String, rawUnits: BigInteger): String {
    val known = EngineConstants.KNOWN_ASSET_SYMBOLS[asset]
    val magnitude = rawUnits.abs()
    if (known == null) return "$magnitude units of ${shortenAddress(asset)}"
    val divisor = BigInteger.TEN.pow(known.decimals)
    val wholePart = magnitude.divide(divisor)
    val fractionPart = magnitude.mod(divisor).toString().padStart(known.decimals, '0').trimEnd('0')
    val amountText = if (fractionPart.isNotEmpty()) "$wholePart.$fractionPart" else wholePart.toString()
    return "$amountText ${known.symbol}"
}

private fun describeWalletMovements(deltas: List<AssetDelta>, context: ReviewContext): List<String> {
    val lines = mutableListOf<String>()
    for (delta in deltas) {
        if (delta.owner !in context.walletAddresses) continue
        val change = BigInteger(delta.change)
        if (change.signum() == 0) continue
        val verb = if (change.signum() < 0) "You send" else "You receive"
        lines.add("$verb ${formatAssetAmount(delta.asset, change)}.")
    }
    return lines
}

fun explainReview(assessment: RiskAssessment, deltas: List<AssetDelta>, context: ReviewContext): String {
    val lines = mutableListOf(VERDICT_HEADLINES.getValue(assessment.verdict))
    lines.addAll(describeWalletMovements(deltas, context))
    for (finding in assessment.findings) lines.add("${finding.title}: ${finding.detail}")
    return lines.joinToString("\n")
}
