package net.selvedge.engine

import kotlin.test.Test
import kotlin.test.assertContentEquals
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith

class TransactionEnvelopeTest {
    private fun sampleTransactionBytes(): ByteArray {
        val firstCase = VectorSupport.loadCases("decode/decode.v1.json").first()
        return java.util.Base64.getDecoder().decode(firstCase.getValue("transactionBase64").let { (it as kotlinx.serialization.json.JsonPrimitive).content })
    }

    @Test
    fun separatesSignaturesFromTheSignedMessage() {
        val bytes = sampleTransactionBytes()
        val envelope = openEnvelope(bytes)
        assertEquals(bytes.size - 1 - envelope.signatureCount * 64, envelope.messageBytes.size)
    }

    @Test
    fun insertsASignatureOnlyIntoItsOwnSlot() {
        val bytes = sampleTransactionBytes()
        val envelope = openEnvelope(bytes)
        val signature = ByteArray(64) { index -> (index + 1).toByte() }
        val signed = envelope.withSignatureAt(0, signature)
        assertContentEquals(signature, signed.copyOfRange(1, 65))
        assertContentEquals(envelope.messageBytes, openEnvelope(signed).messageBytes)
        assertFailsWith<TransactionParseException> { envelope.withSignatureAt(envelope.signatureCount, signature) }
        assertFailsWith<TransactionParseException> { envelope.withSignatureAt(0, ByteArray(63)) }
    }
}
