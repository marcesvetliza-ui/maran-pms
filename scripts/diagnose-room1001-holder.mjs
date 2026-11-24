import {pathToFileURL} from 'node:url';
const base='https://maranpms.com.ar';
const classify=message=>{
 if(message.includes('antes del check-in'))return 'STAY_ALREADY_STARTED_OR_CLOSED';
 if(message.includes('consumos o cargos'))return 'ROOM_EXTRAS';
 if(message.includes('voucher'))return 'VOUCHER';
 if(message.includes('Cuenta Corriente'))return 'CURRENT_ACCOUNT';
 if(message.includes('canal externo'))return 'EXTERNAL_CHANNEL';
 if(/fiscal|comprobante|factura/i.test(message))return 'FISCAL_REVIEW';
 if(/anticipo|recibo|conciliaci/i.test(message))return 'ADVANCE_REVIEW';
 return 'OTHER_REVIEW';
};
export async function diagnoseHolder({password,fetchImpl=globalThis.fetch,now=new Date(),verifyCorrection=false}){
 if(!password)throw Error('Falta acceso de comprobacion');let cookie='';
 try{
  const auth=await fetchImpl(base+'/api/auth/login',{method:'POST',redirect:'manual',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:'admin',password}),signal:AbortSignal.timeout(20000)});
  if(auth.status!==200)throw Error('No se pudo autenticar');
  cookie=auth.headers.getSetCookie().map(v=>v.split(';')[0]).join('; ');
  if(!cookie||(await auth.json()).role!=='admin')throw Error('Sesion no valida');
  const get=async path=>{const response=await fetchImpl(base+path,{method:'GET',redirect:'manual',headers:{Cookie:cookie},signal:AbortSignal.timeout(30000)});if(response.status!==200)throw Error('No se pudo consultar el estado');return response.json();};
  const date=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Argentina/Buenos_Aires',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
  const rows=await get('/api/reservations?dateMode=all&statuses=checked_in,web_checkin,confirmed&search=1001&limit=50');
  if(!Array.isArray(rows))throw Error('Formato no valido');
  const relevant=rows.filter(r=>String(r.room?.roomNumber)==='1001'&&(r.status==='checked_in'||r.checkInDate<=date&&r.checkOutDate>=date));
  const report={date,room:'1001',reservations:[]};
  for(const r of relevant){
   let groupPreview=null;
   if(r.groupId){const p=await get(`/api/groups/${encodeURIComponent(r.groupId)}/reservations/${encodeURIComponent(r.id)}/assignment-preview`);groupPreview={canReplace:p.canReplace,blockers:[...new Set((p.replacementBlockers||[]).map(classify))],hasPersonalAdvances:Number(p.personalAdvance)>0,hasGroupAdvances:Number(p.groupAdvance)>0};}
   report.reservations.push({status:r.status,checkIn:r.checkInDate,checkOut:r.checkOutDate,groupLinked:!!r.groupId,guestProfilePresent:!!r.guest?.id,groupPlaceholder:!!r.guest?.codigo?.startsWith('GROUP-'),profileActive:r.guest?.active??null,nameComplete:!!r.guest?.firstName?.trim()&&!!r.guest?.lastName?.trim(),hasDocument:!!r.guest?.documentNumber?.trim(),hasEmail:!!r.guest?.email?.trim(),currentEmailFormatValid:!r.guest?.email||/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(r.guest.email),closedInUi:['checked_out','cancelled'].includes(r.status),channelLinked:!!(r.externalReservationId||r.otaChannelId),groupPreview});
  }
  if(verifyCorrection){
   for(let index=0;index<relevant.length;index++){
    const r=relevant[index];
    const p=await get(`/api/reservations/${encodeURIComponent(r.id)}/holder-correction`);
    const guestMatches=!!p.guest?.id&&p.guest.id===(r.guestId||r.guest?.id);
    const reservationMatches=p.reservationId===r.id;
    if(!guestMatches||!reservationMatches||!Array.isArray(p.blockers)||typeof p.canCorrect!=='boolean')throw Error('Vista previa no verificable');
    report.reservations[index].holderCorrection={routeAvailable:true,guestMatches,reservationMatches,canCorrect:p.canCorrect,blockerCount:p.blockers.length,companionCount:p.companionCount,groupLinked:p.groupLinked};
   }
  }
  return report;
 }finally{if(cookie)await fetchImpl(base+'/api/auth/logout',{method:'POST',redirect:'manual',headers:{Cookie:cookie},signal:AbortSignal.timeout(10000)}).catch(()=>undefined);}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 try{console.log(JSON.stringify(await diagnoseHolder({password:process.env.SMOKE_TEST_PASSWORD,verifyCorrection:process.env.VERIFY_HOLDER_CORRECTION==='true'})));}
 catch{console.error('No se pudo completar la consulta; no se imprimieron respuestas privadas.');process.exitCode=1;}
}
