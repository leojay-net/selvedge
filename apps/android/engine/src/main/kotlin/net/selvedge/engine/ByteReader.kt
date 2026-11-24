package net.selvedge.engine

import java.math.BigInteger

private const val SHORT_VEC_CONTINUATION_BIT = 0x80
private const val SHORT_VEC_VALUE_MASK = 0x7f
private const val SHORT_VEC_MAXIMUM_BYTES = 3
private const val SHORT_VEC_MAXIMUM_VALUE = 0xffff
private const val BITS_PER_SHORT_VEC_BYTE = 7
private const val BYTE_MASK = 0xff

class ByteReader(private val bytes: ByteArray) {
    private var position = 0

    val remaining: Int get() = bytes.size - position

    fun readByte(): Int {
        if (position >= bytes.size) throw TransactionParseException("Unexpected end of transaction bytes at $position")
        val value = bytes[position].toInt() and BYTE_MASK
        position += 1
        return value
    }

    fun readBytes(byteCount: Int): ByteArray {
        if (byteCount < 0 || position + byteCount > bytes.size) {
            throw TransactionParseException("Length prefix exceeds remaining bytes at $position")
        }
        val slice = bytes.copyOfRange(position, position + byteCount)
        position += byteCount
        return slice
    }

    fun readShortVecLength(): Int {
        var value = 0
        for (byteIndex in 0 until SHORT_VEC_MAXIMUM_BYTES) {
            val current = readByte()
            value = value or ((current and SHORT_VEC_VALUE_MASK) shl (byteIndex * BITS_PER_SHORT_VEC_BYTE))
            if ((current and SHORT_VEC_CONTINUATION_BIT) == 0) {
                if (value > SHORT_VEC_MAXIMUM_VALUE) throw TransactionParseException("Short vector length out of range")
                return value
            }
        }
        throw TransactionParseException("Short vector length uses too many bytes")
    }
}

fun readUnsignedLittleEndian(bytes: ByteArray, offset: Int, byteLength: Int): BigInteger {
    if (offset < 0 || offset + byteLength > bytes.size) {
        throw TransactionParseException("Instruction data too short: offset $offset length $byteLength available ${bytes.size}")
    }
    val reversed = ByteArray(byteLength) { index -> bytes[offset + byteLength - 1 - index] }
    return BigInteger(1, reversed)
}

fun readSignedLittleEndian64(bytes: ByteArray, offset: Int): BigInteger =
    BigInteger.valueOf(readUnsignedLittleEndian(bytes, offset, 8).toLong())
