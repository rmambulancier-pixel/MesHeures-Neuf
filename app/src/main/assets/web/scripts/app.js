// Orchestration principale — MesHeures

function gd(k){
  if(!DB.days[k])DB.days[k]={t:'REPOS',p:[]};
  if(!DB.days[k].p)DB.days[k].p=[];
  return DB.days[k];
}
function gb(s){
  if(!DB.bul[s])DB.bul[s]={p25:null,p50:null,rcOld:null,rcAcq:null};
  return DB.bul[s];
}
// v : null si le champ est laissé vide (« pas encore renseigné »), distinct de 0 (« renseigné à zéro »).
function setBul(f,v){gb(DB.per.start)[f]=(v===''||v==null||isNaN(v))?null:+v;save();mhRefresh('pay-field')}


const AD=[
['2025-05-19','T','08:00','20:00',[],0],['2025-05-21','T','08:00','20:00',[],0],
['2025-05-23','T','07:20','18:30',[['12:55','13:25','ENT']],0],
['2025-05-26','T','05:40','12:50',[],0],['2025-05-27','T','07:20','19:30',[['13:25','13:55','ENT']],0],
['2025-05-28','T','09:00','19:30',[['14:15','14:45','ENT']],0],
['2025-05-29','T','08:00','15:00',[],0],['2025-05-30','T','11:00','17:40',[],0],
['2025-06-02','T','11:45','20:35',[],0],['2025-06-03','T','06:45','17:40',[['12:12','12:42','ENT']],0],
['2025-06-04','T','09:15','18:50',[['14:02','14:32','ENT']],0],
['2025-06-05','T','09:50','18:15',[['14:02','14:32','ENT']],0],
['2025-06-06','T','05:40','16:20',[['11:00','11:30','ENT']],0],
['2025-06-09','T','07:00','14:00',[],0],['2025-06-10','T','07:00','17:40',[['12:20','12:50','ENT']],0],
['2025-06-11','T','10:50','19:40',[['15:15','15:45','ENT']],0],
['2025-06-12','T','08:30','18:00',[['13:15','13:45','ENT']],0],
['2025-06-13','T','07:00','18:00',[['12:30','13:00','ENT']],0],
['2025-06-16','T','07:40','17:30',[['12:35','13:05','ENT']],0],
['2025-06-17','T','07:30','19:10',[['13:20','13:50','ENT']],0],
['2025-06-18','T','07:20','16:00',[['11:40','12:10','ENT']],0],
['2025-06-19','T','09:15','18:20',[['13:47','14:17','ENT']],0],
['2025-06-20','T','04:30','14:50',[['09:40','10:10','ENT']],0],
['2025-06-23','T','07:20','17:30',[['12:25','12:55','ENT']],0],
['2025-06-24','T','11:45','18:10',[],0],['2025-06-25','T','07:15','13:00',[],0],
['2025-06-26','T','09:20','19:30',[['14:25','14:55','ENT']],0],
['2025-06-27','T','07:30','13:50',[],0],
['2025-06-30','T','11:45','20:10',[],0],['2025-07-01','T','09:30','19:20',[['14:25','14:55','ENT']],0],
['2025-07-02','T','06:50','17:50',[['12:20','12:50','ENT']],0],
['2025-07-03','T','13:30','21:00',[],0],['2025-07-04','T','09:50','19:00',[['14:25','14:55','ENT']],0],
['2025-07-07','T','09:40','20:00',[['14:50','15:20','ENT']],0],
['2025-07-08','T','14:30','19:30',[],0],['2025-07-09','T','06:00','17:00',[['11:30','12:00','ENT']],0],
['2025-07-10','T','09:00','19:30',[['14:15','14:45','ENT']],0],
['2025-07-11','T','08:30','18:10',[['13:20','13:50','ENT']],0],
['2025-07-25','T','13:20','19:20',[],0],
['2025-07-28','T','09:20','17:50',[['13:35','14:05','ENT']],0],
['2025-07-29','T','06:30','18:15',[['12:22','12:52','ENT']],0],
['2025-07-30','T','06:45','13:00',[],0],['2025-07-31','T','06:30','18:20',[['12:25','12:55','ENT']],0],
['2025-08-01','T','06:30','17:00',[['11:45','12:15','ENT']],0],
['2025-08-04','T','09:30','18:50',[['14:10','14:40','ENT']],0],
['2025-08-05','T','07:45','13:35',[],0],['2025-08-06','T','09:40','16:15',[['12:57','13:27','ENT']],0],
['2025-08-07','T','06:15','14:35',[],0],
['2025-08-11','T','07:00','14:00',[],0],['2025-08-12','T','06:50','15:20',[['11:05','11:35','ENT']],0],
['2025-08-13','T','07:00','16:00',[['11:30','12:00','ENT']],0],
['2025-08-14','T','12:20','19:30',[],0],['2025-08-15','T','07:00','17:45',[['12:22','12:52','ENT']],1],
['2025-08-18','T','07:00','17:00',[['12:00','12:30','ENT']],0],
['2025-08-19','T','07:45','20:10',[['13:57','14:27','ENT']],0],
['2025-08-20','T','08:00','17:05',[['12:32','13:02','ENT']],0],
['2025-08-21','T','06:30','18:10',[['12:20','12:50','ENT']],0],
['2025-08-22','T','07:45','18:30',[['13:07','13:37','ENT']],0],
['2025-08-25','T','06:45','16:00',[['11:22','11:52','ENT']],0],
['2025-08-26','T','08:15','18:30',[['13:22','13:52','ENT']],0],
['2025-08-27','T','08:45','17:15',[['13:00','13:30','ENT']],0],
['2025-08-28','T','07:00','18:15',[['12:37','13:07','ENT']],0],
['2025-08-29','T','10:15','18:20',[['14:17','14:47','ENT']],0],
['2025-09-01','T','11:45','19:30',[],0],['2025-09-02','T','07:30','18:30',[['13:00','13:30','ENT']],0],
['2025-09-03','T','06:50','16:20',[['11:35','12:05','ENT']],0],
['2025-09-04','T','06:30','16:20',[['11:25','11:55','ENT']],0],
['2025-09-05','T','07:40','16:05',[['11:52','12:22','ENT']],0],
['2025-09-08','T','09:50','18:10',[['14:00','14:30','ENT']],0],
['2025-09-09','T','07:30','18:00',[['12:45','13:15','ENT']],0],
['2025-09-10','T','06:20','17:40',[['12:00','12:30','ENT']],0],
['2025-09-11','T','10:30','16:30',[['13:30','14:00','ENT']],0],
['2025-09-12','T','06:15','19:00',[['12:37','13:07','ENT']],0],
['2025-09-15','T','10:15','17:20',[['13:47','14:17','ENT']],0],
['2025-09-16','T','06:15','17:00',[['11:37','12:07','ENT']],0],
['2025-09-18','T','06:40','18:20',[['12:30','13:00','ENT']],0],
['2025-09-19','T','07:20','17:40',[['12:30','13:00','ENT']],0],
['2025-09-22','T','13:30','20:30',[],0],['2025-09-23','T','11:20','21:20',[],0],
['2025-09-24','T','09:00','19:00',[['14:00','14:30','ENT']],0],
['2025-09-25','T','06:40','18:00',[['12:20','12:50','ENT']],0],
['2025-09-26','T','11:20','19:40',[],0],
['2025-09-29','T','09:15','20:20',[['14:47','15:17','ENT']],0],
['2025-09-30','T','08:20','18:45',[['13:32','14:02','ENT']],0],
['2025-10-01','T','09:00','18:30',[['13:45','14:15','ENT']],0],
['2025-10-02','T','06:40','15:20',[['11:00','11:30','ENT']],0],
['2025-10-03','T','07:30','17:30',[['12:30','13:00','ENT']],0],
['2025-10-06','T','07:15','13:00',[],0],['2025-10-07','T','07:45','17:50',[['12:47','13:17','ENT']],0],
['2025-10-08','T','06:50','18:00',[['12:25','12:55','ENT']],0],
['2025-10-09','T','07:30','19:00',[['13:15','13:45','ENT']],0],
['2025-10-10','T','07:40','18:30',[['13:05','13:35','ENT']],0],
['2025-10-13','T','05:20','19:00',[['12:10','12:40','ENT']],0],
['2025-10-14','T','13:20','19:40',[],0],['2025-10-15','T','08:00','18:20',[['13:10','13:40','ENT']],0],
['2025-10-16','T','09:10','19:50',[['14:30','15:00','ENT']],0],
['2025-10-17','T','08:15','19:50',[['14:02','14:32','ENT']],0],
['2025-10-20','T','09:20','19:00',[['14:10','14:40','ENT']],0],
['2025-10-21','T','06:40','17:30',[['12:05','12:35','ENT']],0],
['2025-10-22','T','06:45','17:45',[['12:15','12:45','ENT']],0],
['2025-10-23','T','06:00','14:20',[['10:10','10:40','ENT']],0],
['2025-10-24','T','07:30','15:20',[['11:25','11:55','ENT']],0],
['2025-10-29','T','09:00','19:00',[['14:00','14:30','ENT']],0],
['2025-10-30','T','08:45','19:00',[['13:52','14:22','ENT']],0],
['2025-10-31','T','06:40','18:00',[['12:20','12:50','ENT']],0],
['2025-11-03','T','09:40','20:00',[['14:50','15:20','ENT']],0],
['2025-11-04','T','11:00','20:30',[],0],['2025-11-05','T','07:30','16:30',[['12:00','12:30','ENT']],0],
['2025-11-06','T','12:00','20:20',[],0],['2025-11-07','T','08:00','17:00',[['12:30','13:00','ENT']],0],
['2025-11-12','T','06:30','17:40',[['12:05','12:35','ENT']],0],
['2025-11-13','T','06:40','19:00',[['12:50','13:20','ENT']],0],
['2025-11-14','T','06:30','17:00',[['11:45','12:15','ENT']],0],
['2025-11-17','T','06:45','17:30',[['12:07','12:37','ENT']],0],
['2025-11-18','T','09:00','14:20',[['11:40','12:10','ENT']],0],
['2025-11-19','T','09:30','19:50',[['14:40','15:10','ENT']],0],
['2025-11-20','T','14:10','19:00',[],0],['2025-11-21','T','05:40','17:00',[['11:20','11:50','ENT']],0],
['2025-11-24','T','06:40','18:40',[['12:40','13:10','ENT']],0],
['2025-11-25','T','06:50','18:20',[['12:35','13:05','ENT']],0],
['2025-11-26','T','06:20','14:00',[],0],['2025-11-27','T','06:50','17:30',[['12:10','12:40','ENT']],0],
['2025-11-28','T','14:00','18:00',[],0],
['2025-12-01','T','07:30','17:30',[['12:30','13:00','ENT']],0],
['2025-12-02','T','07:15','17:00',[['12:07','12:37','ENT']],0],
['2025-12-03','T','09:20','19:30',[['14:25','14:55','ENT']],0],
['2025-12-04','T','08:30','18:30',[['13:30','14:00','ENT']],0],
['2025-12-05','T','08:40','19:50',[['14:15','14:45','ENT']],0],
['2025-12-08','T','07:40','17:20',[['12:30','13:00','ENT']],0],
['2025-12-09','T','07:30','18:50',[['13:10','13:40','ENT']],0],
['2025-12-10','T','11:45','19:50',[],0],['2025-12-11','T','08:45','14:20',[],0],
['2025-12-12','T','07:20','15:10',[['11:15','11:45','ENT']],0],
['2025-12-15','T','07:45','17:30',[['12:37','13:07','ENT']],0],
['2025-12-16','T','08:15','19:20',[['12:00','12:30','EXT']],0],
['2025-12-17','T','07:45','18:50',[['13:17','13:47','ENT']],0],
['2025-12-18','T','09:15','18:30',[['12:00','12:30','EXT']],0],
['2025-12-19','T','06:45','15:20',[['11:02','11:32','ENT']],0],
['2025-12-22','CP',null,null,[],0],['2025-12-23','CP',null,null,[],0],
['2025-12-24','CP',null,null,[],0],['2025-12-25','CP',null,null,[],0],
['2025-12-26','CP',null,null,[],0],['2025-12-27','CP',null,null,[],0],
['2025-12-29','CP',null,null,[],0],['2025-12-30','CP',null,null,[],0],
['2025-12-31','CP',null,null,[],0],['2026-01-01','CP',null,null,[],0],
['2026-01-02','CP',null,null,[],0],
['2026-01-05','T','07:20','18:10',[['12:30','13:00','EXT']],0],
['2026-01-06','T','06:50','18:20',[['12:00','12:30','EXT']],0],
['2026-01-07','T','06:30','14:40',[['12:20','12:50','EXT']],0],
['2026-01-08','T','07:15','16:30',[['13:30','14:00','EXT']],0],
['2026-01-09','T','08:30','18:20',[['13:00','13:30','ENT']],0],
['2026-01-12','T','07:30','17:20',[['13:00','13:30','ENT']],0],
['2026-01-13','T','06:30','17:40',[['11:20','11:50','EXT']],0],
['2026-01-14','T','07:30','17:30',[['12:00','12:30','ENT']],0],
['2026-01-15','T','12:45','18:20',[],0],['2026-01-16','T','08:20','18:40',[['12:00','12:30','ENT']],0],
['2026-01-19','T','07:00','17:30',[['12:15','12:45','EXT']],0],
['2026-01-20','T','08:30','19:00',[['12:00','12:30','EXT']],0],
['2026-01-21','T','07:15','17:30',[['11:00','11:30','EXT']],0],
['2026-01-22','T','10:20','18:30',[['12:00','12:30','EXT']],0],
['2026-01-23','T','08:40','17:30',[['13:00','13:30','EXT']],0],
['2026-01-26','T','10:10','17:20',[['13:30','14:00','ENT']],0],
['2026-01-27','T','08:00','12:30',[],0],['2026-01-28','T','06:40','17:30',[['13:00','13:30','EXT']],0],
['2026-01-29','T','07:40','17:20',[['12:30','13:00','ENT']],0],
['2026-01-30','T','05:30','16:15',[['13:15','13:45','ENT']],0],
['2026-02-02','T','09:30','19:00',[['13:30','14:00','EXT']],0],
['2026-02-03','T','11:30','16:50',[],0],['2026-02-04','T','07:15','17:45',[['11:20','11:50','EXT']],0],
['2026-02-05','T','08:30','13:50',[],0],['2026-02-06','T','08:10','12:20',[],0],
['2026-02-09','RC',null,null,[],0],['2026-02-10','RC',null,null,[],0],
['2026-02-11','RC',null,null,[],0],['2026-02-12','RC',null,null,[],0],
['2026-02-13','RC',null,null,[],0],
['2026-02-16','T','07:20','17:30',[['13:00','13:30','EXT']],0],
['2026-02-17','T','08:15','17:00',[['12:30','13:00','EXT']],0],
['2026-02-18','T','07:45','16:00',[['13:30','14:00','EXT']],0],
['2026-02-19','T','08:10','18:00',[['13:00','13:30','EXT']],0],
['2026-02-20','T','07:20','17:30',[['11:45','12:15','EXT']],0],
['2026-02-23','T','07:15','13:20',[],0],['2026-02-24','T','06:30','18:00',[['12:15','12:45','EXT']],0],
['2026-02-25','T','07:45','17:00',[['12:00','12:30','ENT']],0],
['2026-02-26','T','09:00','16:00',[['13:00','13:30','ENT']],0],
['2026-02-27','T','09:30','17:20',[['12:45','13:15','EXT']],0],
['2026-03-02','T','06:45','13:00',[],0],['2026-03-03','T','06:15','14:40',[['12:30','13:00','EXT']],0],
['2026-03-04','T','08:30','18:30',[['12:45','13:15','ENT']],0],
['2026-03-05','T','08:20','20:30',[['12:00','12:30','EXT']],0],
['2026-03-06','T','08:50','18:00',[['13:30','14:00','EXT']],0],
['2026-03-09','T','10:15','20:30',[['14:00','14:30','ENT']],0],
['2026-03-10','T','10:20','17:50',[['12:30','13:00','ENT']],0],
['2026-03-11','T','10:45','16:30',[['12:00','12:30','EXT']],0],
['2026-03-12','T','08:00','18:00',[['11:50','12:20','EXT']],0],
['2026-03-13','T','11:00','20:20',[],0],['2026-03-15','T','14:45','16:10',[],0],
['2026-03-16','T','08:20','17:20',[['11:00','11:30','ENT']],0],
['2026-03-17','T','07:30','18:20',[['13:30','14:00','EXT']],0],
['2026-03-18','T','06:00','16:10',[['11:20','11:50','EXT']],0],
['2026-03-19','T','09:15','18:15',[['12:15','12:45','EXT']],0],
['2026-03-20','T','10:30','18:10',[['13:00','13:30','EXT']],0],
['2026-03-23','T','08:00','17:30',[['13:15','13:45','EXT']],0],
['2026-03-24','RC',null,null,[],0],['2026-03-25','RC',null,null,[],0],
['2026-03-26','RC',null,null,[],0],['2026-03-27','RC',null,null,[],0],
['2026-03-30','T','08:15','19:40',[['13:45','14:15','EXT']],0],
['2026-03-31','RC',null,null,[],0],
['2026-04-01','MAL',null,null,[],0],['2026-04-02','MAL',null,null,[],0],
['2026-04-03','MAL',null,null,[],0],['2026-04-06','MAL',null,null,[],0],
['2026-04-07','MAL',null,null,[],0],['2026-04-08','MAL',null,null,[],0],
['2026-04-09','MAL',null,null,[],0],['2026-04-10','MAL',null,null,[],0],
['2026-04-13','MAL',null,null,[],0],['2026-04-14','MAL',null,null,[],0],
['2026-04-15','MAL',null,null,[],0],['2026-04-16','MAL',null,null,[],0],
['2026-04-17','MAL',null,null,[],0],['2026-04-20','MAL',null,null,[],0],
['2026-04-21','MAL',null,null,[],0],['2026-04-22','MAL',null,null,[],0],
['2026-04-23','MAL',null,null,[],0],['2026-04-24','MAL',null,null,[],0],
['2026-04-27','MAL',null,null,[],0],['2026-04-28','MAL',null,null,[],0],
['2026-04-29','MAL',null,null,[],0],['2026-04-30','MAL',null,null,[],0],
['2026-05-01','MAL',null,null,[],0],['2026-05-04','MAL',null,null,[],0],
['2026-05-05','MAL',null,null,[],0],['2026-05-06','MAL',null,null,[],0],
['2026-05-07','MAL',null,null,[],0],['2026-05-08','MAL',null,null,[],0],
['2026-05-11','MAL',null,null,[],0],['2026-05-12','MAL',null,null,[],0],
['2026-05-13','MAL',null,null,[],0],['2026-05-14','MAL',null,null,[],0],
['2026-05-15','MAL',null,null,[],0],['2026-05-18','MAL',null,null,[],0],
['2026-05-19','MAL',null,null,[],0],['2026-05-20','MAL',null,null,[],0],
['2026-05-21','MAL',null,null,[],0],['2026-05-22','MAL',null,null,[],0],
['2026-05-25','MAL',null,null,[],0],['2026-05-26','MAL',null,null,[],0],
['2026-05-27','MAL',null,null,[],0],['2026-05-28','MAL',null,null,[],0],
['2026-05-29','MAL',null,null,[],0],['2026-06-01','MAL',null,null,[],0],
['2026-06-02','MAL',null,null,[],0],
['2026-06-03','T','06:10','18:00',[['12:15','12:45','EXT']],0],
['2026-06-04','T','09:15','18:10',[['11:45','12:15','EXT']],0],
['2026-06-05','T','11:15','19:30',[],0],
['2026-06-08','T','08:30','17:30',[['12:00','12:30','EXT']],0],
['2026-06-09','T','08:40','17:00',[['13:30','14:00','EXT']],0],
['2026-06-10','T','08:10','17:30',[['11:00','11:30','EXT']],0],
['2026-06-11','T','10:40','19:00',[['13:45','14:15','EXT']],0],
['2026-06-12','T','07:20','18:40',[['12:30','13:00','EXT']],0],
['2026-06-15','T','05:40','17:30',[['11:00','11:30','EXT']],0],
['2026-06-16','T','08:00','16:00',[['13:45','14:15','EXT']],0],
['2026-06-17','T','09:15','19:15',[['11:30','12:00','EXT']],0],
['2026-06-18','T','07:15','18:20',[['12:50','13:20','ENT']],0],
['2026-06-19','T','10:15','17:30',[['12:15','12:45','ENT']],0],
['2026-06-22','T','12:50','17:50',[],0],['2026-06-23','T','07:00','17:30',[['14:00','14:30','EXT']],0],
['2026-06-24','T','07:30','13:00',[],0],['2026-06-25','T','07:20','17:40',[['12:30','13:00','ENT']],0],
['2026-06-26','T','07:30','16:30',[['11:45','12:15','EXT']],0],
['2026-06-29','T','12:50','17:50',[],0],['2026-06-30','T','09:20','20:10',[['12:20','12:50','ENT']],0],
['2026-07-01','T','07:30','17:30',[['12:00','12:30','EXT']],0],
['2026-07-02','T','06:50','12:00',[],0],['2026-07-03','MAL',null,null,[],0],
['2026-07-06','T','07:15','18:00',[['12:45','13:15','EXT']],0],
['2026-07-07','T','07:45','18:45',[['13:45','14:15','EXT']],0],
['2026-07-08','T','08:00','18:30',[['11:45','12:15','EXT']],0],
['2026-07-09','T','06:30','16:15',[['13:15','13:45','EXT']],0],
['2026-07-10','T','10:20','17:40',[['11:45','12:15','EXT']],0],
['2026-07-13','CP',null,null,[],0],['2026-07-14','CP',null,null,[],0],
['2026-07-15','CP',null,null,[],0],['2026-07-16','CP',null,null,[],0],
['2026-07-17','CP',null,null,[],0],['2026-07-18','CP',null,null,[],0],
['2026-07-20','CP',null,null,[],0],['2026-07-21','CP',null,null,[],0],
['2026-07-22','CP',null,null,[],0],['2026-07-23','CP',null,null,[],0],
['2026-07-24','CP',null,null,[],0],['2026-07-25','CP',null,null,[],0],
['2026-07-27','T','06:50','18:15',[['12:30','13:00','EXT']],0],
['2026-07-28','T','12:10','21:00',[],0],['2026-07-29','T','10:00','17:45',[['12:30','13:00','ENT']],0],
['2026-07-30','T','07:00','16:00',[['12:00','12:30','EXT']],0],
['2026-07-31','T','07:45','16:45',[['12:45','13:15','ENT']],0],
['2026-08-01','T','06:30','13:00',[],0],
['2026-08-03','T','08:30','16:20',[['11:15','11:45','EXT']],0],
['2026-08-04','T','10:50','18:50',[['13:15','13:45','ENT']],0],
['2026-08-05','T','12:40','19:00',[],0],['2026-08-06','T','09:00','17:40',[['13:45','14:15','EXT']],0],
['2026-08-07','T','14:00','18:20',[],0],['2026-08-08','T','06:30','14:20',[],0],
['2026-08-10','T','07:50','18:50',[['11:30','12:00','ENT']],0],
['2026-08-11','T','07:15','19:15',[['13:30','14:00','ENT']],0],
['2026-08-12','T','08:00','16:10',[['12:00','12:30','ENT']],0],
['2026-08-13','T','07:00','18:00',[['11:30','12:00','EXT']],0],
['2026-08-14','T','08:45','14:00',[['13:29','13:59','ENT']],0],
['2026-08-15','T','06:30','21:00',[['12:00','12:30','EXT']],1],
['2026-08-17','T','08:45','19:00',[['11:45','12:15','EXT']],0],
['2026-08-18','T','07:40','20:20',[['12:00','12:30','ENT']],0],
['2026-08-19','T','09:20','19:20',[['13:00','13:30','EXT']],0],
['2026-08-20','T','05:40','17:40',[['13:15','13:45','ENT']],0],
['2026-08-21','RC',null,null,[],0],
['2026-08-24','T','05:45','17:10',[['12:20','12:50','ENT']],0],
['2026-08-25','T','08:30','19:30',[['14:30','15:00','EXT']],0],
['2026-08-26','T','07:00','13:50',[['12:00','12:30','EXT']],0],
['2026-08-27','T','08:20','19:00',[['14:30','15:00','EXT']],0],
['2026-08-28','T','07:00','16:00',[['14:00','14:30','EXT']],0],
['2026-08-29','T','06:30','14:20',[],0],
['2026-08-31','T','08:20','17:40',[['12:00','12:30','EXT']],0],
['2026-09-01','T','05:15','18:00',[['14:00','14:30','EXT']],0],
['2026-09-02','T','12:00','18:40',[],0],['2026-09-03','T','08:45','20:00',[['11:30','12:00','EXT']],0],
['2026-09-04','T','08:00','20:00',[],0],['2026-09-05','T','06:30','14:20',[],0],
];
const AP=['2025-05-19','2025-05-26','2025-06-02','2025-06-09','2025-06-16','2025-06-23',
'2025-06-30','2025-07-07','2025-07-14','2025-07-28','2025-08-11','2025-08-25',
'2025-09-08','2025-09-22','2025-10-06','2025-10-20','2025-11-03','2025-11-17',
'2025-12-01','2025-12-15','2025-12-29','2026-01-12','2026-01-26','2026-02-09',
'2026-02-23','2026-03-09','2026-03-23','2026-04-06','2026-04-20','2026-05-04',
'2026-05-18','2026-06-01','2026-06-15','2026-06-29','2026-07-13','2026-07-27',
'2026-08-10','2026-08-24'];

