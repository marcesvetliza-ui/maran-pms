import type {Express} from 'express';
import {and,eq,inArray,or,sql} from 'drizzle-orm';
import {db} from './db';
import {getArgentinaToday} from './db-storage';
import {requireAuth,requirePermission} from './auth';
import {validCalendarDate} from './stayEligibility';
import {reservations,rooms,guests,bedTypes,guestPreferences,stayNotes,reservationCompanions,type PreferenceCategory} from '@shared/schema';

const operationalCategories:PreferenceCategory[]=['habitacion','amenities','servicio'];
function visibleForHousekeeping(note:{category:PreferenceCategory;visibleTo:string[]}){
  return operationalCategories.includes(note.category) && note.visibleTo.some(area=>area==='all'||area==='housekeeping');
}
export async function loadHousekeepingDailyReport(date:string){
  if(!validCalendarDate(date))throw Object.assign(new Error('Fecha inválida'),{statusCode:400});
  // Explicit projection: money, phone, documents and generic reservation notes never leave this query.
  const rows=await db.select({reservationId:reservations.id,guestId:reservations.guestId,roomId:rooms.id,
    roomNumber:rooms.roomNumber,roomStatus:rooms.status,guestFirstName:guests.firstName,guestLastName:guests.lastName,
    checkInDate:reservations.checkInDate,checkOutDate:reservations.checkOutDate,status:reservations.status,
    bedTypeNotes:reservations.bedTypeNotes,bedTypeName:bedTypes.name,numberOfGuests:reservations.numberOfGuests,
    earlyCheckIn:reservations.earlyCheckIn,earlyCheckInTime:reservations.earlyCheckInTime,
    lateCheckOut:reservations.lateCheckOut,lateCheckOutTime:reservations.lateCheckOutTime,
    preparation:reservations.housekeepingPreparation})
    .from(reservations).innerJoin(rooms,eq(rooms.id,reservations.roomId))
    .leftJoin(guests,eq(guests.id,reservations.guestId)).leftJoin(bedTypes,eq(bedTypes.id,reservations.bedTypeId))
    .where(and(sql`COALESCE(${rooms.isVirtual},false)=false`,or(
      and(eq(reservations.checkOutDate,date),inArray(reservations.status,['checked_in','checked_out'])),
      and(eq(reservations.checkInDate,date),inArray(reservations.status,['confirmed','web_checkin','checked_in'])))));
  rows.sort((a,b)=>a.roomNumber.localeCompare(b.roomNumber,'es',{numeric:true})||a.reservationId.localeCompare(b.reservationId));
  const reservationIds=rows.map(r=>r.reservationId);
  const companions=reservationIds.length?await db.select({reservationId:reservationCompanions.reservationId,guestId:reservationCompanions.guestId}).from(reservationCompanions).where(inArray(reservationCompanions.reservationId,reservationIds)):[];
  const guestIds=[...new Set([...rows.map(r=>r.guestId),...companions.map(c=>c.guestId)].filter((id):id is string=>!!id))];
  const [preferences,notes]=await Promise.all([
    guestIds.length?db.select({guestId:guestPreferences.guestId,category:guestPreferences.category,title:guestPreferences.title,description:guestPreferences.description,visibleTo:guestPreferences.visibleTo,priority:guestPreferences.priority}).from(guestPreferences).where(and(inArray(guestPreferences.guestId,guestIds),eq(guestPreferences.isActive,true),inArray(guestPreferences.category,operationalCategories))):[],
    reservationIds.length?db.select({reservationId:stayNotes.reservationId,category:stayNotes.category,title:stayNotes.title,description:stayNotes.description,visibleTo:stayNotes.visibleTo,priority:stayNotes.priority}).from(stayNotes).where(and(inArray(stayNotes.reservationId,reservationIds),sql`COALESCE(${stayNotes.isResolved},false)=false`,inArray(stayNotes.category,operationalCategories))):[],
  ]);
  const departures=rows.filter(r=>r.checkOutDate===date&&['checked_in','checked_out'].includes(r.status));
  const arrivals=rows.filter(r=>r.checkInDate===date&&['confirmed','web_checkin','checked_in'].includes(r.status));
  const turnoverRooms=new Set(departures.filter(d=>arrivals.some(a=>a.roomId===d.roomId&&a.reservationId!==d.reservationId)).map(r=>r.roomId));
  const project=(row:typeof rows[number])=>{
    const relevantGuests=new Set([row.guestId,...companions.filter(c=>c.reservationId===row.reservationId).map(c=>c.guestId)]);
    const observations=[...preferences.filter(p=>relevantGuests.has(p.guestId)&&visibleForHousekeeping(p)),...notes.filter(n=>n.reservationId===row.reservationId&&visibleForHousekeeping(n))]
      .map(n=>({text:[n.title,n.description].filter(Boolean).join(' — '),priority:n.priority}));
    if(row.preparation?.roomId===row.roomId)observations.push({text:`${row.preparation.state==='prepared'?'Preparada — No mover':'Revisar preparación'}${row.preparation.note?' — '+row.preparation.note:''}`,priority:'high'});
    return {reservationId:row.reservationId,roomNumber:row.roomNumber,roomStatus:row.roomStatus,
      guestName:[row.guestLastName,row.guestFirstName].filter(Boolean).join(' ')||'Sin asignar',
      bedTypeNotes:row.bedTypeNotes||row.bedTypeName||null,numberOfGuests:row.numberOfGuests??1,
      checkInDate:row.checkInDate,checkOutDate:row.checkOutDate,status:row.status,
      earlyCheckIn:row.earlyCheckIn??false,earlyCheckInTime:row.earlyCheckInTime,
      lateCheckOut:row.lateCheckOut??false,lateCheckOutTime:row.lateCheckOutTime,
      turnover:turnoverRooms.has(row.roomId),observations:observations.filter((n,i,all)=>all.findIndex(other=>other.text===n.text)===i)};
  };
  return {date,checkOuts:departures.map(project),checkIns:arrivals.map(project)};
}
export function registerHousekeepingDailyReport(app:Express){
  app.get('/api/housekeeping/daily-report',requireAuth,requirePermission('sidebar:/housekeeping-daily-report'),async(req,res)=>{
    if(req.query.date!==undefined && typeof req.query.date!=='string')return res.status(400).json({error:'Fecha inválida'});
    try{res.json(await loadHousekeepingDailyReport((req.query.date as string)||getArgentinaToday()));}
    catch(error:any){res.status(error.statusCode||500).json({error:error.statusCode===400?error.message:'No se pudo generar la planilla de Housekeeping'});}
  });
}
