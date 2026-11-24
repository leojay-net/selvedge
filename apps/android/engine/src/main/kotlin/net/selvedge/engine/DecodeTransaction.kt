package net.selvedge.engine

import java.util.Base64

typealias LookupTableContents = Map<String, List<String>>

private class ResolvedKeys(val keys: List<String>, val resolved: Boolean)

private fun lookupEntry(tableAddress: String, entries: List<String>, index: Int): String =
    entries.getOrNull(index)
        ?: throw TransactionParseException("Lookup index $index outside the table $tableAddress")

private fun resolveAccountKeys(raw: RawTransaction, lookupTables: LookupTableContents): ResolvedKeys {
    if (raw.lookups.isEmpty()) return ResolvedKeys(raw.staticAccountKeys, true)
    val writable = mutableListOf<String>()
    val readonly = mutableListOf<String>()
    for (lookup in raw.lookups) {
        val entries = lookupTables[lookup.tableAddress] ?: return ResolvedKeys(raw.staticAccountKeys, false)
        lookup.writableIndexes.forEach { index -> writable.add(lookupEntry(lookup.tableAddress, entries, index)) }
        lookup.readonlyIndexes.forEach { index -> readonly.add(lookupEntry(lookup.tableAddress, entries, index)) }
    }
    return ResolvedKeys(raw.staticAccountKeys + writable + readonly, true)
}

private fun decodeInstructions(raw: RawTransaction, accountKeys: List<String>, resolved: Boolean): List<DecodedInstruction> {
    val decoded = mutableListOf<DecodedInstruction>()
    for (instruction in raw.instructions) {
        val programId = accountKeys.getOrNull(instruction.programIdIndex)
        if (programId == null) {
            if (!resolved) {
                decoded.add(
                    DecodedInstruction(
                        "unresolved", "Unresolved program", false, "unresolved", emptyList(),
                        mapOf("programIdIndex" to Detail.Whole(instruction.programIdIndex.toLong())),
                    ),
                )
                continue
            }
            throw TransactionParseException("Instruction references a missing program account ${instruction.programIdIndex}")
        }
        val accounts = instruction.accountIndexes.map { accountIndex -> accountKeys.getOrNull(accountIndex) ?: "unresolved:$accountIndex" }
        decoded.add(decodeInstruction(programId, accounts, instruction.data))
    }
    return decoded
}

fun decodeTransactionBytes(transactionBytes: ByteArray, lookupTables: LookupTableContents = emptyMap()): DecodedTransaction {
    val raw = parseTransaction(transactionBytes)
    val resolvedKeys = resolveAccountKeys(raw, lookupTables)
    val feePayer = raw.staticAccountKeys.firstOrNull() ?: throw TransactionParseException("Transaction has no fee payer")
    return DecodedTransaction(
        version = raw.version,
        signatureCount = raw.signatureCount,
        requiredSignerCount = raw.requiredSignerCount,
        feePayer = feePayer,
        requiredSigners = raw.staticAccountKeys.take(raw.requiredSignerCount),
        recentBlockhash = raw.recentBlockhash,
        staticAccountKeys = raw.staticAccountKeys,
        addressTableLookups = raw.lookups,
        lookupsResolved = resolvedKeys.resolved,
        resolvedAccountKeys = resolvedKeys.keys,
        instructions = decodeInstructions(raw, resolvedKeys.keys, resolvedKeys.resolved),
    )
}

fun decodeTransactionBase64(transactionBase64: String, lookupTables: LookupTableContents = emptyMap()): DecodedTransaction =
    decodeTransactionBytes(Base64.getDecoder().decode(transactionBase64), lookupTables)