function loadArchive(){
  const pd=P(DB.s.panDeb),pf=P(DB.s.panFin);
  AD.forEach(([k,ty,deb,fin,pz,fer])=>{
    const d={t:ty,p:[]};
    if(ty==='T'){
      if(deb)d.deb=deb; if(fin)d.fin=fin;
      pz.forEach(([p1,p2,pty])=>d.p.push({d:p1,f:p2,ty:pty}));
      if(fer||isFerie(k))d.fer=true;
    }
    DB.days[k]=d;
  });
  AP.forEach(s=>{if(!DB.periods.some(p=>p.start===s))DB.periods.push({start:s,nb:1});gb(s);});
  DB.periods.sort((a,b)=>a.start<b.start?-1:1);
  DB.s.anchor='2025-05-19'; DB.per={start:'2025-05-19',nb:1};
  save(); curDate='2026-09-05'; curMonth='2026-09';
  if(typeof mhRefresh==='function') mhRefresh(); else window.__mh30PendingRefresh='archive-load';
  alert('✅ Archive chargée : '+AD.length+' journées · '+AP.length+' quatorzaines.');
}










const RG={
  rg1:[['taux','Taux horaire (€)'],['net','Coef brut→net'],['dimPrime','Prime dimanche (€)']],
  rg2:[['base','Base hebdo (h)'],['pl','Plafond HS 25%'],['anchor','Ancrage quatorzaine'],['rc','Durée RC (min)'],['cp','Durée CP (min)'],['maxAmp','Alerte amplitude (h)'],['rcAlerte','Seuil alerte RC (h)']],
  rg3:[['hab','Habillage (min/j)'],['habT','Taux habillage (€/h)'],['idaj','Seuil IDAJ (h)'],['ir','IR extérieur (€)'],['iru','IRU intérieur (€)'],['irT','Part exonérée IR extérieur (€)'],['panDeb','Repas midi début'],['panFin','Repas midi fin'],['panSoirDeb','Repas soir début'],['panSoirFin','Repas soir fin'],['nuitDeb','Nuit début'],['nuitFin','Nuit fin'],['nuitMaj','Majoration nuit (%)']]
};

