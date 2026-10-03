package com.mesheures.app.core.model

data class DayRecord(
    val date: String,
    val type: String = "REPOS",
    val start: Int? = null,
    val end: Int? = null,
    val pauses: List<PauseRecord> = emptyList(),
    val meal: MealRecord? = null
)

data class PauseRecord(
    val start: Int,
    val end: Int
)

data class MealRecord(
    val automatic: Boolean = false,
    val durationMinutes: Int = 30
)
