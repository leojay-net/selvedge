package net.selvedge.wallet

import java.util.Base64
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.boolean
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import net.selvedge.engine.AssetDelta
import net.selvedge.engine.MintInfo
import net.selvedge.engine.ReviewContext
import net.selvedge.engine.ReviewResult
import net.selvedge.engine.RuleInput
import net.selvedge.engine.SimulationStatus
import net.selvedge.engine.assessRisk
import net.selvedge.engine.decodeTransactionBase64
import net.selvedge.engine.explainReview
import net.selvedge.wallet.review.ReviewOutcome
import net.selvedge.wallet.review.effectiveVerdictFor

class SampleReview(val outcome: ReviewOutcome, val transactionBytes: ByteArray, val walletAddress: String)

object SampleReviews {
    private fun cases(): List<JsonObject> {
        val stream = checkNotNull(SampleReviews::class.java.classLoader.getResourceAsStream("risk/risk.v1.json")) { "risk vectors are not on the test classpath" }
        val text = stream.bufferedReader().use { reader -> reader.readText() }
        return Json.parseToJsonElement(text).jsonObject.getValue("cases").jsonArray.map { case -> case.jsonObject }
    }

    fun load(caseName: String, simulationAvailable: Boolean = true): SampleReview {
        val case = cases().first { candidate -> candidate.getValue("name").jsonPrimitive.content == caseName }
        val base64 = case.getValue("transactionBase64").jsonPrimitive.content
        val lookupTables = case.getValue("lookupTables").jsonObject.mapValues { (_, entries) -> entries.jsonArray.map { entry -> entry.jsonPrimitive.content } }
        val decoded = decodeTransactionBase64(base64, lookupTables)
        val contextJson = case.getValue("context").jsonObject
        val context = ReviewContext(
            contextJson.getValue("walletAddresses").jsonArray.map { it.jsonPrimitive.content },
            contextJson.getValue("knownAddresses").jsonArray.map { it.jsonPrimitive.content },
            contextJson.getValue("mintInfo").jsonArray.map { element ->
                val info = element.jsonObject
                MintInfo(info.getValue("mint").jsonPrimitive.content, info.getValue("tokenProgram").jsonPrimitive.content, info.getValue("extensions").jsonArray.map { it.jsonPrimitive.content })
            },
        )
        val deltas = case.getValue("deltas").jsonArray.map { element ->
            val delta = element.jsonObject
            AssetDelta(
                delta.getValue("owner").jsonPrimitive.content, delta.getValue("asset").jsonPrimitive.content,
                delta.getValue("before").jsonPrimitive.content, delta.getValue("after").jsonPrimitive.content, delta.getValue("change").jsonPrimitive.content,
            )
        }
        val simulationJson = case.getValue("simulation")
        val status = if (simulationJson is JsonObject) {
            SimulationStatus(simulationJson.getValue("succeeded").jsonPrimitive.boolean, simulationJson.getValue("errorDescription").jsonPrimitive.contentOrNull)
        } else {
            null
        }
        val assessment = assessRisk(RuleInput(decoded, deltas, status, context))
        val result = ReviewResult(decoded, null, assessment, explainReview(assessment, deltas, context))
        val outcome = ReviewOutcome(base64, result, if (simulationAvailable) null else "test", effectiveVerdictFor(assessment.verdict, simulationAvailable))
        return SampleReview(outcome, Base64.getDecoder().decode(base64), context.walletAddresses.first())
    }
}
