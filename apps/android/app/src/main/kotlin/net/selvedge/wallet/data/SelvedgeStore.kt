package net.selvedge.wallet.data

import android.content.Context
import android.content.SharedPreferences
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.serialization.builtins.ListSerializer
import kotlinx.serialization.json.Json

private const val PREFERENCES_NAME = "selvedge_state"
private const val AGENTS_KEY = "agents"
private const val ACTIVITY_KEY = "activity"
private const val CONNECTION_KEY = "connection"
private const val SETTINGS_KEY = "settings"
private const val MAXIMUM_ACTIVITY_ENTRIES = 200

class StoreCorruptionException(entryName: String, cause: Throwable) :
    IllegalStateException("Stored $entryName could not be read: ${cause.message}", cause)

interface KeyValueStorage {
    fun read(key: String): String?
    fun write(key: String, value: String)
}

class PreferencesStorage(context: Context) : KeyValueStorage {
    private val preferences: SharedPreferences = context.getSharedPreferences(PREFERENCES_NAME, Context.MODE_PRIVATE)
    override fun read(key: String): String? = preferences.getString(key, null)
    override fun write(key: String, value: String) = preferences.edit().putString(key, value).apply()
}

class MemoryStorage : KeyValueStorage {
    private val values = mutableMapOf<String, String>()
    override fun read(key: String): String? = values[key]
    override fun write(key: String, value: String) {
        values[key] = value
    }
}

class SelvedgeStore(private val storage: KeyValueStorage) {
    private val json = Json { ignoreUnknownKeys = true }
    private val agentListSerializer = ListSerializer(AgentRecord.serializer())
    private val activityListSerializer = ListSerializer(ActivityEntry.serializer())

    private val agentsState = MutableStateFlow(readAgents())
    private val activityState = MutableStateFlow(readActivity())
    private val connectionState = MutableStateFlow(readConnection())
    private val settingsState = MutableStateFlow(readSettings())

    val agents: StateFlow<List<AgentRecord>> = agentsState.asStateFlow()
    val activity: StateFlow<List<ActivityEntry>> = activityState.asStateFlow()
    val connection: StateFlow<WalletConnection?> = connectionState.asStateFlow()
    val settings: StateFlow<AppSettings> = settingsState.asStateFlow()

    private fun <T> decode(entryName: String, decoder: () -> T): T = try {
        decoder()
    } catch (failure: kotlinx.serialization.SerializationException) {
        throw StoreCorruptionException(entryName, failure)
    } catch (failure: IllegalArgumentException) {
        throw StoreCorruptionException(entryName, failure)
    }

    private fun readAgents(): List<AgentRecord> =
        storage.read(AGENTS_KEY)?.let { stored -> decode(AGENTS_KEY) { json.decodeFromString(agentListSerializer, stored) } } ?: emptyList()

    private fun readActivity(): List<ActivityEntry> =
        storage.read(ACTIVITY_KEY)?.let { stored -> decode(ACTIVITY_KEY) { json.decodeFromString(activityListSerializer, stored) } } ?: emptyList()

    private fun readConnection(): WalletConnection? =
        storage.read(CONNECTION_KEY)?.takeIf { stored -> stored.isNotBlank() }?.let { stored -> decode(CONNECTION_KEY) { json.decodeFromString(WalletConnection.serializer(), stored) } }

    private fun readSettings(): AppSettings =
        storage.read(SETTINGS_KEY)?.let { stored -> decode(SETTINGS_KEY) { json.decodeFromString(AppSettings.serializer(), stored) } } ?: AppSettings()

    fun saveAgent(record: AgentRecord) {
        val others = agentsState.value.filter { existing -> existing.id != record.id }
        val updated = (listOf(record) + others).sortedByDescending { agent -> agent.createdAt }
        storage.write(AGENTS_KEY, json.encodeToString(agentListSerializer, updated))
        agentsState.value = updated
    }

    fun findAgent(agentId: String): AgentRecord? = agentsState.value.firstOrNull { agent -> agent.id == agentId }

    fun appendActivity(entry: ActivityEntry) {
        val updated = (listOf(entry) + activityState.value).take(MAXIMUM_ACTIVITY_ENTRIES)
        storage.write(ACTIVITY_KEY, json.encodeToString(activityListSerializer, updated))
        activityState.value = updated
    }

    fun saveConnection(connection: WalletConnection?) {
        if (connection == null) {
            storage.write(CONNECTION_KEY, "")
            connectionState.value = null
            return
        }
        storage.write(CONNECTION_KEY, json.encodeToString(WalletConnection.serializer(), connection))
        connectionState.value = connection
    }

    fun saveSettings(settings: AppSettings) {
        storage.write(SETTINGS_KEY, json.encodeToString(AppSettings.serializer(), settings))
        settingsState.value = settings
    }
}
