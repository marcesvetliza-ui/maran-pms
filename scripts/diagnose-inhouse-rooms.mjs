import {pathToFileURL} from 'node:url';
const base='https://maranpms.com.ar';
const rooms=['901','1001','1006'];
class DiagnosticError extends Error {}
export async function diagnoseInHouse({password,fetchImpl=globalThis.fetch,now=new Date()}){
 if(!password)throw new DiagnosticError('Falta el acceso de comprobación.');
 let cookie='';
 try{
  const login=await fetchImpl(base+'/api/auth/login',{method:'POST',redirect:'manual',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:'admin',password}),signal:AbortSignal.timeout(20000)});
  if(login.status!==200)throw new DiagnosticError(`No se pudo autenticar (HTTP ${login.status}).`);
  cookie=login.headers.getSetCookie().map(v=>v.split(';')[0]).join('; ');
  if(!cookie||(await login.json()).role!=='admin')throw new DiagnosticError('La comprobación necesita una sesión administrativa.');
  const get=async path=>{
   const response=await fetchImpl(base+path,{method:'GET',redirect:'manual',headers:{Cookie:cookie},signal:AbortSignal.timeout(30000)});
   if(response.status!==200)throw new DiagnosticError(`No se pudo consultar el estado (HTTP ${response.status}).`);
   return response.json();
  };
  const date=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Argentina/Buenos_Aires',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
  const [stats,listed,current]=await Promise.all([get('/api/dashboard/stats'),get('/api/dashboard/inhouse?date='+date),get('/api/rooms/in-house')]);
  if(!Array.isArray(listed)||!Array.isArray(current))throw new DiagnosticError('Formato de listado inesperado.');
  const listedIds=new Set(listed.map(r=>r.reservationId));
  const checkedIn=current.filter(r=>r.reservationStatus==='checked_in');
  const report={date,dashboardPax:stats.inHouseGuests,listedRooms:listed.length,
   listedDeclaredPax:listed.reduce((s,r)=>s+(Number(r.numberOfGuests)||0),0),
   listedPeopleRows:listed.reduce((s,r)=>s+1+(r.companions?.length||0),0),
   checkedInRooms:checkedIn.length,checkedInDeclaredPax:checkedIn.reduce((s,r)=>s+(Number(r.numberOfGuests)||0),0),
   checkedInPeopleRows:checkedIn.reduce((s,r)=>s+1+(Number(r.companionsCount)||0),0),
   checkedInKnownPax:checkedIn.reduce((s,r)=>s+Math.max(Number(r.numberOfGuests)||1,1+(Number(r.companionsCount)||0)),0),
   checkedInUniqueRooms:new Set(checkedIn.map(r=>r.roomNumber)).size,
   omitted:checkedIn.filter(r=>!listedIds.has(r.reservationId)).map(r=>({roomNumber:r.roomNumber,status:r.reservationStatus,checkIn:r.checkIn,checkOut:r.checkOut,declaredPax:r.numberOfGuests,registeredCompanions:r.companionsCount})),rooms:[]};
  for(const number of rooms){
   const matches=await get('/api/reservations?dateMode=all&statuses=checked_in,web_checkin&search='+number+'&limit=50');
   if(!Array.isArray(matches))throw new DiagnosticError('Formato de reserva inesperado.');
   report.rooms.push({roomNumber:number,reservations:matches.filter(r=>String(r.room?.roomNumber)===number).map(r=>{
    const inHouse=current.find(x=>x.reservationId===r.id);
    return {status:r.status,checkIn:r.checkInDate,checkOut:r.checkOutDate,declaredPax:r.numberOfGuests,
     virtual:r.room?.isVirtual??false,roomStatus:r.room?.status,listed:listedIds.has(r.id),
     inHouseEndpoint:!!inHouse,registeredCompanions:inHouse?.companionsCount??null};
   })});
  }
  return report;
 }finally{
  if(cookie)await fetchImpl(base+'/api/auth/logout',{method:'POST',redirect:'manual',headers:{Cookie:cookie},signal:AbortSignal.timeout(10000)}).catch(()=>undefined);
 }
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 try{console.log(JSON.stringify(await diagnoseInHouse({password:process.env.SMOKE_TEST_PASSWORD})));}
 catch(error){console.error(error instanceof DiagnosticError?error.message:'No se pudo completar la consulta; no se imprimieron respuestas privadas.');process.exitCode=1;}
}
