import {pathToFileURL} from 'node:url';
const base='https://maranpms.com.ar';
export async function verifyHospitality({password,expectedRevision,fetchImpl=globalThis.fetch}) {
 if(!password||!/^[a-f0-9]{40}$/.test(expectedRevision||''))throw Error('Falta acceso o revisión de comprobación');
 let cookie='';
 async function get(path){const response=await fetchImpl(base+path,{method:'GET',redirect:'manual',headers:cookie?{Cookie:cookie}:{},signal:AbortSignal.timeout(30000)});if(response.status!==200)throw Error('Consulta no disponible');return response.json();}
 const health=await get('/api/health');if(health.revision!==expectedRevision||health.status!=='ok'||health.database!=='ok'||health.financialReady!==true)throw Error('La revisión esperada no está lista');
 try {
  const auth=await fetchImpl(base+'/api/auth/login',{method:'POST',redirect:'manual',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:'admin',password}),signal:AbortSignal.timeout(20000)});
  if(auth.status!==200)throw Error('Acceso no disponible');cookie=auth.headers.getSetCookie().map(value=>value.split(';')[0]).join('; ');if(!cookie||(await auth.json()).role!=='admin')throw Error('Sesión no válida');
  const checks=[];
  for(const area of ['restaurant','spa','reception'])for(const view of ['today','pending']) {
   const data=await get(`/api/hospitality/included-services?area=${area}&view=${view}&page=1`);
   if(!Array.isArray(data.items)||!Array.isArray(data.areas)||!data.areas.includes(area)||typeof data.pendingToday!=='number'||typeof data.canCoordinate!=='boolean'||data.page!==1)throw Error('Formato no válido');
   checks.push({area,view,available:true,recordsOnPage:data.items.length,pendingToday:data.pendingToday,canCoordinate:data.canCoordinate});
  }
  return {site:base,revision:expectedRevision,authenticatedInboxChecks:checks,operationalWrites:0};
 } finally {if(cookie)await fetchImpl(base+'/api/auth/logout',{method:'POST',redirect:'manual',headers:{Cookie:cookie},signal:AbortSignal.timeout(10000)}).catch(()=>undefined);}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href) {
 try {console.log(JSON.stringify(await verifyHospitality({password:process.env.SMOKE_TEST_PASSWORD,expectedRevision:process.env.EXPECTED_REVISION})));}
 catch {console.error('Falló la comprobación de Hospitalidad. No se modificaron registros operativos.');process.exitCode=1;}
}
