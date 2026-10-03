package com.mesheures.app.nativeui

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.mesheures.app.core.engine.WorkDayEngine
import com.mesheures.app.core.repository.AndroidMesHeuresRepository
import java.time.LocalDate
import java.time.YearMonth
import java.time.temporal.ChronoUnit
import java.util.Locale

class NativeDashboardActivity : ComponentActivity() {

    private var refresh by mutableIntStateOf(0)

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        setContent {
            val repo = remember { AndroidMesHeuresRepository(this@NativeDashboardActivity) }
            NativeDashboard(repo, refresh)
        }
    }

    override fun onResume() {
        super.onResume()
        refresh++
    }
}

private data class Metric(
    val label: String,
    val value: String
)

@Composable
private fun NativeDashboard(
    repo: AndroidMesHeuresRepository,
    refresh: Int
) {
    val today = remember(refresh) { LocalDate.now() }
    val month = YearMonth.from(today)

    val monthDays = remember(refresh) {
        repo.getRange(
            month.atDay(1).toString(),
            month.atEndOfMonth().toString()
        )
    }

    val monthCalcs = monthDays.map { WorkDayEngine.calculate(it) }
    val tteMonth = monthCalcs.sumOf { it.effectiveMinutes }

    val workCount = monthDays.count {
        it.type == "T" || it.type == "NUIT"
    }

    val restCount = monthDays.count {
        it.type == "REPOS" || it.type == "RC"
    }

    val cpCount = monthDays.count { it.type == "CP" }
    val malCount = monthDays.count { it.type == "MAL" }

    val weekStart = today.minusDays((today.dayOfWeek.value - 1).toLong())
    val weekEnd = weekStart.plusDays(6)

    val weekTte = repo.getRange(
        weekStart.toString(),
        weekEnd.toString()
    ).sumOf { WorkDayEngine.calculate(it).effectiveMinutes }

    val periodStart = today.minusDays(13)
    val periodTte = repo.getRange(
        periodStart.toString(),
        today.toString()
    ).sumOf { WorkDayEngine.calculate(it).effectiveMinutes }

    val metrics = listOf(
        Metric("Travail", workCount.toString()),
        Metric("Repos", restCount.toString()),
        Metric("Congé", cpCount.toString()),
        Metric("Maladie", malCount.toString()),
        Metric("TTE mois", hm(tteMonth)),
        Metric("TTE semaine", hm(weekTte)),
        Metric("TTE 14 jours", hm(periodTte)),
        Metric("Alertes", monthCalcs.sumOf { it.alerts.size }.toString())
    )

    MaterialTheme {
        Surface(
            modifier = Modifier.fillMaxSize()
        ) {
            LazyColumn(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(
                        start = 18.dp,
                        end = 18.dp,
                        top = 36.dp,
                        bottom = 24.dp
                    ),
                verticalArrangement = Arrangement.spacedBy(10.dp)
            ) {
                item {
                    Text(
                        "MesHeures",
                        style = MaterialTheme.typography.headlineMedium
                    )
                    Text(
                        "Dashboard natif · ${month.monthValue}/${month.year}",
                        style = MaterialTheme.typography.bodyMedium
                    )
                }

                items(metrics.chunked(2).size) { index ->
                    val pair = metrics.chunked(2)[index]

                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(10.dp)
                    ) {
                        pair.forEach {
                            Card(modifier = Modifier.weight(1f)) {
                                Column(
                                    modifier = Modifier.padding(14.dp)
                                ) {
                                    Text(
                                        it.label,
                                        style = MaterialTheme.typography.labelMedium
                                    )
                                    Text(
                                        it.value,
                                        style = MaterialTheme.typography.titleLarge
                                    )
                                }
                            }
                        }

                        if (pair.size == 1) {
                            Spacer(Modifier.weight(1f))
                        }
                    }
                }

                item {
                    Card(
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Column(
                            modifier = Modifier.padding(16.dp)
                        ) {
                            Text(
                                "Source native",
                                style = MaterialTheme.typography.titleMedium
                            )
                            Text(
                                "Repository Android · calcul WorkDayEngine",
                                style = MaterialTheme.typography.bodyMedium
                            )
                            Text(
                                "Les données historiques ont été migrées depuis mesheures_v3.",
                                style = MaterialTheme.typography.bodySmall
                            )
                        }
                    }
                }

                item {
                    Button(
                        onClick = { },
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Text("Actualiser")
                    }
                }
            }
        }
    }
}

private fun hm(value: Int): String {
    return String.format(
        Locale.FRANCE,
        "%dh%02d",
        value / 60,
        value % 60
    )
}
