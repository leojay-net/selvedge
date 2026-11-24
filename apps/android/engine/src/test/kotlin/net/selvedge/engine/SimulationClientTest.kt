package net.selvedge.engine

import java.math.BigInteger
import java.net.SocketTimeoutException
import java.util.Base64
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertFalse
import kotlin.test.assertTrue

private const val WALLET = "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU"
private const val TOKEN_ACCOUNT = "DDorK5hW2iufBzDi3mmpuiFW2mZT57jGFE2jewmp7pxd"

private class ScriptedTransport(private val replies: List<() -> HttpReply>) : HttpTransport {
    private var index = 0
    override fun post(url: String, body: String, timeoutMilliseconds: Int): HttpReply = replies[index++]()
}

private fun tokenAccountBase64(owner: String, mint: String, amount: Long): String {
    val data = ByteArray(165)
    Base58.decode(mint).copyInto(data, 0)
    Base58.decode(owner).copyInto(data, 32)
    for (byteIndex in 0 until 8) data[64 + byteIndex] = ((amount shr (8 * byteIndex)) and 0xff).toByte()
    return Base64.getEncoder().encodeToString(data)
}

private fun accountJson(base64: String): String =
    """{"lamports":2039280,"owner":"${ProgramIds.TOKEN}","data":["$base64","base64"]}"""

class SimulationClientTest {
    @Test
    fun combinesPreAndPostStateIntoDeltas() {
        val transport = ScriptedTransport(
            listOf(
                { HttpReply(200, """{"result":{"value":[${accountJson(tokenAccountBase64(WALLET, Assets.DEVNET_USDC_MINT, 900))}]}}""") },
                {
                    HttpReply(
                        200,
                        """{"result":{"value":{"err":null,"logs":["ok"],"unitsConsumed":1234,"accounts":[${accountJson(tokenAccountBase64(WALLET, Assets.DEVNET_USDC_MINT, 100))}]}}}""",
                    )
                },
            ),
        )
        val outcome = SimulationRpcClient("http://rpc.test", transport).simulate("AA==", listOf(TOKEN_ACCOUNT))
        assertTrue(outcome.succeeded)
        assertEquals(1234L, outcome.unitsConsumed)
        assertEquals(listOf(AssetDelta(WALLET, Assets.DEVNET_USDC_MINT, "900", "100", "-800")), outcome.deltas)
    }

    @Test
    fun reportsOnChainFailureWithoutThrowing() {
        val transport = ScriptedTransport(
            listOf(
                { HttpReply(200, """{"result":{"value":[null]}}""") },
                { HttpReply(200, """{"result":{"value":{"err":{"InstructionError":[0,"Custom"]},"logs":null,"accounts":null}}}""") },
            ),
        )
        val outcome = SimulationRpcClient("http://rpc.test", transport).simulate("AA==", listOf(TOKEN_ACCOUNT))
        assertFalse(outcome.succeeded)
        assertTrue(outcome.errorDescription.orEmpty().contains("InstructionError"))
    }

    @Test
    fun raisesTypedErrorsForHttpRpcAndTimeoutFailures() {
        val httpFailure = ScriptedTransport(listOf({ HttpReply(503, "") }))
        assertFailsWith<SimulationRpcException> { SimulationRpcClient("http://rpc.test", httpFailure).simulate("AA==", emptyList()) }
        val rpcFailure = ScriptedTransport(listOf({ HttpReply(200, """{"error":{"code":-32002,"message":"blockhash not found"}}""") }))
        val thrown = assertFailsWith<SimulationRpcException> { SimulationRpcClient("http://rpc.test", rpcFailure).simulate("AA==", emptyList()) }
        assertTrue(thrown.message.orEmpty().contains("blockhash not found"))
        val timeout = ScriptedTransport(listOf({ throw SocketTimeoutException("slow") }))
        assertFailsWith<SimulationTimeoutException> { SimulationRpcClient("http://rpc.test", timeout).simulate("AA==", emptyList()) }
    }

    @Test
    fun base58RoundTripsKeysAndLeadingZeroes() {
        val key = Base58.decode(ProgramIds.MANDATE)
        assertEquals(32, key.size)
        assertEquals(ProgramIds.MANDATE, Base58.encode(key))
        assertEquals("11111111111111111111111111111111", Base58.encode(ByteArray(32)))
        assertEquals(BigInteger.ZERO, BigInteger(1, Base58.decode(ProgramIds.SYSTEM)))
    }

    @Test
    fun parserRejectsTruncatedAndOversizedInput() {
        assertFailsWith<TransactionParseException> { decodeTransactionBytes(ByteArray(1233)) }
        assertFailsWith<TransactionParseException> { decodeTransactionBytes(byteArrayOf(1, 0, 0)) }
    }
}
