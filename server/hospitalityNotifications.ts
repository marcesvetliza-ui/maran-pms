import {createHash,randomUUID} from 'node:crypto';
import {sql} from 'drizzle-orm';
import {db,withDatabaseTransaction} from './db';
import {hospitalityRequestAreas} from '@shared/hospitalityNotifications';
import type {SystemNotification} from '@shared/schema';
const managed=sql`type='hospitality_alert' AND related_entity_type IN ('hospitality_alert','hospitality_stay_note')`;
/** Applied before LIMIT and to the badge/read actions, so audiences stay consistent. */
export function hospitalityNotificationVisibility(areas:string[]|null=null) {
 const audience=areas===null?sql`true`:areas.length?sql`target_area IN (${sql.join(areas.map(a=>sql`${a}`),sql`,`)})`:sql`false`;
 return sql`NOT (type='hospitality_alert' AND title LIKE '⚠️ Alerta de hospitalidad - Hab.%')
 AND (NOT (${managed}) OR (status NOT IN ('completado','rechazado') AND ${audience}))`;
}
export async function lockHospitalityNotifications(){await db.execute(sql`SELECT pg_advisory_xact_lock(hashtext('hospitality-bell-notifications'))`);}
export async function closeHospitalityBellItem(kind:string,id:string,actor:string){await db.execute(sql`UPDATE system_notifications SET status='completado',is_read=true,read_at=COALESCE(read_at,now()),resolved_at=now(),resolved_by=${actor} WHERE type='hospitality_alert' AND related_entity_type=${kind} AND related_entity_id=${id}`);}
export async function applyHospitalityNotificationStatus(n:SystemNotification,status:string,actor:string) {
 if(n.type!=='hospitality_alert')return;
 if(n.relatedEntityType==='hospitality_alert')await db.execute(sql`UPDATE hospitality_alerts SET status=${status==='en_proceso'?'in_progress':status==='pendiente'?'pending':'completed'},is_acknowledged=${status!=='pendiente'},acknowledged_at=CASE WHEN ${status}='pendiente' THEN NULL ELSE now() END,acknowledged_by=${actor} WHERE id=${n.relatedEntityId}`);
 if(n.relatedEntityType==='hospitality_stay_note')await db.execute(sql`UPDATE stay_notes SET is_resolved=${['completado','rechazado'].includes(status)},resolved_at=CASE WHEN ${status} IN ('completado','rechazado') THEN now() ELSE NULL END,resolved_by=CASE WHEN ${status} IN ('completado','rechazado') THEN ${actor} ELSE NULL END WHERE id=${n.relatedEntityId}`);
}
const idFor=(kind:string,id:string,area:string)=>'hosp-'+createHash('sha256').update(JSON.stringify([kind,id,area])).digest('hex');
/** One durable bell item per source and area. Read state changes only for a real
 * content/arrival-stage change; completing a source never recreates its alert. */
