package net.selvedge.engine

import java.math.BigInteger

object ProgramIds {
    const val SYSTEM = "11111111111111111111111111111111"
    const val TOKEN = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
    const val TOKEN_2022 = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb"
    const val ASSOCIATED_TOKEN = "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"
    const val COMPUTE_BUDGET = "ComputeBudget111111111111111111111111111111"
    const val MEMO = "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr"
    const val LEGACY_MEMO = "Memo1UhkJRfHyvLMcVucJwxXeuD728EqVDDwQDxFMNo"
    const val ADDRESS_LOOKUP_TABLE = "AddressLookupTab1e1111111111111111111111111"
    const val MANDATE = "DDorK5hW2iufBzDi3mmpuiFW2mZT57jGFE2jewmp7pxd"
}

object Assets {
    const val DEVNET_USDC_MINT = "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU"
    const val MAINNET_USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"
    const val NATIVE = "SOL"
}

data class AssetSymbol(val symbol: String, val decimals: Int)

object EngineConstants {
    const val PUBLIC_KEY_BYTE_LENGTH = 32
    const val SIGNATURE_BYTE_LENGTH = 64
    const val VERSION_PREFIX_MASK = 0x7f
    const val VERSION_PREFIX_FLAG = 0x80
    const val TOKEN_ACCOUNT_MINIMUM_LENGTH = 165
    const val TOKEN_ACCOUNT_MINT_OFFSET = 0
    const val TOKEN_ACCOUNT_OWNER_OFFSET = 32
    const val TOKEN_ACCOUNT_AMOUNT_OFFSET = 64
    const val MAXIMUM_TRANSACTION_BYTES = 1232
    const val SIMULATION_TIMEOUT_MILLISECONDS = 15_000
    const val RISK_RULESET_VERSION = "1.0.0"
    const val RISK_SCORE_CAP = 100
    const val DANGER_SCORE_MINIMUM = 60
    const val CAUTION_SCORE_MINIMUM = 20
    const val PERCENT_DENOMINATOR = 100
    val PERMILLE_DENOMINATOR: BigInteger = BigInteger.valueOf(1000)
    val MAX_U64: BigInteger = BigInteger("18446744073709551615")

    val KNOWN_PROGRAM_LABELS: Map<String, String> = mapOf(
        ProgramIds.SYSTEM to "System Program",
        ProgramIds.TOKEN to "SPL Token",
        ProgramIds.TOKEN_2022 to "Token-2022",
        ProgramIds.ASSOCIATED_TOKEN to "Associated Token Account",
        ProgramIds.COMPUTE_BUDGET to "Compute Budget",
        ProgramIds.MEMO to "Memo",
        ProgramIds.LEGACY_MEMO to "Memo (legacy)",
        ProgramIds.ADDRESS_LOOKUP_TABLE to "Address Lookup Table",
        ProgramIds.MANDATE to "Selvedge Mandate",
    )

    val KNOWN_ASSET_SYMBOLS: Map<String, AssetSymbol> = mapOf(
        Assets.NATIVE to AssetSymbol("SOL", 9),
        Assets.DEVNET_USDC_MINT to AssetSymbol("USDC", 6),
        Assets.MAINNET_USDC_MINT to AssetSymbol("USDC", 6),
    )
}

object RiskThresholds {
    val UNLIMITED_APPROVAL_MINIMUM: BigInteger = BigInteger.ONE.shiftLeft(63)
    val CRITICAL_DRAIN_PERMILLE: BigInteger = BigInteger.valueOf(900)
    val WARNING_DRAIN_PERMILLE: BigInteger = BigInteger.valueOf(500)
    val NEW_RECIPIENT_WARNING_LAMPORTS: BigInteger = BigInteger.valueOf(100_000_000)
    val NEW_RECIPIENT_WARNING_TOKEN_UNITS: BigInteger = BigInteger.valueOf(100_000_000)
    const val MAXIMUM_COMPUTE_UNIT_LIMIT = 1_400_000L
    val MAXIMUM_COMPUTE_UNIT_PRICE_MICRO_LAMPORTS: BigInteger = BigInteger.valueOf(5_000_000)
    const val MAXIMUM_LOOKUP_TABLE_SHARE_PERCENT = 50
    val DRAIN_IGNORED_NATIVE_LAMPORTS: BigInteger = BigInteger.valueOf(10_000_000)
    const val CRITICAL_WEIGHT = 60
    const val WARNING_WEIGHT = 20
    const val INFO_WEIGHT = 0
}
