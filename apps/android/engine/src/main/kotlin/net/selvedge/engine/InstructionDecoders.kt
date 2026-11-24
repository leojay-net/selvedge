package net.selvedge.engine

private const val UNKNOWN_PROGRAM_LABEL = "Unknown program"
private const val MANDATE_DISCRIMINATOR_BYTES = 8
private const val BYTE_MASK = 0xff

private val SYSTEM_NAMES = mapOf(
    0 to "create-account", 1 to "assign", 2 to "transfer", 3 to "create-account-with-seed",
    4 to "advance-nonce", 5 to "withdraw-nonce", 6 to "initialize-nonce", 7 to "authorize-nonce",
    8 to "allocate", 9 to "allocate-with-seed", 10 to "assign-with-seed", 11 to "transfer-with-seed",
    12 to "upgrade-nonce",
)

private val TOKEN_NAMES = mapOf(
    0 to "initialize-mint", 1 to "initialize-account", 2 to "initialize-multisig", 3 to "transfer",
    4 to "approve", 5 to "revoke", 6 to "set-authority", 7 to "mint-to", 8 to "burn",
    9 to "close-account", 10 to "freeze-account", 11 to "thaw-account", 12 to "transfer-checked",
    13 to "approve-checked", 14 to "mint-to-checked", 15 to "burn-checked", 16 to "initialize-account2",
    17 to "sync-native", 18 to "initialize-account3", 19 to "initialize-multisig2", 20 to "initialize-mint2",
    21 to "get-account-data-size", 22 to "initialize-immutable-owner", 23 to "amount-to-ui-amount",
    24 to "ui-amount-to-amount", 25 to "initialize-mint-close-authority", 26 to "transfer-fee-extension",
    27 to "confidential-transfer-extension", 28 to "default-account-state-extension", 29 to "reallocate",
    30 to "memo-transfer-extension", 31 to "create-native-mint", 32 to "initialize-non-transferable-mint",
    33 to "interest-bearing-mint-extension", 34 to "cpi-guard-extension", 35 to "initialize-permanent-delegate",
    36 to "transfer-hook-extension", 37 to "confidential-transfer-fee-extension", 38 to "withdraw-excess-lamports",
    39 to "metadata-pointer-extension", 40 to "group-pointer-extension", 41 to "group-member-pointer-extension",
)

private val AUTHORITY_TYPE_NAMES = mapOf(0 to "mint-tokens", 1 to "freeze-account", 2 to "account-owner", 3 to "close-account")
private val ASSOCIATED_TOKEN_NAMES = mapOf(0 to "create", 1 to "create-idempotent", 2 to "recover-nested")
private val COMPUTE_BUDGET_NAMES = mapOf(
    1 to "request-heap-frame", 2 to "set-compute-unit-limit", 3 to "set-compute-unit-price",
    4 to "set-loaded-accounts-data-size-limit",
)
private val MANDATE_INSTRUCTIONS = mapOf(
    "e6aa9e4421a9109e" to "create-mandate",
    "5925893c4b4630c2" to "update-limits",
    "fc618c77432bb16c" to "revoke-mandate",
    "b65b936b9b2f96b0" to "rotate-agent",
    "f2cdff5765d9f539" to "spend",
    "7557bd05fe7df8b4" to "close-mandate",
)

private val TOKEN_AMOUNT_CODES = setOf(3, 4, 7, 8)
private val TOKEN_CHECKED_AMOUNT_CODES = setOf(12, 13, 14, 15)
private const val TOKEN_SET_AUTHORITY_CODE = 6
private const val SYSTEM_CREATE_ACCOUNT = 0
private const val SYSTEM_ASSIGN = 1
private val SYSTEM_LAMPORT_CODES = setOf(2, 5, 11)
private const val COMPUTE_UNIT_LIMIT_CODE = 2
private const val COMPUTE_UNIT_PRICE_CODE = 3

private class DecodedBody(val kind: String, val details: Map<String, Detail>)

private fun byteAt(data: ByteArray, index: Int): Int? = if (index < data.size) data[index].toInt() and BYTE_MASK else null

private fun addressAt(data: ByteArray, offset: Int): String {
    val end = offset + EngineConstants.PUBLIC_KEY_BYTE_LENGTH
    if (end > data.size) throw TransactionParseException("Instruction data too short for an address at $offset")
    return Base58.encode(data.copyOfRange(offset, end))
}

private fun toHex(bytes: ByteArray): String = bytes.joinToString("") { byteValue -> "%02x".format(byteValue.toInt() and BYTE_MASK) }

private fun unsignedText(data: ByteArray, offset: Int, length: Int): Detail =
    Detail.Text(readUnsignedLittleEndian(data, offset, length).toString())

private fun decodeSystem(data: ByteArray): DecodedBody {
    val code = readUnsignedLittleEndian(data, 0, 4).toInt()
    val kind = SYSTEM_NAMES[code] ?: "unknown-system-$code"
    val details = mutableMapOf<String, Detail>()
    when {
        code in SYSTEM_LAMPORT_CODES -> details["lamports"] = unsignedText(data, 4, 8)
        code == SYSTEM_CREATE_ACCOUNT -> {
            details["lamports"] = unsignedText(data, 4, 8)
            details["space"] = unsignedText(data, 12, 8)
            details["owner"] = Detail.Text(addressAt(data, 20))
        }
        code == SYSTEM_ASSIGN -> details["owner"] = Detail.Text(addressAt(data, 4))
    }
    return DecodedBody(kind, details)
}