/* ═══════════════════════════════════════════════
   PARSEUR BULLETIN EMPLOYEUR — v2 corrigé
═══════════════════════════════════════════════ */
const PDF_WORKER='vendor/pdfjs/pdf.worker.min.js';
let _wset=false;





/* ═══════════════════════════════════════════════
   ROMI1 — Récap Mensuel Salarié (relevé officiel)
   Document reçu en scan (aucun texte dans le PDF) : saisie manuelle assistée,
   avec contrôles croisés (RC, ancienneté, conversion HS→RC sans consentement).
═══════════════════════════════════════════════ */
const RM_FIELDS=[
  ['tteH','TTE période (h)'],['joursPresence','Jours de présence'],['hsPeriodeH','H. supp. période (h)'],
  ['tteAnneeH','TTE cumul année (h)'],['hsAnneeH','H. supp. cumul année (h)'],['joursAnnee','Jours présence année'],
  ['cpN1Solde','CP N-1 solde (j)'],['cpNAcquis','CP N acquis (j)'],['cpNPris','CP N pris (j)'],['cpNSolde','CP N solde (j)'],
  ['rcAvant','RC solde antérieur (h)'],['rcAcquis','RC acquis ce mois (h)'],['rcSolde','RC solde cumulé (h)'],
  ['salaireBaseH','Salaire de base (h)'],['depAmplH','Dépassement amplitude 100% (h)'],
  ['hs125EligH','HS 125% éligibles (h)'],['hs125PayeesH','HS 125% payées (h)'],
  ['hs150EligH','HS 150% éligibles (h)'],['hs150PayeesH','HS 150% payées (h)'],
  ['primeAncPct','Prime ancienneté (%)'],['habillageMontant','Habillage/déshabillage (€)'],
  ['indemniteRepasN','Indemnité de repas (nb)'],['indemniteRepasUniqueN','Indemnité de repas unique (nb)']
];
let romiTmp={};

