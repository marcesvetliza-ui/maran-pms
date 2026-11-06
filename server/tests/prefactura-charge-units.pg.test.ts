import { randomUUID } from 'node:crypto';
import express from 'express';
import type { Server } from 'node:http';
import { afterAll, describe, expect, it, vi } from 'vitest';
import pg from 'pg';
import { invoiceSourceConflict } from '../billing/chargeFiscalHistory';
vi.mock('../auth',()=>({requireAuth:(_r:any,_s:any,n:any)=>n(),requireRole:()=> (_r:any,_s:any,n:any)=>n(),requirePermission:()=> (_r:any,_s:any,n:any)=>n()}));
vi.mock('../audit',()=>({audit:vi.fn()}));
vi.mock('../billing/billingConfig',()=>({getBillingConfig:async()=>({puntoVenta:1,puntoVentaHomolog:99,arcaAmbiente:'homologacion',razonSocial:'Prueba',cuit:'30000000007'}),updateBillingConfig:vi.fn()}));
const { registerBillingRoutes } = await import('../billing/routes');
const { registerReservationsRoutes } = await import('../routes/reservations');
const { storage } = await import('../db-storage');
const suite=process.env.DATABASE_URL?describe:describe.skip;
const pool=process.env.DATABASE_URL?new pg.Pool({connectionString:process.env.DATABASE_URL,max:4}):null;
suite('Comprobantes individuales por unidad con pagos CC y PostgreSQL reales',()=>{
 afterAll(async()=>{await pool?.end();});
 it('liquida cada unidad una sola vez, conserva sus fuentes y rechaza un comprobante agrupado obsoleto',async()=>{
  if(!pool)return;
  const id=randomUUID(), gid=`group-${id}`, guest=`guest-${id}`, room=`room-${id}`, type=`type-${id}`, shift=`shift-${id}`;
  let server:Server|undefined;
  try {
   await pool.query("INSERT INTO guests(id,first_name,last_name) VALUES($1,'Cliente','Prueba')",[guest]);
   await pool.query("INSERT INTO room_types(id,code,name) VALUES($1::text,$1::text,'Prueba')",[type]);
   await pool.query("INSERT INTO rooms(id,room_number,room_type_id,status) VALUES($1::text,$1::text,$2,'occupied')",[room,type]);
   await pool.query("INSERT INTO groups(id,group_code,name,check_in_date,check_out_date,created_at) VALUES($1::text,$1::text,'Prueba CC',CURRENT_DATE,CURRENT_DATE,NOW())",[gid]);
   await pool.query("INSERT INTO reservations(id,reservation_code,guest_id,room_type_id,room_id,check_in_date,check_out_date,status,total_room_amount,nights,created_at) VALUES($1::text,$1::text,$2,$3,$4,'2026-11-04','2026-11-06','checked_in',300,2,NOW())",[id,guest,type,room]);
   await pool.query("INSERT INTO group_reservation_links(id,group_id,reservation_id) VALUES($1::text,$2,$1::text)",[id,gid]);
   await pool.query("UPDATE reservations SET pricing_scheme='nightly_v1',nightly_pricing=$1 WHERE id=$2",[JSON.stringify([{date:'2026-11-04',rateCents:10000,discountCents:0},{date:'2026-11-05',rateCents:20000,discountCents:0}]),id]);
   const charge=(await pool.query("INSERT INTO charges(reservation_id,description,amount,date,category,status) VALUES($1,'Cochera (x2)',25,CURRENT_DATE,'otros','active') RETURNING id",[id])).rows[0].id;
   await pool.query("INSERT INTO cash_shifts(id,area,shift_number,opened_at,status) VALUES($1,'reception',990015,NOW(),'open')",[shift]);
   const app=express();app.use(express.json());app.use((req,_res,next)=>{(req as any).user={id:null,username:'test',role:'admin'};next();});registerBillingRoutes(app);registerReservationsRoutes(app);
   server=await new Promise<Server>(resolve=>{const s=app.listen(0,()=>resolve(s));});
   const address=server.address() as any, base=`http://127.0.0.1:${address.port}`;
   const body={tipoComprobante:'cierre_habitacion',cliente:{razonSocial:'Cliente Prueba',condicionIva:'Consumidor Final'},items:[{descripcion:'Alojamiento y cochera',cantidad:1,precioUnitario:112.5,subtotal:112.5,subtotalNeto:112.5,alicuotaIva:'21'}],reservaId:id,sourceChargeIds:['accommodation:2026-11-04',`charge-unit:${charge}:1`],sourceChargeAmounts:{'accommodation:2026-11-04':100,[`charge-unit:${charge}:1`]:12.5},reservationSettlementMethod:'cuenta_corriente',cashFormaPago:'cuenta_corriente',cashFormaPagoDetalle:[{method:'cuenta_corriente',amount:112.5}],ccEntityType:'guest',ccEntityId:guest,creditOperationId:randomUUID(),creditReapplications:[],ordinaryAdvanceApplications:[]};
   const post=async(path:string,data:any)=>{const r=await fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});return {status:r.status,body:await r.json()};};

   const first=await post('/api/billing/invoices',body);expect(first.status,JSON.stringify(first.body)).toBe(201);
   const client=await pool.connect();try{expect(await invoiceSourceConflict(client,id,String(charge))).toMatch(/historial fiscal/);}finally{client.release();}
   const repeat=await post('/api/billing/invoices',body);expect(repeat.status).toBe(201);expect(repeat.body.id).toBe(first.body.id);
   const second={...body,sourceChargeIds:['accommodation:2026-11-05',`charge-unit:${charge}:2`],sourceChargeAmounts:{'accommodation:2026-11-05':200,[`charge-unit:${charge}:2`]:12.5},items:[{descripcion:'Noche 05/11/2026',cantidad:1,precioUnitario:212.5,subtotal:212.5,subtotalNeto:212.5,alicuotaIva:'21'}],cashFormaPagoDetalle:[{method:'cuenta_corriente',amount:212.5}],creditOperationId:randomUUID()};
   const issued=await post('/api/billing/invoices',second);expect(issued.status,JSON.stringify(issued.body)).toBe(201);
   const duplicates=await Promise.all([1,2].map(()=>post('/api/billing/invoices',{...second,creditOperationId:randomUUID()})));expect(duplicates.map(r=>r.status)).toEqual([409,409]);
   const grouped=await post('/api/billing/invoices',{...second,sourceChargeIds:[String(charge)],sourceChargeAmounts:{[String(charge)]:12.5},items:[{descripcion:'Cochera',cantidad:1,precioUnitario:12.5,subtotal:12.5,subtotalNeto:12.5,alicuotaIva:'21'}],cashFormaPagoDetalle:[{method:'cuenta_corriente',amount:12.5}],creditOperationId:randomUUID()});expect(grouped.status).toBe(409);
   const oldClient=await post('/api/billing/invoices',{...second,sourceChargeIds:['accommodation'],sourceChargeAmounts:{accommodation:200},creditOperationId:randomUUID()});expect(oldClient.status).toBe(409);
   expect((await pool.query('SELECT source_charge_amounts FROM sales_invoices WHERE reserva_id=$1 ORDER BY id',[id])).rows.map(r=>r.source_charge_amounts)).toEqual([body.sourceChargeAmounts,second.sourceChargeAmounts]);
   expect((await pool.query('SELECT amount FROM payments WHERE reservation_id=$1 ORDER BY amount',[id])).rows).toEqual([{amount:'112.50'},{amount:'212.50'}]);
   expect((await pool.query('SELECT amount FROM account_movements WHERE reservation_id=$1 ORDER BY amount',[id])).rows).toEqual([{amount:'112.50'},{amount:'212.50'}]);
   expect((await pool.query("SELECT count(*)::int AS count FROM cash_movements WHERE source_id=$1 AND movement_type='income'",[id])).rows[0].count).toBe(0);
  } finally {
   if(server)await new Promise<void>(resolve=>server!.close(()=>resolve()));
   await pool.query('DELETE FROM account_movements WHERE reservation_id=$1',[id]);
   await pool.query('DELETE FROM folio_movements WHERE folio_id IN (SELECT id FROM folios WHERE entity_id=$1)',[id]);
   await pool.query('DELETE FROM folios WHERE entity_id=$1',[id]);
   await pool.query('DELETE FROM cash_movements WHERE source_id=$1',[id]);
   await pool.query('DELETE FROM payments WHERE reservation_id=$1',[id]);
   await pool.query('DELETE FROM sales_invoices WHERE reserva_id=$1',[id]);
   await pool.query('DELETE FROM charges WHERE reservation_id=$1',[id]);
   await pool.query('DELETE FROM group_reservation_links WHERE reservation_id=$1',[id]);
   await pool.query('DELETE FROM reservations WHERE id=$1',[id]);
   await pool.query('DELETE FROM housekeeping_tasks WHERE room_id=$1',[room]);
   await pool.query('DELETE FROM rooms WHERE id=$1',[room]);
   await pool.query('DELETE FROM room_types WHERE id=$1',[type]);
   await pool.query('DELETE FROM guests WHERE id=$1',[guest]);
   await pool.query('DELETE FROM groups WHERE id=$1',[gid]);
   await pool.query('DELETE FROM cash_shifts WHERE id=$1',[shift]);
  }
 });
});
