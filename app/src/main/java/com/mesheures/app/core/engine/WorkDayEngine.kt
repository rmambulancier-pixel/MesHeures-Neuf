package com.mesheures.app.core.engine
import com.mesheures.app.core.model.DayRecord
data class DayCalculation(val amplitudeMinutes:Int=0,val pauseMinutes:Int=0,val effectiveMinutes:Int=0,val idajMinutes:Int=0,val alerts:List<String> = emptyList())
object WorkDayEngine {
 fun calculate(d:DayRecord):DayCalculation {
  val s=d.start ?: return DayCalculation(); var e=d.end ?: return DayCalculation(); if(e<=s)e+=1440
  val amp=e-s
  val pauses=d.pauses.sumOf{var x=it.end;if(x<=it.start)x+=1440;(x-it.start).coerceAtLeast(0)}
  val meal=if(d.meal?.automatic==true)d.meal.durationMinutes else 0
  val tte=(amp-pauses-meal).coerceAtLeast(0)
  val idaj=(amp-720).coerceAtLeast(0)
  val a=buildList { if(amp>900)add("Amplitude > 15 h — extension à documenter.") else if(amp>840)add("Amplitude > 14 h — vérifier le cas d’extension applicable jusqu’à 15 h.") else if(amp>720)add("Amplitude > 12 h — IDAJ et conditions d’extension à vérifier."); if(tte>720)add("TTE > 12 h — journée exceptionnellement longue.") }
  return DayCalculation(amp,pauses,tte,idaj,a)
 }
}
