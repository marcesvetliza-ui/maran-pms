import {it,expect,afterAll} from 'vitest';
import {sql} from 'drizzle-orm';
import {db,pool,withDatabaseTransaction} from '../db';
import {randomUUID} from 'node:crypto';
import {ensureCcManualTrackingSchema,addCcManualTracking} from '../ccManualTracking';
import {getCcInvoiceTrackingList,getCcInvoiceTrackingMonthReport} from '../ccInvoiceTracking';
afterAll(async()=>pool.end());
it('agrega manualmente factura cero sin duplicar ni alterar documentos, conserva reintentos y separa gestiones de facturación',async()=>{
 expect(['localhost','127.0.0.1']).toContain(new URL(process.env.DATABASE_URL!).hostname);
 const rollback=new Error('fixture rollback');
 await expect(withDatabaseTransaction(async()=>{
  await ensureCcManualTrackingSchema();
  const inv=(await db.execute(sql`INSERT INTO sales_invoices(tipo_comprobante,punto_venta,numero,fecha_emision,cliente_razon_social,cliente_condicion_iva,monto_neto,monto_total,estado,cash_forma_pago) VALUES('FA',21,998877,'2002-01-03','DESPEGAR.COM.AR SA','responsable_inscripto',0,0,'emitida','cuenta_corriente') RETURNING id`)).rows[0];
  const before=(await db.execute(sql`SELECT row_to_json(si) data FROM sales_invoices si WHERE id=${inv.id}`)).rows[0];
  await db.execute(sql`INSERT INTO cc_invoice_tracking(sales_invoice_id,estado,observaciones) VALUES(${inv.id},'reclamada','Gestión previa')`);
  const input={requestId:randomUUID(),salesInvoiceId:Number(inv.id),entityName:'Despegar',fecha:'2002-01-03',motivo:'Esperar cotización'};
  const created=await addCcManualTracking(input,'Jefa');
  expect(await addCcManualTracking(input,'Jefa')).toEqual(created);
  const rows=await getCcInvoiceTrackingList({salesInvoiceId:Number(inv.id)});
  expect(rows).toHaveLength(1);expect(rows[0]).toMatchObject({manualId:created.id,monto:0,amountPending:true,estado:'reclamada',observaciones:'Gestión previa'});
  await addCcManualTracking({requestId:randomUUID(),entityName:'Despegar',reference:'RES-TEST',fecha:'2002-01-03',motivo:'Gestión sin factura',monto:123},'Jefa');
  const filtered=await getCcInvoiceTrackingList({from:'2002-01-01',to:'2002-01-31',search:'Gestión sin factura'});expect(filtered).toHaveLength(1);
  const summary=await getCcInvoiceTrackingMonthReport(2002,1);expect(summary.totalFacturado).toBe(0);expect(summary.totalFacturas).toBe(1);
  expect((await db.execute(sql`SELECT row_to_json(si) data FROM sales_invoices si WHERE id=${inv.id}`)).rows[0]).toEqual(before);
  await expect(addCcManualTracking({...input,requestId:randomUUID(),salesInvoiceId:2147483647},'Jefa')).rejects.toThrow('vigente');
  throw rollback;
 })).rejects.toBe(rollback);
});
it('permite agregar a jefatura y administradores, y rechaza recepcionistas sin ese rol',async()=>{
 const {default:express}=await import('express');
 const {registerCcInvoiceTrackingRoutes}=await import('../routes/ccInvoiceTracking');
 const app=express();app.use(express.json());
 app.use((req:any,_res,next)=>{req.user={role:req.headers['x-test-role'],username:'Test'};req.isAuthenticated=()=>true;next();});
 registerCcInvoiceTrackingRoutes(app);
 const server=app.listen(0,'127.0.0.1');
 try{
  await new Promise<void>(resolve=>server.once('listening',resolve));
  const address=server.address() as any;
  for(const role of ['reception','jefe_recepcion','admin']){
   const response=await fetch(`http://127.0.0.1:${address.port}/api/cc-invoice-tracking/manual`,{method:'POST',headers:{'content-type':'application/json','x-test-role':role},body:'{}'});
   expect(response.status).toBe(role==='reception'?403:400);
  }
 }finally{await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()));}
});
