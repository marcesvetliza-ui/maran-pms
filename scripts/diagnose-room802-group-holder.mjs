import {pathToFileURL} from 'node:url';
const base='https://maranpms.com.ar';
const parse=value=>typeof value==='string'?JSON.parse(value):value;
const cents=value=>{const text=String(value??'');if(!/^\d{1,8}(?:\.\d{1,2})?$/.test(text))throw Error('AMOUNT_FORMAT');const [whole,fraction='']=text.split('.');return Number(whole)*100+Number(fraction.padEnd(2,'0'));};
const method=value=>{const key=String(value??'').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[\s-]+/g,'_');return ({cash:'efectivo',debit_card:'tarjeta_debito',credit_card:'tarjeta_credito',transfer:'transferencia',current_account:'cuenta_corriente',check:'cheque'})[key]||key;};
const direct=new Set(['efectivo','transferencia','tarjeta_debito','tarjeta_credito','mercadopago']);
export function receiptFacts(receipt,children){
 try{
  const detail=parse(receipt.distributionDetail);if(!detail||typeof detail!=='object'||Array.isArray(detail))throw Error('DISTRIBUTION_MISSING');
  const total=cents(receipt.amount),parts=Object.entries(detail).map(([id,value])=>({id,value:cents(value)}));
  const assigned=parts.filter(p=>!p.id.startsWith('__')).reduce((n,p)=>n+p.value,0),allocated=children.reduce((n,p)=>n+cents(p.amount),0);
  const expected=new Map(parts.filter(p=>!p.id.startsWith('__')).map(p=>[p.id,p.value]));for(const p of children)expected.set(p.reservationId,(expected.get(p.reservationId)||0)-cents(p.amount));
  if(parts.reduce((n,p)=>n+p.value,0)!==total||assigned!==allocated||[...expected.values()].some(n=>n!==0))throw Error('DISTRIBUTION_APPLICATION_MISMATCH');
  if(parts.some(p=>p.id.startsWith('__')&&!['__unassigned__','__group_charges__'].includes(p.id)&&p.value))throw Error('HISTORICAL_BALANCE');
  const unassigned=parts.find(p=>p.id==='__unassigned__')?.value||0;
  if(!unassigned)return {requiresReview:false,available:0,detail};
  const raw=parse(receipt.paymentMethodDetail),instruments=Array.isArray(raw)&&raw.length?raw:[{method:receipt.method,amount:receipt.amount}];
  if(instruments.some(p=>!direct.has(method(p.method))||Number(p.retention?.monto||0)!==0)||instruments.reduce((n,p)=>n+cents(p.amount),0)!==total)throw Error('NON_CASH_RETENTION_OR_INSTRUMENT_TOTAL');
  const budgets=new Map();for(const p of instruments)budgets.set(method(p.method),(budgets.get(method(p.method))||0)+cents(p.amount));for(const p of children)budgets.set(method(p.method),(budgets.get(method(p.method))||0)-cents(p.amount));
  if([...budgets.values()].some(n=>n<0))throw Error('INSTRUMENT_ALLOCATION_MISMATCH');
  if(unassigned&&parts.some(p=>p.id.startsWith('__')&&p.id!=='__unassigned__'&&p.value))throw Error('RESERVED_INSTRUMENTS');
  return {requiresReview:false,available:unassigned/100,detail};
 }catch(error){return {requiresReview:true,reason:['AMOUNT_FORMAT','DISTRIBUTION_MISSING','DISTRIBUTION_APPLICATION_MISMATCH','HISTORICAL_BALANCE','NON_CASH_RETENTION_OR_INSTRUMENT_TOTAL','INSTRUMENT_ALLOCATION_MISMATCH','RESERVED_INSTRUMENTS'].includes(error.message)?error.message:'MALFORMED_RECEIPT',available:0,detail:{}};}
}
const blocker=message=>message.includes('distribución o los medios')?'RECEIPT_RECONCILIATION':message.includes('antes del check-in')?'STAY_ALREADY_STARTED_OR_CLOSED':message.includes('consumos o cargos')?'ROOM_EXTRAS':message.includes('voucher')?'VOUCHER':message.includes('Cuenta Corriente')?'CURRENT_ACCOUNT':message.includes('canal externo')?'EXTERNAL_CHANNEL':/fiscal|comprobante/i.test(message)?'FISCAL_REVIEW':/operación financiera/i.test(message)?'PENDING_FINANCIAL_OPERATION':'OTHER_REVIEW';
export async function diagnoseGroupHolder({password,fetchImpl=globalThis.fetch,now=new Date()}){
 if(!password)throw Error('Falta acceso de comprobacion');let cookie='';
 try{
  const auth=await fetchImpl(base+'/api/auth/login',{method:'POST',redirect:'manual',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:'admin',password}),signal:AbortSignal.timeout(20000)});
  if(auth.status!==200)throw Error('No se pudo autenticar');cookie=auth.headers.getSetCookie().map(v=>v.split(';')[0]).join('; ');if(!cookie||(await auth.json()).role!=='admin')throw Error('Sesion no valida');
  const get=async path=>{const r=await fetchImpl(base+path,{method:'GET',redirect:'manual',headers:{Cookie:cookie},signal:AbortSignal.timeout(30000)});if(r.status!==200)throw Error('No se pudo consultar el estado');return r.json();};
  const date=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Argentina/Buenos_Aires',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
  const found=await get('/api/reservations?dateMode=all&search=802&limit=200');if(!Array.isArray(found))throw Error('Formato no valido');
  const report={date,room:'802',reservations:[]};
  for(const r of found.filter(r=>String(r.room?.roomNumber)==='802'&&r.groupId&&!['cancelled','no_show','checked_out'].includes(r.status)&&r.checkInDate<=date&&r.checkOutDate>=date)){
   const group=await get(`/api/groups/${encodeURIComponent(r.groupId)}`);if(!String(group.name||'').toUpperCase().includes('FICER'))continue;
   const path=`/api/groups/${encodeURIComponent(r.groupId)}/reservations/${encodeURIComponent(r.id)}`;
   const preview=await get(path+'/assignment-preview');
   const holder=await get(`/api/reservations/${encodeURIComponent(r.id)}/holder-correction`);
   const account=await get(`/api/reservations/${encodeURIComponent(r.id)}/group-account`);
   const receipts=await get(`/api/groups/${encodeURIComponent(r.groupId)}/payments`);if(!Array.isArray(receipts)||!Array.isArray(group.reservations)||!Array.isArray(account.reviewReceipts))throw Error('Formato no valido');
   const allChildren=group.reservations.flatMap(room=>(room.payments||[]).filter(p=>p.status!=='anulado').map(p=>({...p,reservationId:p.reservationId||room.id})));
   const own=allChildren.filter(p=>p.reservationId===r.id);const parentIds=[...new Set(own.map(p=>p.groupPaymentId).filter(Boolean))];const receiptChecks=[];
   for(const parentId of parentIds){
    const parent=receipts.find(p=>p.id===parentId);if(!parent){receiptChecks.push({parentPresent:false});continue;}
    const children=allChildren.filter(p=>p.groupPaymentId===parentId),ownChildren=children.filter(p=>p.reservationId===r.id),current=receiptFacts(parent,children);
    const released=ownChildren.reduce((n,p)=>n+cents(p.amount),0),after=receiptFacts({...parent,distributionDetail:{...current.detail,[r.id]:0,__unassigned__:(cents(current.available)+released)/100}},children.filter(p=>p.reservationId!==r.id));
    let instruments=[];try{const raw=parse(parent.paymentMethodDetail);instruments=Array.isArray(raw)&&raw.length?raw:[{method:parent.method,amount:parent.amount}];}catch{}
    const currentServerReview=account.reviewReceipts.some(p=>p.id===parentId);
    receiptChecks.push({parentPresent:true,currentServerRequiresReview:currentServerReview,localFactsAgreeWithServer:current.requiresReview===currentServerReview,currentFactsReason:current.reason||null,roomHasAllocation:released>0,receiptFullyApplied:!current.requiresReview&&current.available===0,simulatedReleaseRequiresReview:after.requiresReview,simulatedReleaseReason:after.reason||null,hasCurrentAccountInstrument:instruments.some(p=>method(p.method)==='cuenta_corriente'),hasRetention:instruments.some(p=>Number(p.retention?.monto||0)!==0),hasNonDirectInstrument:instruments.some(p=>!direct.has(method(p.method))),hasFiscalLink:!!(parent.invoiceId||parent.invoiceRef||ownChildren.some(p=>p.invoiceRef||p.invoiceLinkFailed))});
   }
   report.reservations.push({status:r.status,checkIn:r.checkInDate,checkOut:r.checkOutDate,groupMatchesRequest:true,canReplace:preview.canReplace,replacementBlockers:(preview.replacementBlockers||[]).map(blocker),personalAdvancePresent:Number(preview.personalAdvance)>0,groupAdvancePresent:Number(preview.groupAdvance)>0,newInHouseCorrection:{canCorrect:holder.canCorrect,blockerCount:holder.blockers?.length},receiptChecks});
  }
  return report;
 }finally{if(cookie)await fetchImpl(base+'/api/auth/logout',{method:'POST',redirect:'manual',headers:{Cookie:cookie},signal:AbortSignal.timeout(10000)}).catch(()=>undefined);}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 try{console.log(JSON.stringify(await diagnoseGroupHolder({password:process.env.SMOKE_TEST_PASSWORD})));}
 catch{console.error('No se pudo completar la consulta; no se imprimieron respuestas privadas.');process.exitCode=1;}
}
