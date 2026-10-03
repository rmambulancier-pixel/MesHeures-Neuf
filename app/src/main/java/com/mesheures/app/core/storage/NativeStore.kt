package com.mesheures.app.core.storage

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject

object NativeStore {
    private const val PREFS = "mesheures_native_v36"
    private const val KEY_DB = "legacy_db"
    private const val KEY_MIGRATED = "migration_done"

    private fun prefs(context: Context) =
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    @JvmStatic
    fun saveLegacyDb(context: Context, raw: String) {
        JSONObject(raw)
        prefs(context).edit()
            .putString(KEY_DB, raw)
            .putBoolean(KEY_MIGRATED, true)
            .apply()
    }

    @JvmStatic
    fun hasMigration(context: Context): Boolean =
        prefs(context).getBoolean(KEY_MIGRATED, false) &&
        !prefs(context).getString(KEY_DB, null).isNullOrBlank()

    @JvmStatic
    fun rawDb(context: Context): JSONObject {
        return try {
            JSONObject(prefs(context).getString(KEY_DB, "{}") ?: "{}")
        } catch (_: Exception) {
            JSONObject()
        }
    }

    @JvmStatic
    fun days(context: Context): List<JSONObject> {
        val db = rawDb(context)
        val out = mutableListOf<JSONObject>()
        val days = db.optJSONObject("days") ?: return out

        val keys = days.keys()
        while (keys.hasNext()) {
            val date = keys.next()
            val value = days.opt(date)

            when (value) {
                is JSONObject -> {
                    val copy = JSONObject(value.toString())
                    copy.put("_date", date)
                    out.add(copy)
                }
                is JSONArray -> {
                    out.add(
                        JSONObject()
                            .put("_date", date)
                            .put("_array", value)
                    )
                }
            }
        }

        return out.sortedBy { it.optString("_date") }
    }

    @JvmStatic
    fun romi(context: Context): JSONObject =
        rawDb(context).optJSONObject("romi") ?: JSONObject()

    @JvmStatic
    fun periods(context: Context): JSONArray =
        rawDb(context).optJSONArray("periods") ?: JSONArray()

    @JvmStatic
    fun bulletins(context: Context): JSONArray =
        rawDb(context).optJSONArray("bulletins") ?: JSONArray()
}