async function parseRomiFile(file){
  const out=$('romiOcrOut');
  if(!file)return;
  out.innerHTML='<div class="al i">⏳ Lecture spécialisée du ROMI1…</div>';
  try{
    await mhLoadLib('pdf');
    const lib=window.pdfjsLib||window['pdfjs-dist/build/pdf'];
    if(!lib)throw new Error('PDF.js non chargé');
    if(!window.MHSpecializedReader)throw new Error('Lecteur spécialisé indisponible');
    const sp=await window.MHSpecializedReader.readRomi1(file,lib);
    const f=sp.fields||{};
    const found={
      start:f.periodStart?.value,end:f.periodEnd?.value,
      tteH:f.ttePeriodH?.value,joursPresence:f.presenceDays?.value,hsPeriodeH:f.hsPeriodH?.value,
      tteAnneeH:f.tteYearH?.value,hsAnneeH:f.hsYearH?.value,joursAnnee:f.presenceYearDays?.value,
      cpN1Solde:f.cpN1Balance?.value,cpNAcquis:f.cpNAcquired?.value,cpNPris:f.cpN1Taken?.value,
      cpNSolde:f.cpNBalance?.value,rcAvant:f.rcPreviousH?.value,rcAcquis:f.rcAcquiredH?.value,rcSolde:f.rcBalanceH?.value,
      salaireBaseH:f.salaryBaseH?.value,depAmplH:f.amplitudeOverH?.value,
      hs125EligH:f.hs125EligibleH?.value,hs125PayeesH:f.hs125PaidH?.value,
      hs150EligH:f.hs150EligibleH?.value,hs150PayeesH:f.hs150PaidH?.value,
      primeAncPct:f.seniorityPct?.value,habillageMontant:f.habillageEur?.value,
      indemniteRepasN:f.mealCount?.value,indemniteRepasUniqueN:f.uniqueMealCount?.value
    };
    Object.keys(found).forEach(k=>{if(found[k]==null)delete found[k]});
    romiTmp={...romiTmp,...found,_loaded:true};
    renderRomiTab();
    const n=Object.keys(found).length;
    out.innerHTML='<div class="al k">✅ ROMI1 lu par zones spécialisées — '+n+' valeur(s) récupérée(s). Vérifie avant enregistrement.</div>';
  }catch(err){
    out.innerHTML='<div class="al b">❌ Lecture spécialisée impossible ('+esc(err.message)+').</div>';
  }
  $('fromi').value='';
}

