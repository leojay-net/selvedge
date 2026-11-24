package net.selvedge.engine

import java.io.File
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject

object VectorSupport {
    private val json = Json

    fun loadCases(relativePath: String): List<JsonObject> {
        val vectorDirectory = requireNotNull(System.getProperty("selvedge.vectors")) { "selvedge.vectors property is not set" }
        val text = File(vectorDirectory, relativePath).readText()
        return json.parseToJsonElement(text).jsonObject.getValue("cases").jsonArray.map { case -> case.jsonObject }
    }

    fun detailToJson(detail: Detail): JsonElement = when (detail) {
        is Detail.Text -> JsonPrimitive(detail.value)
        is Detail.Whole -> JsonPrimitive(detail.value)
        is Detail.Flag -> JsonPrimitive(detail.value)
        Detail.Nothing -> JsonNull
    }

    private fun detailsToJson(details: Map<String, Detail>): JsonObject = buildJsonObject {
        details.forEach { (name, detail) -> put(name, detailToJson(detail)) }
    }

    private fun strings(values: List<String>): JsonArray = JsonArray(values.map { value -> JsonPrimitive(value) })

    private fun indexes(values: List<Int>): JsonArray = JsonArray(values.map { value -> JsonPrimitive(value) })

    fun instructionToJson(instruction: DecodedInstruction): JsonObject = buildJsonObject {
        put("programId", JsonPrimitive(instruction.programId))
        put("programLabel", JsonPrimitive(instruction.programLabel))
        put("known", JsonPrimitive(instruction.known))
        put("kind", JsonPrimitive(instruction.kind))
        put("accounts", strings(instruction.accounts))
        put("details", detailsToJson(instruction.details))
    }

    fun decodedToJson(decoded: DecodedTransaction): JsonObject = buildJsonObject {
        put("version", if (decoded.version == "legacy") JsonPrimitive("legacy") else JsonPrimitive(0))
        put("signatureCount", JsonPrimitive(decoded.signatureCount))
        put("requiredSignerCount", JsonPrimitive(decoded.requiredSignerCount))
        put("feePayer", JsonPrimitive(decoded.feePayer))
        put("requiredSigners", strings(decoded.requiredSigners))
        put("recentBlockhash", JsonPrimitive(decoded.recentBlockhash))
        put("staticAccountKeys", strings(decoded.staticAccountKeys))
        put(
            "addressTableLookups",
            JsonArray(
                decoded.addressTableLookups.map { lookup ->
                    buildJsonObject {
                        put("tableAddress", JsonPrimitive(lookup.tableAddress))
                        put("writableIndexes", indexes(lookup.writableIndexes))
                        put("readonlyIndexes", indexes(lookup.readonlyIndexes))
                    }
                },
            ),
        )
        put("lookupsResolved", JsonPrimitive(decoded.lookupsResolved))
        put("resolvedAccountKeys", strings(decoded.resolvedAccountKeys))
        put("instructions", JsonArray(decoded.instructions.map(::instructionToJson)))
    }

    fun findingToJson(finding: RiskFinding): JsonObject = buildJsonObject {
        put("ruleId", JsonPrimitive(finding.ruleId))
        put("severity", JsonPrimitive(finding.severity.wire))
        put("title", JsonPrimitive(finding.title))
        put("detail", JsonPrimitive(finding.detail))
        put("evidence", detailsToJson(finding.evidence))
    }
}
