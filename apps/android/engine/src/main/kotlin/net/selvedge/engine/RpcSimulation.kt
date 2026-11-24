package net.selvedge.engine

import java.io.IOException
import java.math.BigInteger
import java.net.HttpURLConnection
import java.net.SocketTimeoutException
import java.net.URL
import java.util.Base64
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.longOrNull
import kotlinx.serialization.json.put

private const val COMMITMENT = "processed"
private const val HTTP_OK = 200
private const val HTTP_ERROR_THRESHOLD = 400

interface HttpTransport {
    fun post(url: String, body: String, timeoutMilliseconds: Int): HttpReply
}

class HttpReply(val status: Int, val body: String)

class UrlConnectionTransport : HttpTransport {
    override fun post(url: String, body: String, timeoutMilliseconds: Int): HttpReply {
        val connection = URL(url).openConnection() as HttpURLConnection
        connection.requestMethod = "POST"
        connection.connectTimeout = timeoutMilliseconds
        connection.readTimeout = timeoutMilliseconds
        connection.doOutput = true
        connection.setRequestProperty("content-type", "application/json")
        try {
            connection.outputStream.use { stream -> stream.write(body.toByteArray(Charsets.UTF_8)) }
            val stream = if (connection.responseCode < HTTP_ERROR_THRESHOLD) connection.inputStream else connection.errorStream
            val text = stream?.bufferedReader(Charsets.UTF_8)?.use { reader -> reader.readText() } ?: ""
            return HttpReply(connection.responseCode, text)
        } finally {
            connection.disconnect()
        }
    }
}

class SimulationRpcClient(
    private val rpcUrl: String,
    private val transport: HttpTransport = UrlConnectionTransport(),
    private val timeoutMilliseconds: Int = EngineConstants.SIMULATION_TIMEOUT_MILLISECONDS,
) {
    private val json = Json { ignoreUnknownKeys = true }

    private fun call(rpcMethod: String, parameters: JsonArray): JsonObject {
        val requestBody = buildJsonObject {
            put("jsonrpc", "2.0")
            put("id", 1)
            put("method", rpcMethod)
            put("params", parameters)
        }.toString()
        val reply = try {
            transport.post(rpcUrl, requestBody, timeoutMilliseconds)
        } catch (timeout: SocketTimeoutException) {
            throw SimulationTimeoutException(rpcMethod, timeoutMilliseconds)
        } catch (failure: IOException) {
            throw SimulationRpcException("RPC request failed for $rpcMethod: ${failure.message}")
        }
        if (reply.status != HTTP_OK) throw SimulationRpcException("RPC responded with HTTP ${reply.status} for $rpcMethod")
        val envelope = try {
            json.parseToJsonElement(reply.body).jsonObject
        } catch (failure: IllegalArgumentException) {
            throw SimulationRpcException("RPC response for $rpcMethod was not JSON")
        }
        val error = envelope["error"]
        if (error != null && error !is JsonNull) {
            throw SimulationRpcException(error.jsonObject["message"]?.jsonPrimitive?.contentOrNull ?: "unknown RPC error")
        }
        return envelope["result"]?.jsonObject ?: throw SimulationRpcException("RPC response for $rpcMethod had no result")
    }

    private fun toSnapshots(addresses: List<String>, values: JsonArray): List<AccountSnapshot> {
        val snapshots = mutableListOf<AccountSnapshot>()
        addresses.forEachIndexed { index, address ->
            val value = values.getOrNull(index)
            if (value == null || value is JsonNull) return@forEachIndexed
            val account = value.jsonObject
            snapshots.add(
                AccountSnapshot(
                    address = address,
                    lamports = BigInteger.valueOf(account.getValue("lamports").jsonPrimitive.longOrNull ?: 0L),
                    ownerProgram = account.getValue("owner").jsonPrimitive.content,
                    data = Base64.getDecoder().decode(account.getValue("data").jsonArray[0].jsonPrimitive.content),
                ),
            )
        }
        return snapshots
    }

    fun simulate(transactionBase64: String, watchedAddresses: List<String>): SimulationOutcome {
        val addressArray = buildJsonArray { watchedAddresses.forEach { address -> add(JsonPrimitive(address)) } }
        val preState = call(
            "getMultipleAccounts",
            buildJsonArray {
                add(addressArray)
                add(buildJsonObject { put("encoding", "base64"); put("commitment", COMMITMENT) })
            },
        )
        val simulation = call(
            "simulateTransaction",
            buildJsonArray {
                add(JsonPrimitive(transactionBase64))
                add(
                    buildJsonObject {
                        put("encoding", "base64")
                        put("sigVerify", false)
                        put("replaceRecentBlockhash", true)
                        put("commitment", COMMITMENT)
                        put("accounts", buildJsonObject { put("encoding", "base64"); put("addresses", addressArray) })
                    },
                )
            },
        )
        val value = simulation.getValue("value").jsonObject
        val postValues = (value["accounts"] as? JsonArray) ?: JsonArray(emptyList())
        val preValues = preState.getValue("value").jsonArray
        val deltas = computeAssetDeltas(toSnapshots(watchedAddresses, preValues), toSnapshots(watchedAddresses, postValues))
        val error: JsonElement? = value["err"]
        val failed = error != null && error !is JsonNull
        val logs = (value["logs"] as? JsonArray)?.map { entry -> entry.jsonPrimitive.content } ?: emptyList()
        return SimulationOutcome(
            succeeded = !failed,
            errorDescription = if (failed) error.toString() else null,
            unitsConsumed = value["unitsConsumed"]?.jsonPrimitive?.longOrNull,
            logs = logs,
            deltas = deltas,
        )
    }
}

fun reviewTransaction(
    transactionBase64: String,
    context: ReviewContext,
    simulationClient: SimulationRpcClient?,
    lookupTables: LookupTableContents = emptyMap(),
): ReviewResult {
    val decoded = decodeTransactionBase64(transactionBase64, lookupTables)
    val simulation = simulationClient?.simulate(transactionBase64, decoded.resolvedAccountKeys.distinct())
    val deltas = simulation?.deltas ?: emptyList()
    val assessment = assessRisk(
        RuleInput(decoded, deltas, simulation?.let { SimulationStatus(it.succeeded, it.errorDescription) }, context),
    )
    return ReviewResult(decoded, simulation, assessment, explainReview(assessment, deltas, context))
}
