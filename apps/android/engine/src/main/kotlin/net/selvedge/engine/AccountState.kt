package net.selvedge.engine

import java.math.BigInteger

class AccountSnapshot(
    val address: String,
    val lamports: BigInteger,
    val ownerProgram: String,
    val data: ByteArray,
)

private class Holding(val owner: String, val asset: String, val amount: BigInteger)

private fun readTokenHolding(snapshot: AccountSnapshot): Holding? {
    val isTokenProgram = snapshot.ownerProgram == ProgramIds.TOKEN || snapshot.ownerProgram == ProgramIds.TOKEN_2022
    if (!isTokenProgram || snapshot.data.size < EngineConstants.TOKEN_ACCOUNT_MINIMUM_LENGTH) return null
    val keyLength = EngineConstants.PUBLIC_KEY_BYTE_LENGTH
    val mintStart = EngineConstants.TOKEN_ACCOUNT_MINT_OFFSET
    val ownerStart = EngineConstants.TOKEN_ACCOUNT_OWNER_OFFSET
    val mint = Base58.encode(snapshot.data.copyOfRange(mintStart, mintStart + keyLength))
    val owner = Base58.encode(snapshot.data.copyOfRange(ownerStart, ownerStart + keyLength))
    val amount = readUnsignedLittleEndian(snapshot.data, EngineConstants.TOKEN_ACCOUNT_AMOUNT_OFFSET, 8)
    return Holding(owner, mint, amount)
}

private fun collectHoldings(snapshots: List<AccountSnapshot>): Map<String, Holding> {
    val holdings = linkedMapOf<String, Holding>()
    for (snapshot in snapshots) {
        val tokenHolding = readTokenHolding(snapshot)
        if (tokenHolding != null) {
            val key = "${tokenHolding.owner}|${tokenHolding.asset}"
            val existing = holdings[key]
            holdings[key] = Holding(tokenHolding.owner, tokenHolding.asset, (existing?.amount ?: BigInteger.ZERO) + tokenHolding.amount)
        } else if (snapshot.ownerProgram == ProgramIds.SYSTEM) {
            holdings["${snapshot.address}|${Assets.NATIVE}"] = Holding(snapshot.address, Assets.NATIVE, snapshot.lamports)
        }
    }
    return holdings
}

fun computeAssetDeltas(before: List<AccountSnapshot>, after: List<AccountSnapshot>): List<AssetDelta> {
    val beforeHoldings = collectHoldings(before)
    val afterHoldings = collectHoldings(after)
    val keys = (beforeHoldings.keys + afterHoldings.keys).toSortedSet()
    val deltas = mutableListOf<AssetDelta>()
    for (key in keys) {
        val beforeHolding = beforeHoldings[key]
        val afterHolding = afterHoldings[key]
        val reference = afterHolding ?: beforeHolding ?: continue
        val beforeAmount = beforeHolding?.amount ?: BigInteger.ZERO
        val afterAmount = afterHolding?.amount ?: BigInteger.ZERO
        if (beforeAmount == afterAmount) continue
        deltas.add(
            AssetDelta(reference.owner, reference.asset, beforeAmount.toString(), afterAmount.toString(), (afterAmount - beforeAmount).toString()),
        )
    }
    return deltas
}