// Bornes de vraisemblance : au-delà, on rejette plutôt que d'enregistrer une valeur aberrante (OCR qui a fusionné plusieurs nombres).








/* ═══════════════════════════════════════════════
   IMPORT PDF AMBUTRACK
═══════════════════════════════════════════════ */
const RX_PER=/P[ée]riode du (\d{1,2})\/(\d{1,2})\/(\d{4}) au (\d{1,2})\/(\d{1,2})\/(\d{4})/gi;
const RX_DAY=/(\d{1,2}) (Lun|Mar|Mer|Jeu|Ven|Sam|Dim) ((?:(?!\d{1,2} (?:Lun|Mar|Mer|Jeu|Ven|Sam|Dim) |Semaine \d|Total quatorzaine|DATE TYPE|Avertissement|P[ée]riode du).)*)/g;
const RX_HOR=/(\d{1,2}:\d{2}) ?- ?(\d{1,2}:\d{2})/;
const RX_PZ=/(\d{1,2}:\d{2})-(\d{1,2}:\d{2}) ?\([^)]*\b(ENT|EXT)\b[^)]*\)/g;




load();
curDate=today();curMonth=curDate.slice(0,7);
if(!Object.keys(DB.days).length){
  loadArchive();
}else{
  if(typeof mhRefresh==='function') mhRefresh('settings-update');
  else window.__mh30PendingRefresh='settings-update';
}

let _tx=null;
document.addEventListener('touchstart',e=>{_tx=e.touches[0].clientX},{passive:true});
document.addEventListener('touchend',e=>{
  if(_tx===null)return;
  const dx=e.changedTouches[0].clientX-_tx;
  _tx=null;
  if(Math.abs(dx)<80)return;
  if(curTab==='jour'){dx<0?goDay(1):goDay(-1)}
  else if(curTab==='mois'){dx<0?goMonth(1):goMonth(-1)}
});
if('serviceWorker' in navigator){
  navigator.serviceWorker.register('./sw.js?v=37.0-0',{scope:'./'}).then(reg=>{
    try{
      window.mhServiceWorkerReady=!!reg;
      if(typeof reg.update==='function') reg.update().catch(()=>{});
    }catch(e){}
  }).catch(e=>{try{console.warn('MesHeures SW indisponible',e)}catch(_){} });
}

/* ═══════════════════════════════════════════════
   V15 — INTELLIGENCE / SÉCURITÉ / MODE PRO
   Couche additive : ne modifie pas les règles de calcul historiques.
═══════════════════════════════════════════════ */
const MH_V='36.2.0';

