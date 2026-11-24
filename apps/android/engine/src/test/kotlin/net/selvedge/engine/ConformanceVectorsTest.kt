package net.selvedge.engine

import java.math.BigInteger
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.boolean
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive

private const val MINIMUM_POLICY_CASES = 250

class ConformanceVectorsTest {
    private fun lookupTablesOf(case: JsonObject): LookupTableContents =
        case.getValue("lookupTables").jsonObject.mapValues { (_, entries) -> entries.jsonArray.map { entry -> entry.jsonPrimitive.content } }

    private fun deltasOf(case: JsonObject): List<AssetDelta> =
        case.getValue("deltas").jsonArray.map { element ->
            val delta = element.jsonObject
            AssetDelta(
                delta.getValue("owner").jsonPrimitive.content,
                delta.getValue("asset").jsonPrimitive.content,
                delta.getValue("before").jsonPrimitive.content,
                delta.getValue("after").jsonPrimitive.content,
                delta.getValue("change").jsonPrimitive.content,
            )
        }

    private fun strings(array: JsonArray): List<String> = array.map { entry -> entry.jsonPrimitive.content }

    private fun contextOf(case: JsonObject): ReviewContext {
        val context = case.getValue("context").jsonObject
        val mintInfo = context.getValue("mintInfo").jsonArray.map { element ->
            val info = element.jsonObject
            MintInfo(
                info.getValue("mint").jsonPrimitive.content,
                info.getValue("tokenProgram").jsonPrimitive.content,
                strings(info.getValue("extensions").jsonArray),
            )
        }
        return ReviewContext(strings(context.getValue("walletAddresses").jsonArray), strings(context.getValue("knownAddresses").jsonArray), mintInfo)
    }

    @Test
    fun decodeVectorsMatchTheReferenceDecoder() {
        val cases = VectorSupport.loadCases("decode/decode.v1.json")
        assertTrue(cases.size >= 10, "decode vectors loaded")
        for (case in cases) {
            val name = case.getValue("name").jsonPrimitive.content
            val decoded = decodeTransactionBase64(case.getValue("transactionBase64").jsonPrimitive.content, lookupTablesOf(case))
            assertEquals(case.getValue("expected"), VectorSupport.decodedToJson(decoded), "decode case: $name")
        }
        println("decode vectors passed: ${cases.size}")
    }

    @Test
    fun riskVectorsMatchTheReferenceEngine() {
        val cases = VectorSupport.loadCases("risk/risk.v1.json")
        assertTrue(cases.size >= 20, "risk vectors loaded")
        for (case in cases) {
            val name = case.getValue("name").jsonPrimitive.content
            val decoded = decodeTransactionBase64(case.getValue("transactionBase64").jsonPrimitive.content, lookupTablesOf(case))
            val simulationJson = case.getValue("simulation")
            val simulation = if (simulationJson is JsonObject) {
                SimulationStatus(simulationJson.getValue("succeeded").jsonPrimitive.boolean, simulationJson.getValue("errorDescription").jsonPrimitive.contentOrNull)
            } else {
                null
            }
            val context = contextOf(case)
            val deltas = deltasOf(case)
            val assessment = assessRisk(RuleInput(decoded, deltas, simulation, context))
            val expected = case.getValue("expected").jsonObject
            assertEquals(expected.getValue("rulesetVersion").jsonPrimitive.content, assessment.rulesetVersion, "ruleset: $name")
            assertEquals(expected.getValue("findings"), JsonArray(assessment.findings.map(VectorSupport::findingToJson)), "findings: $name")
            assertEquals(expected.getValue("score").jsonPrimitive.content.toInt(), assessment.score, "score: $name")
            assertEquals(expected.getValue("verdict").jsonPrimitive.content, assessment.verdict.wire, "verdict: $name")
            assertEquals(expected.getValue("explanation").jsonPrimitive.content, explainReview(assessment, deltas, context), "explanation: $name")
        }
        println("risk vectors passed: ${cases.size}")
    }

    private fun stateOf(json: JsonObject): MandateState = MandateState(
        owner = json.getValue("owner").jsonPrimitive.content,
        agent = json.getValue("agent").jsonPrimitive.content,
        securityAuthority = json.getValue("securityAuthority").jsonPrimitive.content,
        periodCap = BigInteger(json.getValue("periodCap").jsonPrimitive.content),
        periodSeconds = BigInteger(json.getValue("periodSeconds").jsonPrimitive.content),
        periodStart = BigInteger(json.getValue("periodStart").jsonPrimitive.content),
        spentInPeriod = BigInteger(json.getValue("spentInPeriod").jsonPrimitive.content),
        expiry = BigInteger(json.getValue("expiry").jsonPrimitive.content),
        revoked = json.getValue("revoked").jsonPrimitive.boolean,
        nonce = BigInteger(json.getValue("nonce").jsonPrimitive.content),
        allowedPrograms = strings(json.getValue("allowedPrograms").jsonArray),
        allowedPayees = strings(json.getValue("allowedPayees").jsonArray),
        allowedTools = strings(json.getValue("allowedTools").jsonArray).map(::BigInteger),
    )