private fun decodeToken(data: ByteArray): DecodedBody {
    val code = byteAt(data, 0) ?: -1
    val kind = TOKEN_NAMES[code] ?: "unknown-token-$code"
    val details = mutableMapOf<String, Detail>()
    when {
        code in TOKEN_AMOUNT_CODES -> details["amount"] = unsignedText(data, 1, 8)
        code in TOKEN_CHECKED_AMOUNT_CODES -> {
            details["amount"] = unsignedText(data, 1, 8)
            details["decimals"] = Detail.Whole((byteAt(data, 9) ?: 0).toLong())
        }
        code == TOKEN_SET_AUTHORITY_CODE -> {
            val authorityType = byteAt(data, 1) ?: -1
            details["authorityType"] = Detail.Text(AUTHORITY_TYPE_NAMES[authorityType] ?: "unknown-$authorityType")
            val hasNewAuthority = (byteAt(data, 2) ?: 0) == 1
            details["newAuthority"] = if (hasNewAuthority) Detail.Text(addressAt(data, 3)) else Detail.Nothing
        }
    }
    return DecodedBody(kind, details)
}

private fun decodeAssociatedToken(data: ByteArray): DecodedBody {
    val code = if (data.isEmpty()) 0 else (byteAt(data, 0) ?: 0)
    return DecodedBody(ASSOCIATED_TOKEN_NAMES[code] ?: "unknown-associated-token-$code", emptyMap())
}

private fun decodeComputeBudget(data: ByteArray): DecodedBody {
    val code = byteAt(data, 0) ?: -1
    val kind = COMPUTE_BUDGET_NAMES[code] ?: "unknown-compute-budget-$code"
    val details = mutableMapOf<String, Detail>()
    if (code == COMPUTE_UNIT_LIMIT_CODE) {
        details["units"] = Detail.Whole(readUnsignedLittleEndian(data, 1, 4).toLong())
    } else if (code == COMPUTE_UNIT_PRICE_CODE) {
        details["microLamports"] = unsignedText(data, 1, 8)
    }
    return DecodedBody(kind, details)
}

private fun decodeMandate(data: ByteArray): DecodedBody {
    val discriminatorHex = toHex(data.copyOfRange(0, minOf(MANDATE_DISCRIMINATOR_BYTES, data.size)))
    val name = MANDATE_INSTRUCTIONS[discriminatorHex] ?: return DecodedBody("unknown-mandate-instruction", emptyMap())
    val details = mutableMapOf<String, Detail>()
    val base = MANDATE_DISCRIMINATOR_BYTES
    when (name) {
        "spend" -> {
            details["amount"] = unsignedText(data, base, 8)
            details["toolId"] = unsignedText(data, base + 8, 8)
            details["expectedNonce"] = unsignedText(data, base + 16, 8)
        }
        "rotate-agent" -> details["newAgent"] = Detail.Text(addressAt(data, base))
        "create-mandate" -> {
            details["mandateId"] = unsignedText(data, base, 8)
            details["agent"] = Detail.Text(addressAt(data, base + 8))
            details["securityAuthority"] = Detail.Text(addressAt(data, base + 40))
            details["mint"] = Detail.Text(addressAt(data, base + 72))
            details["periodCap"] = unsignedText(data, base + 104, 8)
            details["periodSeconds"] = Detail.Text(readSignedLittleEndian64(data, base + 112).toString())
            details["expiry"] = Detail.Text(readSignedLittleEndian64(data, base + 120).toString())
        }
        "update-limits" -> {
            details["periodCap"] = unsignedText(data, base, 8)
            details["periodSeconds"] = Detail.Text(readSignedLittleEndian64(data, base + 8).toString())
            details["expiry"] = Detail.Text(readSignedLittleEndian64(data, base + 16).toString())
        }
    }
    return DecodedBody(name, details)
}

private fun decodeBody(programId: String, data: ByteArray): DecodedBody? = when (programId) {
    ProgramIds.SYSTEM -> decodeSystem(data)
    ProgramIds.TOKEN, ProgramIds.TOKEN_2022 -> decodeToken(data)
    ProgramIds.ASSOCIATED_TOKEN -> decodeAssociatedToken(data)
    ProgramIds.COMPUTE_BUDGET -> decodeComputeBudget(data)
    ProgramIds.MEMO, ProgramIds.LEGACY_MEMO -> DecodedBody("memo", mapOf("byteLength" to Detail.Whole(data.size.toLong())))
    ProgramIds.ADDRESS_LOOKUP_TABLE -> DecodedBody("address-lookup-table", emptyMap())
    ProgramIds.MANDATE -> decodeMandate(data)
    else -> null
}

fun decodeInstruction(programId: String, accounts: List<String>, data: ByteArray): DecodedInstruction {
    val body = decodeBody(programId, data)
        ?: return DecodedInstruction(
            programId, UNKNOWN_PROGRAM_LABEL, false, "unknown", accounts,
            mapOf("dataByteLength" to Detail.Whole(data.size.toLong())),
        )
    return DecodedInstruction(
        programId,
        EngineConstants.KNOWN_PROGRAM_LABELS[programId] ?: UNKNOWN_PROGRAM_LABEL,
        true,
        body.kind,
        accounts,
        body.details,
    )
}
