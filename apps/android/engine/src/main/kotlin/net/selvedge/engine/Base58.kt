package net.selvedge.engine

import java.math.BigInteger

object Base58 {
    private const val ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz"
    private val BASE: BigInteger = BigInteger.valueOf(58)

    fun encode(bytes: ByteArray): String {
        var leadingZeros = 0
        while (leadingZeros < bytes.size && bytes[leadingZeros].toInt() == 0) leadingZeros += 1
        var value = BigInteger(1, bytes)
        val builder = StringBuilder()
        while (value.signum() > 0) {
            val divided = value.divideAndRemainder(BASE)
            builder.append(ALPHABET[divided[1].toInt()])
            value = divided[0]
        }
        repeat(leadingZeros) { builder.append(ALPHABET[0]) }
        return builder.reverse().toString()
    }

    fun decode(text: String): ByteArray {
        var value = BigInteger.ZERO
        for (character in text) {
            val digit = ALPHABET.indexOf(character)
            require(digit >= 0) { "Invalid base58 character '$character'" }
            value = value.multiply(BASE).add(BigInteger.valueOf(digit.toLong()))
        }
        val magnitude = value.toByteArray().dropWhile { byteValue -> byteValue.toInt() == 0 }.toByteArray()
        val leadingOnes = text.takeWhile { character -> character == ALPHABET[0] }.length
        return ByteArray(leadingOnes) + magnitude
    }
}
