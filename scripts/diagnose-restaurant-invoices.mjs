import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
const fingerprint=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const base='https://maranpms.com.ar';
const targets=[{number:494,amount:152500},{number:493,amount:23500},{number:489,amount:75500},{number:490,amount:35000}];
function sanitizedError(value){
 if(!value)return null;
 const text=String(value);if(/password|bearer|private key|BEGIN CERT|postgres(?:ql)?:\/\/|access[_ -]?token/i.test(text))return '[Detalle reservado]';
 return text.replace(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi,'[email]').replace(/\b\d{11,}\b/g,'[identificador]').slice(0,700);
}
function paymentRows(rows){return Array.isArray(rows)?rows.map(r=>({method:r.method||null,amount:Number(r.amount||0)})):null;}
export async function diagnoseInvoices({password,fetchImpl=globalThis.fetch}){
 if(!password)throw Error('Falta acceso de diagnóstico');let cookie='';
 async function read(path){
  const allowed=/^\/api\/folios\/restaurant_order\/[a-zA-Z0-9-]+$/.test(path)||/^\/api\/health$/.test(path)||/^\/api\/billing\/invoices\?desde=2026-11-23&hasta=2026-11-24(?:&area=restaurant)?$/.test(path)||/^\/api\/billing\/invoices\/\d+$/.test(path)||/^\/api\/cash\/shifts\?area=(restaurant|recepcion)$/.test(path)||/^\/api\/cash\/movements\?shiftId=[a-zA-Z0-9-]+$/.test(path)||/^\/api\/restaurant\/orders\/[a-zA-Z0-9-]+(?:\/folio-payments)?$/.test(path);
  if(!allowed)throw Error('Consulta fuera del alcance');
  const r=await fetchImpl(base+path,{method:'GET',redirect:'manual',headers:cookie?{Cookie:cookie}:{},signal:AbortSignal.timeout(30000)});if(r.status!==200)throw Error('Consulta no disponible: '+path.split('?')[0]);return r.json();
 }
 const health=await read('/api/health');if(health.status!=='ok'||health.database!=='ok'||!health.financialReady)throw Error('Sistema no disponible');
 try{
  const auth=await fetchImpl(base+'/api/auth/login',{method:'POST',redirect:'manual',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:'admin',password}),signal:AbortSignal.timeout(20000)});
  if(auth.status!==200)throw Error('Acceso no disponible');cookie=auth.headers.getSetCookie().map(v=>v.split(';')[0]).join('; ');if(!cookie||(await auth.json()).role!=='admin')throw Error('Sesión no válida');
  const listed=await read('/api/billing/invoices?desde=2026-11-23&hasta=2026-11-24');
  const restaurantListed=await read('/api/billing/invoices?desde=2026-11-23&hasta=2026-11-24&area=restaurant');
  if(!Array.isArray(listed)||!Array.isArray(restaurantListed))throw Error('Listado no válido');
  const invoices=[];
  for(const target of targets){
   const matches=listed.filter(i=>i.tipo_comprobante==='FB'&&Number(i.punto_venta)===5&&Number(i.numero)===target.number&&Number(i.monto_total)===target.amount);
   if(matches.length!==1)throw Error('No se encontró un único comprobante '+target.number);
   const invoice=await read('/api/billing/invoices/'+matches[0].id);invoice.area_name=matches[0].area_name;if(Number(invoice.id)!==Number(matches[0].id))throw Error('Identidad de comprobante no válida');invoices.push(invoice);
  }
  const cash=[];let shiftCount=0,shiftLimitReached=false;
  const from=Date.parse('2026-11-23T03:00:00Z'),to=Date.parse('2026-11-25T03:00:00Z');
  for(const area of ['restaurant','recepcion']){
   const shifts=await read('/api/cash/shifts?area='+area);if(!Array.isArray(shifts))throw Error('Turnos no válidos');
   const relevant=shifts.filter(s=>Date.parse(s.openedAt)<to&&(!s.closedAt||Date.parse(s.closedAt)>=from));shiftLimitReached ||= relevant.length>8;
   for(const shift of relevant.slice(0,8)){const movements=await read('/api/cash/movements?shiftId='+encodeURIComponent(shift.id));if(!Array.isArray(movements))throw Error('Movimientos no válidos');shiftCount++;cash.push(...movements);}
  }
  const result=[];
  for(const i of invoices){
   const related=cash.filter(m=>m.sourceType==='comprobante'&&String(m.sourceId)===String(i.id)||Array.isArray(m.restaurantInvoices)&&m.restaurantInvoices.some(d=>Number(d.id)===Number(i.id))||i.restaurant_order_id&&m.sourceType==='restaurant_order'&&String(m.sourceId)===String(i.restaurant_order_id));
   let order=null,folioPayments=null,folioSnapshot=null;
   if(i.restaurant_order_id){const o=await read('/api/restaurant/orders/'+encodeURIComponent(i.restaurant_order_id));order={id:o.id,number:o.orderNumber,status:o.status,total:Number(o.total),method:o.paymentMethod,receiptType:o.receiptType,closedAt:o.closedAt,chargedToRoom:o.chargedToRoom};const p=await read('/api/restaurant/orders/'+encodeURIComponent(i.restaurant_order_id)+'/folio-payments');const f=await read('/api/folios/restaurant_order/'+encodeURIComponent(i.restaurant_order_id));
    if(f)folioSnapshot={id:f.id,charges:f.totalCharges,payments:f.totalPayments,balance:f.balance,movements:f.movements.map(m=>({id:m.id,type:m.type,amount:m.amount,sourceType:m.sourceType,sourceId:m.sourceId,paymentMethod:m.paymentMethod,cashMovementId:m.cashMovementId,voidedMovementId:m.voidedMovementId})).sort((a,b)=>String(a.id).localeCompare(String(b.id)))};
    folioPayments=p.map(m=>({amount:Number(m.amount),method:m.paymentMethod||m.payment_method||null,invoiceId:m.invoiceId||m.invoice_id||null,status:m.status||null}));}
   result.push({id:i.id,number:Number(i.numero),amount:Number(i.monto_total),fiscalDate:i.fecha_emision,createdAt:i.created_at,state:i.estado,hasCae:!!i.cae,fictitious:i.modo_ficticio,environment:i.fiscal_identity?.environment||null,reconciliationStatus:i.reconciliation_status,reconciliationError:sanitizedError(i.reconciliation_error),reconciliationUpdatedAt:i.reconciliation_updated_at,listedArea:i.area_name||null,inRestaurantList:restaurantListed.some(r=>Number(r.id)===Number(i.id)),links:{reservation:!!i.reserva_id,payment:!!i.payment_id,group:!!i.group_id,spa:!!i.spa_account_id,restaurantOrder:i.restaurant_order_id||null,folio:i.folio_id||null},center:{area:i.center_settlement_area||null,status:i.center_settlement_status||null,intentKeys:Object.keys(i.center_settlement_intent||{})},cashMethod:i.cash_forma_pago||null,cashDetail:paymentRows(i.cash_forma_pago_detalle),sourceChargeCount:Array.isArray(i.source_charge_ids)?i.source_charge_ids.length:null,creditIntentKeys:Object.keys(i.credit_reapplication_intent||{}),relatedCash:related.map(m=>({id:m.id,area:m.area,sourceType:m.sourceType,sourceId:m.sourceId,amount:Number(m.amount),method:m.paymentMethod,movementType:m.movementType,createdAt:m.createdAt,documentClass:m.documentClass,documentReference:m.documentReference})),order,folioPayments,folioSnapshot,invoiceFingerprint:fingerprint({id:i.id,type:i.tipo_comprobante,point:i.punto_venta,number:i.numero,date:i.fecha_emision,total:i.monto_total,net:i.monto_neto,iva21:i.monto_iva21,iva105:i.monto_iva105,cae:i.cae,expiration:i.cae_fecha_vto,items:i.items,identity:i.fiscal_identity,orderId:i.restaurant_order_id}),financialFingerprint:fingerprint({order,folioSnapshot,cash:related.map(m=>({id:m.id,sourceType:m.sourceType,sourceId:m.sourceId,area:m.area,amount:m.amount,method:m.paymentMethod,movementType:m.movementType,anulado:m.anulado,createdAt:m.createdAt})).sort((a,b)=>String(a.id).localeCompare(String(b.id)))})});
  }
  return {revision:health.revision,operationalWrites:0,shiftCount,shiftLimitReached,invoices:result};
 }finally{if(cookie)await fetchImpl(base+'/api/auth/logout',{method:'POST',redirect:'manual',headers:{Cookie:cookie},signal:AbortSignal.timeout(10000)}).catch(()=>undefined);}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){try{console.log(JSON.stringify(await diagnoseInvoices({password:process.env.SMOKE_TEST_PASSWORD})));}catch(e){console.error(e.message);process.exitCode=1;}}
