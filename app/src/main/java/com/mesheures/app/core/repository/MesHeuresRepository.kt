package com.mesheures.app.core.repository

import android.content.Context
import com.mesheures.app.core.model.DayRecord
import com.mesheures.app.core.model.MealRecord
import com.mesheures.app.core.model.PauseRecord
import com.mesheures.app.core.storage.NativeStore
import org.json.JSONArray
import org.json.JSONObject

interface MesHeuresRepository {
    fun getDay(date: String): DayRecord?
    fun saveDay(day: DayRecord)
    fun getRange(start: String, end: String): List<DayRecord>
}

class AndroidMesHeuresRepository(
    private val context: Context
) : MesHeuresRepository {

    override fun getDay(date: String): DayRecord? =
        decode(date, NativeStore.rawDb(context)
            .optJSONObject("days")
            ?.opt(date))

    override fun saveDay(day: DayRecord) {
        val db = NativeStore.rawDb(context)
        val days = db.optJSONObject("days") ?: JSONObject()
        days.put(day.date, encode(day))
        db.put("days", days)
        NativeStore.saveLegacyDb(context, db.toString())
    }

    override fun getRange(start: String, end: String): List<DayRecord> =
        NativeStore.days(context)
            .mapNotNull { decode(it.optString("_date"), it) }
            .filter { it.date >= start && it.date <= end }

    private fun decode(date: String, value: Any?): DayRecord? {
        if (date.isBlank() || value == null || value == JSONObject.NULL) return null

        if (value is JSONArray) {
            val type = value.optString(1, "REPOS")
            val start = parseTime(value.optString(2, ""))
            val end = parseTime(value.optString(3, ""))
            val pauses = parsePauses(value.optJSONArray(4))
            return DayRecord(date, type, start, end, pauses, null)
        }

        if (value is JSONObject) {
            val type = value.optString("t", value.optString("type", "REPOS"))
            val start = parseTime(value.optString("deb", value.optString("start", "")))
            val end = parseTime(value.optString("fin", value.optString("end", "")))
            val pauses = parsePauses(value.optJSONArray("p"))
            val mealObj = value.optJSONObject("meal")
            val meal = if (mealObj != null)
                MealRecord(
                    mealObj.optBoolean("auto", mealObj.optBoolean("automatic", false)),
                    mealObj.optInt("duration", 30)
                )
            else null

            return DayRecord(date, type, start, end, pauses, meal)
        }

        return null
    }

    private fun encode(d: DayRecord): JSONObject =
        JSONObject().apply {
            put("t", d.type)
            d.start?.let { put("deb", formatTime(it)) }
            d.end?.let { put("fin", formatTime(it)) }
            put("p", JSONArray().apply {
                d.pauses.forEach {
                    put(
                        JSONArray()
                            .put(formatTime(it.start))
                            .put(formatTime(it.end))
                    )
                }
            })
            d.meal?.let {
                put(
                    "meal",
                    JSONObject()
                        .put("auto", it.automatic)
                        .put("duration", it.durationMinutes)
                )
            }
        }

    private fun parsePauses(a: JSONArray?): List<PauseRecord> {
        if (a == null) return emptyList()
        val out = mutableListOf<PauseRecord>()
        for (i in 0 until a.length()) {
            val p = a.optJSONArray(i) ?: continue
            val s = parseTime(p.optString(0, ""))
            val e = parseTime(p.optString(1, ""))
            if (s != null && e != null) out.add(PauseRecord(s, e))
        }
        return out
    }

    private fun parseTime(s: String): Int? {
        val p = s.trim().split(":")
        if (p.size != 2) return null
        val h = p[0].toIntOrNull() ?: return null
        val m = p[1].toIntOrNull() ?: return null
        if (h !in 0..23 || m !in 0..59) return null
        return h * 60 + m
    }

    private fun formatTime(v: Int): String =
        "%02d:%02d".format(v / 60, v % 60)
}
