import {test} from 'node:test';
import assert from 'node:assert/strict';
import {diagnoseInvoices} from './diagnose-restaurant-invoices.mjs';
function harness(fail=false){
 const calls=[];const records=[{numero:494,monto_total:152500},{numero:493,monto_total:23500},{numero:489,monto_total:75500},{numero:490,monto_total:35000}].map((i,k)=>({...i,id:k+1,tipo_comprobante:'FB',punto_venta:5,estado:'emitida',cae:'12345678901234',reconciliation_status:'pendiente',cliente_razon_social:'CLIENTE PRIVADO',cliente_dni:'DOCUMENTO PRIVADO',reconciliation_error:'Error contacto privado@example.test',cash_forma_pago_detalle:[{method:'efectivo',amount:i.monto_total,reference:'REFERENCIA PRIVADA'}],...(k===0?{restaurant_order_id:'order-1'}:{})}));
 const fetchImpl=async(raw,options)=>{const u=new URL(raw);calls.push({path:u.pathname,query:u.search,method:options.method});let data;
 if(u.pathname==='/api/auth/login')return {status:200,headers:{getSetCookie:()=>['sid=SESSION_PRIVATE; HttpOnly']},json:async()=>({role:'admin'})};
 if(u.pathname==='/api/auth/logout')data={ok:true};
 else if(u.pathname==='/api/health')data={revision:'test',status:'ok',database:'ok',financialReady:true};
 else if(u.pathname==='/api/billing/invoices')data=records;
 else if(/^\/api\/billing\/invoices\/\d+$/.test(u.pathname)){if(fail)throw Error('synthetic transport failure');data=records.find(i=>i.id===Number(u.pathname.split('/').at(-1)));}
 else if(u.pathname==='/api/cash/shifts')data=u.searchParams.get('area')==='restaurant'?[{id:'shift-1',openedAt:'2026-11-23T03:00:00Z',closedAt:'2026-11-25T03:00:00Z'}]:[];
 else if(u.pathname==='/api/cash/movements')data=[{id:'move-1',sourceType:'comprobante',sourceId:'1',area:'restaurant',amount:152500,paymentMethod:'efectivo',sourceLabel:'ETIQUETA PRIVADA',description:'DESCRIPCIÓN PRIVADA'}];
 else if(u.pathname==='/api/restaurant/orders/order-1')data={id:'order-1',orderNumber:'ORD-TEST',status:'closed',total:152500,guest:{name:'HUÉSPED PRIVADO'},waiterName:'MOZO PRIVADO'};
 else if(u.pathname==='/api/restaurant/orders/order-1/folio-payments')data=[];
 else if(u.pathname==='/api/folios/restaurant_order/order-1')data={id:'folio-1',totalCharges:'152500',totalPayments:'152500',balance:'0',movements:[]};
 else throw Error('Ruta inesperada');
 return {status:200,json:async()=>data};};return {fetchImpl,calls};
}
test('consulta solo comprobantes elegidos y relaciones, sin escribir operaciones ni divulgar datos personales',async()=>{
 const h=harness(),r=await diagnoseInvoices({password:'PASSWORD_PRIVATE',fetchImpl:h.fetchImpl});assert.equal(r.operationalWrites,0);assert.equal(r.invoices.length,4);assert.equal(r.invoices[0].relatedCash[0].amount,152500);assert.equal(r.invoices[0].order.number,'ORD-TEST');assert.match(r.invoices[0].invoiceFingerprint,/^[a-f0-9]{64}$/);assert.match(r.invoices[0].financialFingerprint,/^[a-f0-9]{64}$/);
 const text=JSON.stringify(r);for(const word of ['PRIVADO','PRIVADA','PASSWORD_PRIVATE','SESSION_PRIVATE','privado@example.test'])assert.ok(!text.includes(word));
 for(const c of h.calls)if(!['/api/auth/login','/api/auth/logout'].includes(c.path))assert.equal(c.method,'GET');
 assert.ok(h.calls.every(c=>c.path!=='/api/restaurant/orders'));assert.equal(h.calls.at(-1).path,'/api/auth/logout');
});
test('cierra su sesión si una lectura falla, sin intentar reparación ni ARCA',async()=>{const h=harness(true);await assert.rejects(diagnoseInvoices({password:'private',fetchImpl:h.fetchImpl}));assert.equal(h.calls.at(-1).path,'/api/auth/logout');assert.ok(h.calls.every(c=>!c.path.includes('reconcile')&&!c.path.includes('settle-center')&&!c.path.includes('arca')));});
