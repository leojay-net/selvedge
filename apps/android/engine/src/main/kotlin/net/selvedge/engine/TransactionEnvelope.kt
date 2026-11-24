package net.selvedge.engine

private const val SIGNATURE_BYTE_LENGTH = 64

class TransactionEnvelope(val signatureCount: Int, val messageBytes: ByteArray, private val signaturesOffset: Int, private val original: ByteArray) {
    fun withSignatureAt(signerIndex: Int, signature: ByteArray): ByteArray {
        if (signature.size != SIGNATURE_BYTE_LENGTH) throw TransactionParseException("Signature must be $SIGNATURE_BYTE_LENGTH bytes, got ${signature.size}")
        if (signerIndex !in 0 until signatureCount) throw TransactionParseException("Signer index $signerIndex outside $signatureCount signature slots")
        val signed = original.copyOf()
        signature.copyInto(signed, signaturesOffset + signerIndex * SIGNATURE_BYTE_LENGTH)
        return signed
    }
}

fun openEnvelope(transactionBytes: ByteArray): TransactionEnvelope {
    val reader = ByteReader(transactionBytes)
    val signatureCount = reader.readShortVecLength()
    val signaturesOffset = transactionBytes.size - reader.remaining
    reader.readBytes(signatureCount * SIGNATURE_BYTE_LENGTH)
    val messageStart = transactionBytes.size - reader.remaining
    return TransactionEnvelope(signatureCount, transactionBytes.copyOfRange(messageStart, transactionBytes.size), signaturesOffset, transactionBytes)
}

fun signerIndexOf(decoded: DecodedTransaction, publicKeyBase58: String): Int {
    val index = decoded.requiredSigners.indexOf(publicKeyBase58)
    if (index < 0) throw TransactionParseException("$publicKeyBase58 is not a required signer of this transaction")
    return index
}