function mhMonthStatsRaw(ym){
  const [y,m]=ym.split('-').map(Number), last=isoOf(new Date(y,m+1,0));
  const out={amp:0,tte:0,trav:0,ir:0,iru:0,idaj:0,nuit:0,fer:0,dim:0,alerts:[],hard:0,warn:0,days:0};
  for(let k=ym+'-01';k<=last;k=addD(k,1)){
    const r=cd(k),d=DB.days[k];
    if(d)out.days++;
    out.amp+=r.amp;out.tte+=r.tte;out.trav+=r.trav;out.ir+=r.ir;out.iru+=r.iru;out.idaj+=r.idaj;out.nuit+=r.nuit;out.fer+=r.fer;out.dim+=r.dim;
    r.al.forEach(a=>{out.alerts.push({k,...a});a.lvl==='b'?out.hard++:out.warn++});
  }
  return out;
}
function mhMonthStats(ym){return window.MH30DataEngine?MH30DataEngine.month(ym):mhMonthStatsRaw(ym)}
function mhYearStats(y){
  const o={tte:0,trav:0,hs25:0,hs50:0,brut:0,alerts:0};
  for(let m=1;m<=12;m++){
    const s=mhMonthStats(y+'-'+pad(m));
    o.tte+=s.tte;o.trav+=s.trav;o.alerts+=s.alerts.length;
  }
  return o;
}
function mhOpenDay(k){curDate=k;curMonth=k.slice(0,7);tab('jour')}
function mhClass(v,good='ok',bad='bad'){return v>0?bad:good}

/* L'Accueil est rendu par window.MH31 (app-v31-home.js), seul propriétaire de #s-home. */
function renderHome(){
  return window.MH31?.renderHome?.();
}

let monthMode='calendar';
function setMonthMode(mode){
  monthMode=mode==='planning'?'planning':'calendar';
  const a=$('mModeCal'),b=$('mModePlan');
  if(a)a.classList.toggle('on',monthMode==='calendar');
  if(b)b.classList.toggle('on',monthMode==='planning');
  if(typeof mhRefresh==='function')mhRefresh('month-mode-change');else renderMonth();
}
function goTodayMonth(){curMonth=today().slice(0,7);curDate=today();if(typeof mhRefresh==='function')mhRefresh('month-today');else renderMonth();window.scrollTo(0,0)}
function monthDayState(d0,r){
  if(!d0)return 'empty';
  if(d0.t==='T')return r.al.some(a=>a.lvl==='b')?'work critical':'work';
  if(d0.t==='NUIT')return 'night';
  if(d0.t==='CP')return 'leave';
  if(d0.t==='RC')return 'rest';
  if(d0.t==='MAL')return 'sick';
  return 'empty';
}
function monthBadge(d0,r){
  if(d0.t==='CP')return '<span class="day-badge leave">CP</span>';
  if(d0.t==='RC')return '<span class="day-badge rest">RC</span>';
  if(d0.t==='MAL')return '<span class="day-badge sick">MAL</span>';
  if(d0.t==='NUIT')return '<span class="day-badge night">NUIT</span>';
  if(d0.t==='T')return '<span class="day-badge work">TRAVAIL</span>';
  return '<span class="day-badge empty">REPOS</span>';
}
function renderMonth(){
  const d=dOf(curMonth+'-01'),y=d.getFullYear(),m=d.getMonth(),first=new Date(y,m,1),days=new Date(y,m+1,0).getDate(),offset=(first.getDay()+6)%7;
  $('mLbl').textContent=MON[m]+' '+y;
  const s=mhMonthStats(curMonth), N=DB.s.base*120;
  const monthLabel=(s.trav+' jour'+(s.trav>1?'s':'')+' travaillé'+(s.trav>1?'s':'')+' · '+F(s.tte)+' TTE');
  const sum=$('mSummaryLine');if(sum)sum.textContent=monthLabel;
  if(monthMode==='planning'){
    let rows='';
    for(let n=1;n<=days;n++){
      const k=curMonth+'-'+pad(n),d0=gd(k),r=cd(k),state=monthDayState(d0,r),date=dOf(k),wd=['Dim','Lun','Mar','Mer','Jeu','Ven','Sam'][date.getDay()],alerts=r.al.length;
      const main=r.t==='T'||r.t==='NUIT'?F(r.tte):(d0.t==='CP'?'Congé payé':d0.t==='RC'?'Repos compensateur':d0.t==='MAL'?'Maladie':'Repos');
      const sub=r.t==='T'||r.t==='NUIT'?F(r.amp)+' amplitude · '+(r.pz?F(r.pz)+' pause':'pause OK'):shortY(k);
      rows+=`<button class="plan-row ${state} ${k===today()?'now':''}" onclick="mhOpenDay('${k}')"><span class="plan-date"><b>${pad(n)}</b><small>${wd}</small></span><span class="plan-main"><strong>${main}</strong><small>${sub}</small></span><span class="plan-meta">${monthBadge(d0,r)}${alerts?`<em>${alerts} ⚠</em>`:''}</span><span class="plan-arrow">›</span></button>`;
    }
    $('mCal').innerHTML=`<div class="planning-list">${rows}</div>`;
  }else{
    let h=['Lun','Mar','Mer','Jeu','Ven','Sam','Dim'].map(x=>`<div class="h">${x}</div>`).join('');
    const weeks=[];
    for(let n=1;n<=days;n++){
      const k=curMonth+'-'+pad(n),r=cd(k),idx=Math.floor((offset+n-1)/7);
      if(!weeks[idx])weeks[idx]=[];
      weeks[idx].push(n);
    }
    weeks.forEach((nums,wi)=>{
      const firstWeek=wi===0;
      if(firstWeek)for(let i=0;i<offset;i++)h+='<div class="cel off"></div>';
      while(nums.length<7)nums.push(null);
      let wa={amp:0,tte:0,trav:0};
      nums.forEach(n=>{
        if(!n){h+='<div class="cel off"></div>';return;}
        const k=curMonth+'-'+pad(n),d0=gd(k),r=cd(k),state=monthDayState(d0,r),a=r.al.length;
        wa.amp+=r.amp;wa.tte+=r.tte;wa.trav+=r.trav;
        const val=r.t==='T'||r.t==='NUIT'?F(r.tte):d0.t==='CP'?'CP':d0.t==='RC'?'RC':d0.t==='MAL'?'MAL':'—';
        const secondary=r.t==='T'||r.t==='NUIT'?F(r.amp):'';
        const icon=a?`<span class="day-alert-dot">${a}</span>`:(r.t==='NUIT'?'🌙':'');
        h+=`<button class="cel ${state} ${a?'has-alert':''} ${k===today()?'now':''}" onclick="mhOpenDay('${k}')"><span class="d">${n}</span><span class="v">${val}</span>${secondary?`<span class="day-secondary">${secondary}</span>`:''}<span class="ic">${icon}</span></button>`;
      });
      h+=`<div class="week-total"><span>S${wi+1}</span><b>${F(wa.tte)}</b><small>${wa.trav} j · ${F(wa.amp)} amp.</small></div>`;
    });
    $('mCal').innerHTML=h;
  }
  const sel=gd(curDate),sr=cd(curDate),selHost=$('mSelected');
  if(selHost){
    const title=sel&&sel.t==='T'?'Journée travaillée':sel&&sel.t==='NUIT'?'Nuit':sel&&sel.t==='CP'?'Congé payé':sel&&sel.t==='RC'?'Repos compensateur':sel&&sel.t==='MAL'?'Maladie':'Repos';
    const detail=sr.tte?`${F(sr.tte)} TTE · ${F(sr.amp)} amplitude`:title;
    selHost.innerHTML=`<div class="selected-day-head"><div><span>JOURNÉE SÉLECTIONNÉE</span><strong>${shortY(curDate)}</strong></div><button class="g" onclick="mhOpenDay('${curDate}')">Modifier ›</button></div><div class="selected-day-body"><div class="selected-icon ${monthDayState(sel,sr)}">${sel&&sel.t==='CP'?'CP':sel&&sel.t==='RC'?'RC':sel&&sel.t==='NUIT'?'🌙':sel&&sel.t==='T'?'✓':'—'}</div><div><b>${title}</b><small>${detail}</small></div>${sr.al.length?`<em>${sr.al.length} alerte${sr.al.length>1?'s':''}</em>`:'<em class="ok">✓ OK</em>'}</div>`;
  }
  $('mKpi').innerHTML=[['Amplitude',F(s.amp)],['TTE',F(s.tte)],['Jours',s.trav],['HS potentiel',F(Math.max(0,s.tte-N)),'warn'],['Paniers',s.ir+s.iru],['Nuit',C2(s.nuit)+' h'],['Alertes',s.alerts.length,s.hard?'bad':'']].map(x=>`<div class="kpi ${x[2]||''}"><b>${x[1]}</b><span>${x[0]}</span></div>`).join('');
  const max=480;let chart='';for(let n=1;n<=days;n++){const k=curMonth+'-'+pad(n),r=cd(k),hh=Math.min(100,r.tte/max*100),hs=Math.max(0,r.tte-N);chart+=`<div class="bar-w" title="${shortY(k)} · ${F(r.tte)}"><div class="bv ${hs>0?'hs':''}" style="height:${hh.toFixed(1)}%"></div><div class="bl">${n}</div></div>`}$('mChart').innerHTML=chart;
  const alerts=s.alerts.slice().sort((a,b)=>(a.lvl==='b'?0:1)-(b.lvl==='b'?0:1));
  $('mDim').innerHTML=(s.dim?`<div class="al w">🔵 ${s.dim} dimanche(s) travaillé(s)</div>`:'')+(s.fer?`<div class="al w">☀️ ${F(s.fer)} de TTE sur jours fériés</div>`:'')+(alerts.length?alerts.slice(0,12).map(a=>`<div class="al ${a.lvl}" onclick="mhOpenDay('${a.k}')" style="cursor:pointer"><b>${shortY(a.k)}</b> — ${esc(a.m)}</div>`).join(''):'<div class="al k">✅ Aucun point particulier ce mois-ci.</div>');
}

