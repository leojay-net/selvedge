package net.selvedge.engine

class RawInstruction(val programIdIndex: Int, val accountIndexes: List<Int>, val data: ByteArray)

class RawTransaction(
    val version: String,
    val signatureCount: Int,
    val requiredSignerCount: Int,
    val staticAccountKeys: List<String>,
    val recentBlockhash: String,
    val instructions: List<RawInstruction>,
    val lookups: List<AddressTableLookup>,
)

private const val SUPPORTED_MESSAGE_VERSION = 0

private fun readAddress(reader: ByteReader): String =
    Base58.encode(reader.readBytes(EngineConstants.PUBLIC_KEY_BYTE_LENGTH))

private fun readIndexVector(reader: ByteReader): List<Int> {
    val length = reader.readShortVecLength()
    return List(length) { reader.readByte() }
}

private fun readInstruction(reader: ByteReader): RawInstruction {
    val programIdIndex = reader.readByte()
    val accountIndexes = readIndexVector(reader)
    val dataLength = reader.readShortVecLength()
    return RawInstruction(programIdIndex, accountIndexes, reader.readBytes(dataLength))
}

private fun readLookup(reader: ByteReader): AddressTableLookup {
    val tableAddress = readAddress(reader)
    val writableIndexes = readIndexVector(reader)
    val readonlyIndexes = readIndexVector(reader)
    return AddressTableLookup(tableAddress, writableIndexes, readonlyIndexes)
}

private fun <Item> readVector(reader: ByteReader, readItem: (ByteReader) -> Item): List<Item> {
    val length = reader.readShortVecLength()
    return List(length) { readItem(reader) }
}

fun parseTransaction(transactionBytes: ByteArray): RawTransaction {
    if (transactionBytes.size > EngineConstants.MAXIMUM_TRANSACTION_BYTES) {
        throw TransactionParseException("Transaction exceeds the packet size limit: ${transactionBytes.size}")
    }
    val reader = ByteReader(transactionBytes)
    val signatureCount = reader.readShortVecLength()
    reader.readBytes(signatureCount * EngineConstants.SIGNATURE_BYTE_LENGTH)

    val firstMessageByte = reader.readByte()
    val isVersioned = (firstMessageByte and EngineConstants.VERSION_PREFIX_FLAG) != 0
    var version = "legacy"
    var requiredSignerCount = firstMessageByte
    if (isVersioned) {
        val versionNumber = firstMessageByte and EngineConstants.VERSION_PREFIX_MASK
        if (versionNumber != SUPPORTED_MESSAGE_VERSION) throw TransactionParseException("Unsupported message version $versionNumber")
        version = "0"
        requiredSignerCount = reader.readByte()
    }
    reader.readByte()
    reader.readByte()
    val staticAccountKeys = readVector(reader, ::readAddress)
    val recentBlockhash = readAddress(reader)
    val instructions = readVector(reader, ::readInstruction)
    val lookups = if (version == "0") readVector(reader, ::readLookup) else emptyList()

    if (reader.remaining != 0) throw TransactionParseException("Trailing bytes after transaction: ${reader.remaining}")
    if (requiredSignerCount == 0 || requiredSignerCount > staticAccountKeys.size) {
        throw TransactionParseException("Invalid required signer count $requiredSignerCount")
    }
    return RawTransaction(version, signatureCount, requiredSignerCount, staticAccountKeys, recentBlockhash, instructions, lookups)
}
