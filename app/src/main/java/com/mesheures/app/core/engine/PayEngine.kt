package com.mesheures.app.core.engine
import com.mesheures.app.core.model.*
object PayEngine {
 fun calculate(days:List<DayRecord>):PaySummary {
  val c=days.map(WorkDayEngine::calculate); val t=c.sumOf{it.effectiveMinutes}
  return PaySummary(effectiveMinutes=t,normalMinutes=t.coerceAtMost(8400),idajMinutes=c.sumOf{it.idajMinutes})
 }
}