function renderPay(){
  renderPayBase();
  const st=DB.per.start,nb=DB.per.nb,{G}=calcPer(st,nb),br=brutOf(G),tot=br.tot;
  const host=$('pKpi'); if(!host)return;
  const anc=calcAnc(DB.s.emb||DEF.emb), ancPct=DB.s.anc||anc.pct;
  const netEst=br.netEst,netSal=br.netSal;
  const sim=$('pSim'); if(sim){sim.innerHTML=`<div class="pay-sim-total"><strong>${EUR(tot)}</strong><span>BRUT ESTIMÉ</span></div><div class="pay-sim-grid"><div><span>Heures normales</span><b>${F(G.nor)}</b></div><div><span>HS 25 %</span><b>${F(G.h25)}</b></div><div><span>HS 50 %</span><b>${F(G.h50)}</b></div><div><span>Heures de nuit</span><b>${C2(G.nuit)} h</b></div><div><span>Dimanches</span><b>${G.dim}</b></div><div><span>Ancienneté</span><b>${ancPct}%</b></div></div><div class="pay-sim-net"><span>Net estimé (salaire)</span><strong>${EUR(netSal)}</strong></div><div class="pay-sim-net"><span>Total versé estimé (+ repas non soumis)</span><strong>${EUR(netEst)}</strong></div>`;}
  const old=host.parentElement;
  if(old&&!document.getElementById('pProSummary')){
    const c=document.createElement('div');c.className='card pro-summary';c.id='pProSummary';c.innerHTML=`<h2>💼 Synthèse professionnelle</h2><div class="pro-grid"><div><span>Brut estimé</span><b id="proBrut">${EUR(tot)}</b></div><div><span>Net estimé</span><b id="proNet">${EUR(netSal)}</b></div><div><span>Heures sup.</span><b id="proHours">${F(G.h25+G.h50)}</b></div><div><span>Écart bulletin</span><b id="proGap">À renseigner</b></div></div>`;old.parentNode.insertBefore(c,old);}
  const proBrut=document.getElementById('proBrut'),proNet=document.getElementById('proNet'),proHours=document.getElementById('proHours'),gap=document.getElementById('proGap'),B=gb(st);
  if(proBrut)proBrut.textContent=EUR(tot);
  if(proNet)proNet.textContent=EUR(netSal);
  if(proHours)proHours.textContent=F(G.h25+G.h50);

  // V30 : le champ « Écart bulletin » ne doit plus confondre
  // l'absence de saisie RC de la quatorzaine avec l'absence de bulletin.
  // Les bulletins sont mensuels et une quatorzaine peut chevaucher deux mois.
  // On recherche donc les bulletins dont le mois intersecte réellement la période.
  if(gap){
    const periodEnd=addD(st,nb*14-1);
    const monthsInPeriod=new Set();
    let cursor=st;
    while(cursor<=periodEnd){
      monthsInPeriod.add(cursor.slice(0,7));
      cursor=addD(cursor,1);
    }
    const matches=(DB.bulletins||[]).filter(b=>b&&/^\d{4}-\d{2}$/.test(String(b.mois||''))&&monthsInPeriod.has(b.mois));
    if(matches.length){
      const labels=matches.map(b=>{
        const bits=[String(b.mois)];
        if(Number.isFinite(Number(b.brut)))bits.push('brut '+EUR(b.brut));
        if(Number.isFinite(Number(b.net)))bits.push('net '+EUR(b.net));
        return bits.join(' · ');
      });
      gap.textContent=labels.join(' | ');
      gap.title='Bulletin(s) mensuel(s) trouvé(s) pour le mois couvert par cette période. Le rapprochement exact se fait dans Bulletin / Rapprochement.';
      gap.style.fontSize=matches.length>1?'0.78em':'0.86em';
    }else{
      gap.textContent='Aucun bulletin pour cette période';
      gap.title='Aucun bulletin mensuel importé ne correspond aux mois couverts par cette quatorzaine.';
      gap.style.fontSize='0.86em';
    }
  }
}