    private fun stateToJson(state: MandateState): JsonObject = kotlinx.serialization.json.buildJsonObject {
        put("owner", kotlinx.serialization.json.JsonPrimitive(state.owner))
        put("agent", kotlinx.serialization.json.JsonPrimitive(state.agent))
        put("securityAuthority", kotlinx.serialization.json.JsonPrimitive(state.securityAuthority))
        put("periodCap", kotlinx.serialization.json.JsonPrimitive(state.periodCap.toString()))
        put("periodSeconds", kotlinx.serialization.json.JsonPrimitive(state.periodSeconds.toString()))
        put("periodStart", kotlinx.serialization.json.JsonPrimitive(state.periodStart.toString()))
        put("spentInPeriod", kotlinx.serialization.json.JsonPrimitive(state.spentInPeriod.toString()))
        put("expiry", kotlinx.serialization.json.JsonPrimitive(state.expiry.toString()))
        put("revoked", kotlinx.serialization.json.JsonPrimitive(state.revoked))
        put("nonce", kotlinx.serialization.json.JsonPrimitive(state.nonce.toString()))
        put("allowedPrograms", JsonArray(state.allowedPrograms.map { value -> kotlinx.serialization.json.JsonPrimitive(value) }))
        put("allowedPayees", JsonArray(state.allowedPayees.map { value -> kotlinx.serialization.json.JsonPrimitive(value) }))
        put("allowedTools", JsonArray(state.allowedTools.map { value -> kotlinx.serialization.json.JsonPrimitive(value.toString()) }))
    }

    private fun updateOf(json: JsonObject): LimitUpdate = LimitUpdate(
        periodCap = BigInteger(json.getValue("periodCap").jsonPrimitive.content),
        periodSeconds = BigInteger(json.getValue("periodSeconds").jsonPrimitive.content),
        expiry = BigInteger(json.getValue("expiry").jsonPrimitive.content),
        allowedPrograms = strings(json.getValue("allowedPrograms").jsonArray),
        allowedPayees = strings(json.getValue("allowedPayees").jsonArray),
        allowedTools = strings(json.getValue("allowedTools").jsonArray).map(::BigInteger),
    )

    private fun execute(case: JsonObject): MandateState {
        val state = stateOf(case.getValue("state").jsonObject)
        val now = BigInteger(case.getValue("now").jsonPrimitive.content)
        val input = case.getValue("input").jsonObject
        return when (val operation = case.getValue("operation").jsonPrimitive.content) {
            "spend" -> authorizeSpend(
                state,
                SpendRequest(
                    input.getValue("signer").jsonPrimitive.content,
                    BigInteger(input.getValue("amount").jsonPrimitive.content),
                    BigInteger(input.getValue("toolId").jsonPrimitive.content),
                    input.getValue("program").jsonPrimitive.content,
                    input.getValue("payee").jsonPrimitive.content,
                    BigInteger(input.getValue("expectedNonce").jsonPrimitive.content),
                ),
                now,
            )
            "revoke" -> authorizeRevoke(state, input.getValue("signer").jsonPrimitive.content)
            "update_limits" -> authorizeLimitUpdate(state, input.getValue("signer").jsonPrimitive.content, updateOf(input.getValue("update").jsonObject), now)
            "rotate_agent" -> authorizeAgentRotation(state, input.getValue("signer").jsonPrimitive.content, input.getValue("newAgent").jsonPrimitive.content)
            "roll_period" -> rollPeriod(state, now)
            else -> error("Unknown policy operation $operation")
        }
    }

    @Test
    fun policyVectorsMatchTheOnChainLogic() {
        val cases = VectorSupport.loadCases("policy/policy.v1.json")
        assertTrue(cases.size >= MINIMUM_POLICY_CASES, "policy vectors loaded")
        for (case in cases) {
            val name = case.getValue("name").jsonPrimitive.content
            val expected = case.getValue("expected").jsonObject
            val okState = expected["ok"]
            if (okState != null) {
                assertEquals(okState, stateToJson(execute(case)), "policy case: $name")
            } else {
                val rejection = runCatching { execute(case) }.exceptionOrNull()
                assertTrue(rejection is PolicyRejection, "policy case should be rejected: $name")
                assertEquals(expected.getValue("rejection").jsonPrimitive.content, rejection.rejection, "policy rejection: $name")
            }
        }
        println("policy vectors passed: ${cases.size}")
    }
}
