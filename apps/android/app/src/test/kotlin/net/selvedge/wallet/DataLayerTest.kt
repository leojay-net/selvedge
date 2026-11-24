package net.selvedge.wallet

import java.math.BigInteger
import java.security.KeyFactory
import java.security.Signature
import java.security.spec.X509EncodedKeySpec
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertIs
import kotlin.test.assertNull
import kotlin.test.assertTrue
import kotlinx.coroutines.runBlocking
import net.selvedge.engine.Base58
import net.selvedge.engine.ProgramIds
import net.selvedge.engine.RiskVerdict
import net.selvedge.engine.SigningGate
import net.selvedge.wallet.data.AgentRecord
import net.selvedge.wallet.data.MandateField
import net.selvedge.wallet.data.MandateFormInput
import net.selvedge.wallet.data.MandateFormResult
import net.selvedge.wallet.data.MemoryStorage
import net.selvedge.wallet.data.PeriodChoice
import net.selvedge.wallet.data.SelvedgeStore
import net.selvedge.wallet.data.StoreCorruptionException
import net.selvedge.wallet.data.StoredMandate
import net.selvedge.wallet.data.WalletConnection
import net.selvedge.wallet.data.formatUsdc
import net.selvedge.wallet.data.parseUsdcAmount
import net.selvedge.wallet.data.validateMandateForm
import net.selvedge.wallet.signing.TestWalletBackend

private const val NOW_SECONDS = 1_800_000_000L
private const val VALID_PAYEE = "EwBNZzFxdjvp6hXbwJsuovs8epVL7oGN17pYyAG3uNrE"

private fun validInput(cap: String = "25") = MandateFormInput("Scout", VALID_PAYEE, cap, PeriodChoice.DAY, "30", ProgramIds.TOKEN, VALID_PAYEE, "1, 2")

class DataLayerTest {
    @Test
    fun usdcAmountsParseToSixDecimalUnits() {
        assertEquals(BigInteger("25000000"), parseUsdcAmount("25"))
        assertEquals(BigInteger("1500000"), parseUsdcAmount("1.5"))
        assertEquals(BigInteger("1"), parseUsdcAmount("0.000001"))
        assertNull(parseUsdcAmount("0"))
        assertNull(parseUsdcAmount("-3"))
        assertNull(parseUsdcAmount("0.0000001"))
        assertNull(parseUsdcAmount("abc"))
        assertEquals("25 USDC", formatUsdc("25000000"))
        assertEquals("0.5 USDC", formatUsdc("500000"))
    }

    @Test
    fun aValidFormProducesADraftThatTheEngineAccepts() {
        val result = validateMandateForm(validInput(), NOW_SECONDS, requireAgentKey = true)
        val draft = assertIs<MandateFormResult.Valid>(result).draft
        assertEquals("25000000", draft.periodCap)
        assertEquals(NOW_SECONDS + 30 * 86_400, draft.expiry)
        assertEquals(listOf("1", "2"), draft.allowedTools)
    }

    @Test
    fun anInvalidFormNamesEveryBadField() {
        val input = MandateFormInput("", "not-a-key", "0", PeriodChoice.DAY, "0", "", "bad", "x")
        val errors = assertIs<MandateFormResult.Invalid>(validateMandateForm(input, NOW_SECONDS, requireAgentKey = true)).errors
        assertEquals(setOf(MandateField.NAME, MandateField.AGENT_KEY, MandateField.CAP, MandateField.EXPIRY, MandateField.PROGRAMS, MandateField.PAYEES, MandateField.TOOLS), errors.keys)
    }

    @Test
    fun storePersistsAgentsActivityAndConnection() {
        val storage = MemoryStorage()
        val store = SelvedgeStore(storage)
        val mandate = StoredMandate(VALID_PAYEE, VALID_PAYEE, VALID_PAYEE, "1", 60, 0, "0", 100, false, "0", listOf(ProgramIds.TOKEN), listOf(VALID_PAYEE), listOf("1"))
        store.saveAgent(AgentRecord("a1", "Scout", mandate, 5))
        store.saveConnection(WalletConnection("test_wallet", VALID_PAYEE))
        val reloaded = SelvedgeStore(storage)
        assertEquals("Scout", reloaded.agents.value.single().name)
        assertEquals(VALID_PAYEE, reloaded.connection.value?.publicKey)
        store.saveConnection(null)
        assertNull(SelvedgeStore(storage).connection.value)
    }

    @Test
    fun corruptStoredDataIsReportedWithItsName() {
        val storage = MemoryStorage()
        storage.write("agents", "{not json")
        val failure = assertFailsWith<StoreCorruptionException> { SelvedgeStore(storage) }
        assertTrue(failure.message.orEmpty().contains("agents"))
    }

    @Test
    fun testWalletSignaturesVerifyAgainstItsPublicKey() = runBlocking {
        val backend = TestWalletBackend(MemoryStorage())
        val publicKeyBase58 = backend.connect()
        assertEquals(publicKeyBase58, backend.connect())
        val gate = SigningGate(RiskVerdict.SAFE)
        gate.confirmWithoutBiometric()
        val message = "selvedge message".toByteArray()
        val signature = backend.signTransactionMessage(message, gate.permitForSigning())
        assertEquals(64, signature.size)
        val x509Prefix = byteArrayOf(0x30, 0x2a, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x70, 0x03, 0x21, 0x00)
        val publicKey = KeyFactory.getInstance("Ed25519").generatePublic(X509EncodedKeySpec(x509Prefix + Base58.decode(publicKeyBase58)))
        val verifier = Signature.getInstance("Ed25519")
        verifier.initVerify(publicKey)
        verifier.update(message)
        assertTrue(verifier.verify(signature))
    }
}