export async function syncHospitalityNotifications(now=new Date()) {
 const today=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Argentina/Buenos_Aires',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
 return withDatabaseTransaction(async()=>{
  await lockHospitalityNotifications();
  const stays=(await db.execute(sql`SELECT r.id,r.guest_id,r.check_in_date::text AS arrival,r.status,rm.room_number,
   g.first_name,g.last_name,g.tipo_persona FROM reservations r LEFT JOIN rooms rm ON rm.id=r.room_id LEFT JOIN guests g ON g.id=r.guest_id
   WHERE r.status='checked_in' OR (r.status IN ('confirmed','reserved','web_checkin') AND r.check_in_date BETWEEN ${today}::date AND ${today}::date+1)`)).rows as any[];
  const stayIds=JSON.stringify(stays.map(r=>r.id));
  const prefs=(await db.execute(sql`SELECT p.* FROM guest_preferences p WHERE p.is_active=true AND p.guest_id IN(SELECT guest_id FROM reservations WHERE id IN(SELECT jsonb_array_elements_text(${stayIds}::jsonb)))`)).rows as any[];
  const alerts=(await db.execute(sql`SELECT * FROM hospitality_alerts WHERE reservation_id IN(SELECT jsonb_array_elements_text(${stayIds}::jsonb)) ORDER BY created_at DESC,id DESC`)).rows as any[];
  let createdAlerts=0;
  const canonical=new Map<string,any>();
  for(const a of alerts){const key=JSON.stringify([a.reservation_id,a.preference_id||a.id,a.target_area]);if(!canonical.has(key))canonical.set(key,a);}
  for(const r of stays)for(const p of prefs.filter(p=>p.guest_id===r.guest_id))for(const area of hospitalityRequestAreas(p.category,p.visible_to||[])){
   const key=JSON.stringify([r.id,p.id,area]),message=`${p.title}: ${p.description||p.title}`;let a=canonical.get(key);
   if(!a){a={id:randomUUID(),reservation_id:r.id,guest_id:r.guest_id,preference_id:p.id,alert_message:message,target_area:area,priority:p.priority,status:'pending'};
    await db.execute(sql`INSERT INTO hospitality_alerts(id,reservation_id,guest_id,preference_id,alert_message,target_area,priority)VALUES(${a.id},${r.id},${r.guest_id},${p.id},${message},${area},${p.priority})`);canonical.set(key,a);createdAlerts++;
   }else if(a.alert_message.replace(/^\[Llegada (?:hoy|mañana)[^\]]*\]\s*/, '')!==message||a.priority!==p.priority){
    await db.execute(sql`UPDATE hospitality_alerts SET alert_message=${message},priority=${p.priority},status='pending',is_acknowledged=false,acknowledged_at=NULL,acknowledged_by=NULL WHERE id=${a.id}`);
    Object.assign(a,{alert_message:message,priority:p.priority,status:'pending'});
   }
  }
  const notes=(await db.execute(sql`SELECT * FROM stay_notes WHERE reservation_id IN(SELECT jsonb_array_elements_text(${stayIds}::jsonb)) AND COALESCE(recorded_by,'')<>'sistema (check-in automático)'`)).rows as any[];
  const activeIds:string[]=[];
  async function put(r:any,kind:string,source:any,area:string,body:string,sourceStatus:string){
   const id=idFor(kind,source.id,area);activeIds.push(id);
   const guest=r.tipo_persona==='juridica'?r.first_name:[r.last_name,r.first_name].filter(Boolean).join(' ');
   const stage=r.status==='checked_in'?'En estadía':r.arrival===today?'Ingresa hoy':'Ingresa mañana';
   const date=r.arrival.split('-').reverse().join('/');
   const title=`Hospitalidad · ${guest||'Huésped'} · ${r.room_number?'Hab. '+r.room_number:'Sin habitación asignada'}`;
   const message=`${stage} · Ingreso ${date} · ${body}`;
   const priority=source.priority==='critical'?'urgent':source.priority==='high'?'high':source.priority==='low'?'low':'normal';
   await db.execute(sql`INSERT INTO system_notifications(id,type,title,message,target_area,related_entity_type,related_entity_id,priority,status,guest_name)
    VALUES(${id},'hospitality_alert',${title},${message},${area},${kind},${source.id},${priority},${sourceStatus},${guest||'Huésped'})
    ON CONFLICT(id) DO UPDATE SET title=EXCLUDED.title,message=EXCLUDED.message,priority=EXCLUDED.priority,guest_name=EXCLUDED.guest_name,
     status=CASE WHEN EXCLUDED.related_entity_type='hospitality_stay_note' AND system_notifications.status='en_proceso' AND system_notifications.message=EXCLUDED.message THEN 'en_proceso' ELSE EXCLUDED.status END,
     is_read=CASE WHEN system_notifications.title IS DISTINCT FROM EXCLUDED.title OR system_notifications.message IS DISTINCT FROM EXCLUDED.message OR system_notifications.priority IS DISTINCT FROM EXCLUDED.priority OR system_notifications.status IN ('completado','rechazado') THEN false ELSE system_notifications.is_read END,
     resolved_at=NULL,resolved_by=NULL,
     read_by=CASE WHEN system_notifications.title IS DISTINCT FROM EXCLUDED.title OR system_notifications.message IS DISTINCT FROM EXCLUDED.message OR system_notifications.priority IS DISTINCT FROM EXCLUDED.priority OR system_notifications.status IN ('completado','rechazado') THEN NULL ELSE system_notifications.read_by END,
     read_at=CASE WHEN system_notifications.title IS DISTINCT FROM EXCLUDED.title OR system_notifications.message IS DISTINCT FROM EXCLUDED.message OR system_notifications.priority IS DISTINCT FROM EXCLUDED.priority OR system_notifications.status IN ('completado','rechazado') THEN NULL ELSE system_notifications.read_at END,
     created_at=CASE WHEN system_notifications.title IS DISTINCT FROM EXCLUDED.title OR system_notifications.message IS DISTINCT FROM EXCLUDED.message OR system_notifications.priority IS DISTINCT FROM EXCLUDED.priority OR system_notifications.status IN ('completado','rechazado') THEN now() ELSE system_notifications.created_at END
     WHERE (system_notifications.title,system_notifications.message,system_notifications.priority) IS DISTINCT FROM (EXCLUDED.title,EXCLUDED.message,EXCLUDED.priority) OR (system_notifications.status IS DISTINCT FROM EXCLUDED.status AND NOT (EXCLUDED.related_entity_type='hospitality_stay_note' AND system_notifications.status='en_proceso'))`);
  }
  for(const a of canonical.values()){
   const r=stays.find(r=>r.id===a.reservation_id),p=prefs.find(p=>p.id===a.preference_id);
   if(!r||a.status==='completed'||a.preference_id&&(!p||!hospitalityRequestAreas(p.category,p.visible_to||[]).includes(a.target_area)))continue;
   // Legacy check-in created an additional reception copy for some categories.
   if(p&&a.target_area==='reception'&&!hospitalityRequestAreas(p.category,p.visible_to||[]).includes('reception'))continue;
   await put(r,'hospitality_alert',a,a.target_area,p?`${p.title}${p.description?': '+p.description:''}`:a.alert_message,a.status==='in_progress'?'en_proceso':'pendiente');
  }
  for(const n of notes){const r=stays.find(r=>r.id===n.reservation_id);if(!r||n.is_resolved)continue;
   for(const area of hospitalityRequestAreas(n.category,n.visible_to||[]))await put(r,'hospitality_stay_note',n,area,`${n.title}${n.description?': '+n.description:''}`,'pendiente');
  }
  await db.execute(sql`UPDATE system_notifications SET status='completado',is_read=true,read_at=COALESCE(read_at,now()),resolved_at=COALESCE(resolved_at,now()),resolved_by=COALESCE(resolved_by,'Sistema · Pedido resuelto o fuera del alcance activo')
   WHERE ${managed} AND status NOT IN ('completado','rechazado') AND id NOT IN(SELECT jsonb_array_elements_text(${JSON.stringify(activeIds)}::jsonb))`);
  return {activeNotifications:activeIds.length,createdAlerts};
 });
}
let schedulerActive=false,deliveryRunning=false,deliveryRequested=false;
let refreshTimer:ReturnType<typeof setTimeout>|undefined;
async function deliverHospitalityNotifications(){
 if(!schedulerActive)return;
 if(deliveryRunning){deliveryRequested=true;return;}
 deliveryRunning=true;
 try{do{deliveryRequested=false;await syncHospitalityNotifications();}while(schedulerActive&&deliveryRequested);}
 catch{console.error('[hospitality] No se pudieron actualizar los avisos; se reintentará.');}
 finally{deliveryRunning=false;}
}
export function requestHospitalityNotificationRefresh(){
 if(!schedulerActive)return;
 if(deliveryRunning){deliveryRequested=true;return;}
 if(refreshTimer)return;
 refreshTimer=setTimeout(()=>{refreshTimer=undefined;void deliverHospitalityNotifications();},250);refreshTimer.unref();
}
export function setupHospitalityNotificationScheduler(){
 schedulerActive=true;void deliverHospitalityNotifications();
 const timer=setInterval(()=>void deliverHospitalityNotifications(),60_000);timer.unref();
 return()=>{schedulerActive=false;deliveryRequested=false;clearInterval(timer);if(refreshTimer)clearTimeout(refreshTimer);refreshTimer=undefined;};
}