function renderAudit(){
  renderAuditBase();
  const host=$('aKpi');if(!host)return;
  const periods=DB.periods||[], seen=new Set(), all=[];periods.forEach(p=>{const pk=p.start+'|'+p.nb;if(seen.has(pk))return;seen.add(pk);all.push(...calcPer(p.start,p.nb).AL)});
  const unique=[];const ua=new Set();all.forEach(a=>{const k=a.k+'|'+a.lvl+'|'+a.m;if(!ua.has(k)){ua.add(k);unique.push(a)}});
  const hard=unique.filter(a=>a.lvl==='b').length,warn=unique.filter(a=>a.lvl==='w').length;
  const total=hard*4+warn; const score=Math.max(0,Math.min(100,100-total*5)); host.innerHTML=`<div class="audit-health"><div><span>ÉTAT DU MOIS</span><b>${score}/100</b></div><strong>${score>=90?'🟢 Planning cohérent':score>=70?'🟠 Points à vérifier':'🔴 Contrôle nécessaire'}</strong><small>${unique.length?unique.length+' point(s) détecté(s)':'Aucune anomalie détectée'}</small></div><div class="audit-strip"><span>🔎 ${seen.size} période(s)</span><span class="${hard?'bad-text':'ok-text'}">🔴 ${hard} critique(s)</span><span class="${warn?'warn-text':'ok-text'}">🟠 ${warn} attention(s)</span><span>🟢 contrôle terminé</span></div>`+host.innerHTML;
}

/* Export V15 : enveloppe versionnée, import compatible avec les anciens JSON. */
function expo(){
  if(typeof mhV30Export==='function') return mhV30Export();
  const now=new Date().toISOString();
  DB.exp=new Date().toLocaleDateString('fr-FR');save();
  const payload={format:'MesHeures Backup',version:MH_V,exportedAt:now,data:DB};
  if(typeof mhDownloadFile==='function') mhDownloadFile('mesheures-v18-'+today()+'.json',JSON.stringify(payload,null,2),'application/json');
  else { const b=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'}); const a=document.createElement('a');a.href=URL.createObjectURL(b);a.download='mesheures-v18-'+today()+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000); }
  renderReg();
}
function impo(i){
  if(typeof mhV30Import==='function') return mhV30Import(i);
  const f=i.files[0];if(!f)return;
  const r=new FileReader();r.onload=e=>{try{
    const raw=JSON.parse(e.target.result),j=raw.data&&raw.format==='MesHeures Backup'?raw.data:raw;
    if(!j.days)throw new Error('Pas de données journalières');
    if(!confirm('Importer cette sauvegarde et remplacer les données actuelles ?'))return;
    DB={...DB,...j};DB.s={...DEF,...(j.s||{})};DB.periods=j.periods||[];DB.bul=j.bul||{};DB.bulletins=j.bulletins||[];DB.romi=j.romi||{};if(typeof mhNormalizeMealSettings==='function')mhNormalizeMealSettings();if(typeof mhMigrateLegacyMealChoices==='function')mhMigrateLegacyMealChoices();
    save();mhRefresh();alert('✅ Import réussi.');
  }catch(x){alert('Fichier illisible : '+x.message)}finally{i.value=''}};r.readAsText(f);
}
function mhRestorePreImport(){
  if(typeof mhV30ListBackups!=='function') return alert('Module de sauvegarde indisponible.');
  const list=mhV30ListBackups();
  if(!list.length)return alert('Aucune sauvegarde locale disponible.');
  mhV30Restore(list[0].key);
}
function mhBackupLocal(){
  if(typeof mhV30Backup==='function') { mhV30Backup('manual'); mhRefresh('manual-backup'); alert('✅ Point de restauration créé.'); return; }
  localStorage.setItem(LS+'_manual',JSON.stringify(DB));localStorage.setItem(LS+'_manualAt',new Date().toISOString());save();mhRefresh('manual-backup');alert('✅ Point de restauration local créé.');
}
function mhRestoreLocal(){
  if(typeof mhV30BackupPanel==='function') return mhV30BackupPanel();
  alert('Centre de sauvegarde indisponible.');
}
function mhTogglePro(){DB.s.proMode=!DB.s.proMode;save();document.body.classList.toggle('pro-mode',!!DB.s.proMode);mhRefresh('settings');}

function mhAutoBackup(){
  /* V30: normal save() is the persistence layer; snapshot backups are explicit from Outils > Données. */
}
function mhRestoreAuto(){
  if(typeof mhV30BackupPanel==='function') return mhV30BackupPanel();
  alert('Centre de sauvegarde indisponible.');
}

/* Compléments de réglages sans modifier le HTML historique. */
function renderReg(){
  renderRegBase();
  const bk=$('rBk');if(!bk)return;
  if(!document.getElementById('mhSecurity')){
    const c=document.createElement('div');c.id='mhSecurity';c.className='security-box';c.innerHTML=`<div class="security-title">🛡️ Mode professionnel</div><label class="pro-switch"><input type="checkbox" id="mhProMode" onchange="mhTogglePro()"> Afficher les contrôles professionnels</label>`;bk.parentNode.insertBefore(c,bk.nextSibling);
  }
  $('mhProMode').checked=!!DB.s.proMode;
  document.body.classList.toggle('pro-mode',!!DB.s.proMode);
  if(typeof mhRenderPlugins==='function')mhRenderPlugins();
}

/* Version et cache */
function mhDecoratePages(){
  const pages={
    jour:['🕐','Saisie du jour','Horaires, pauses et primes de la journée'],
    mois:['📅','Vue mensuelle','Calendrier, cumul des heures et alertes'],
    paie:['💶','Paie & rémunération','Calcul du brut, heures supplémentaires et RC'],
    audit:['🛡️','Audit réglementaire','Contrôles, écarts et anomalies à vérifier'],
    bul:['📄','Bulletins de salaire','Import, lecture et contrôle des bulletins'],
    romi:['📋','ROMI1','Relevés, OCR et rapprochement avec MesHeures'],
    reg:['⚙️','Réglages','Contrat, tarifs, ancienneté et sauvegardes']
  };
  Object.entries(pages).forEach(([key,v])=>{
    const sec=$('s-'+key);
    if(!sec||sec.querySelector('.mh-page-hero'))return;
    const el=document.createElement('div');
    el.className='mh-page-hero';
    el.innerHTML=`<div class="mh-page-icon">${v[0]}</div><div><div class="mh-page-kicker">MESHEURES · ${key.toUpperCase()}</div><div class="mh-page-title">${v[1]}</div><div class="mh-page-sub">${v[2]}</div></div>`;
    sec.insertBefore(el,sec.firstChild);
  });
}

if($('mhVersion'))$('mhVersion').textContent='V36.2.0';
mhDecoratePages();
mhAutoBackup();
setTimeout(()=>{try{if(typeof mhRefresh==='function')mhRefresh('boot-legacy');else window.__mh30PendingRefresh='boot-legacy'}catch(e){console.error('V15 render',e)}},0);
