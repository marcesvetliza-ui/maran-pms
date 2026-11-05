import { randomUUID } from 'node:crypto';
import express from 'express';
import type { Server } from 'node:http';
import { afterAll, describe, expect, it, vi } from 'vitest';
import pg from 'pg';
vi.mock('../auth',()=>({requireAuth:(_r:any,_s:any,n:any)=>n(),requireRole:()=> (_r:any,_s:any,n:any)=>n(),requirePermission:()=> (_r:any,_s:any,n:any)=>n()}));
vi.mock('../audit',()=>({audit:vi.fn()}));
vi.mock('../billing/billingConfig',()=>({getBillingConfig:async()=>({puntoVenta:1,puntoVentaHomolog:99,arcaAmbiente:'homologacion',razonSocial:'Prueba',cuit:'30000000007'}),updateBillingConfig:vi.fn()}));
const { registerBillingRoutes } = await import('../billing/routes');
const { registerReservationsRoutes } = await import('../routes/reservations');
const { storage } = await import('../db-storage');
const suite=process.env.DATABASE_URL?describe:describe.skip;
const pool=process.env.DATABASE_URL?new pg.Pool({connectionString:process.env.DATABASE_URL,max:4}):null;
suite('Cierre no fiscal CC real: grupo, deuda y checkout',()=>{
 afterAll(async()=>{await pool?.end();});
 it('emite sin CAE aun en homologación, traslada alojamiento/extras una vez y permite checkout',async()=>{
  if(!pool)return;
  const id=randomUUID(), gid=`group-${id}`, guest=`guest-${id}`, room=`room-${id}`, type=`type-${id}`, shift=`shift-${id}`;
  let server:Server|undefined;
  try {
   await pool.query("INSERT INTO guests(id,first_name,last_name) VALUES($1,'Cliente','Prueba')",[guest]);
   await pool.query("INSERT INTO room_types(id,code,name) VALUES($1::text,$1::text,'Prueba')",[type]);
   await pool.query("INSERT INTO rooms(id,room_number,room_type_id,status) VALUES($1::text,$1::text,$2,'occupied')",[room,type]);
   await pool.query("INSERT INTO groups(id,group_code,name,check_in_date,check_out_date,created_at) VALUES($1::text,$1::text,'Prueba CC',CURRENT_DATE,CURRENT_DATE,NOW())",[gid]);
   await pool.query("INSERT INTO reservations(id,reservation_code,guest_id,room_type_id,room_id,check_in_date,check_out_date,status,total_room_amount,nights,created_at) VALUES($1::text,$1::text,$2,$3,$4,CURRENT_DATE,CURRENT_DATE,'checked_in',100,1,NOW())",[id,guest,type,room]);
   await pool.query("INSERT INTO group_reservation_links(id,group_id,reservation_id) VALUES($1::text,$2,$1::text)",[id,gid]);
   const charge=(await pool.query("INSERT INTO charges(reservation_id,description,amount,date,category,status) VALUES($1,'Cochera',25,CURRENT_DATE,'otros','active') RETURNING id",[id])).rows[0].id;
   await pool.query("INSERT INTO cash_shifts(id,area,shift_number,opened_at,status) VALUES($1,'reception',990015,NOW(),'open')",[shift]);
   const app=express();app.use(express.json());app.use((req,_res,next)=>{(req as any).user={id:null,username:'test',role:'admin'};next();});registerBillingRoutes(app);registerReservationsRoutes(app);
   server=await new Promise<Server>(resolve=>{const s=app.listen(0,()=>resolve(s));});
   const address=server.address() as any, base=`http://127.0.0.1:${address.port}`;
   const body={tipoComprobante:'cierre_habitacion',cliente:{razonSocial:'Cliente Prueba',condicionIva:'Consumidor Final'},items:[{descripcion:'Alojamiento y cochera',cantidad:1,precioUnitario:125,subtotal:125,subtotalNeto:125,alicuotaIva:'21'}],reservaId:id,sourceChargeIds:['accommodation',String(charge)],sourceChargeAmounts:{accommodation:100,[String(charge)]:25},reservationSettlementMethod:'cuenta_corriente',cashFormaPago:'cuenta_corriente',cashFormaPagoDetalle:[{method:'cuenta_corriente',amount:125}],ccEntityType:'guest',ccEntityId:guest,creditOperationId:randomUUID(),creditReapplications:[],ordinaryAdvanceApplications:[]};
   const post=async(path:string,data:any)=>{const r=await fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});return {status:r.status,body:await r.json()};};
   const first=await post('/api/billing/invoices',body);
   expect(first,JSON.stringify(first)).toMatchObject({status:201,body:{tipoComprobante:'cierre_habitacion',cae:null,montoTotal:'125.00'}});
   const repeat=await post('/api/billing/invoices',body);expect(repeat.status,JSON.stringify(repeat)).toBe(201);expect(repeat.body.id).toBe(first.body.id);
   expect((await pool.query('SELECT amount,entity_type,entity_id FROM account_movements WHERE reservation_id=$1',[id])).rows).toEqual([{amount:'125.00',entity_type:'guest',entity_id:guest}]);
   const payments=(await pool.query('SELECT id,amount,method FROM payments WHERE reservation_id=$1',[id])).rows;
   expect(payments).toHaveLength(1);expect(payments[0]).toMatchObject({amount:'125.00',method:'cuenta_corriente'});
   expect((await pool.query('SELECT movement_type,payment_method,amount FROM cash_movements WHERE source_id=$1',[id])).rows).toEqual([{movement_type:'informational',payment_method:'current_account',amount:'125.00'}]);
   expect((await pool.query('SELECT id FROM group_payments WHERE group_id=$1',[gid])).rows).toHaveLength(0);
   const alreadyCovered=await post('/api/billing/invoices',{...body,creditOperationId:randomUUID()});
   expect(alreadyCovered.status,JSON.stringify(alreadyCovered)).toBe(409);
   expect((await pool.query('SELECT id FROM sales_invoices WHERE reserva_id=$1',[id])).rows).toHaveLength(1);
   const checkout=await post(`/api/reservations/${id}/check-out`,{});expect(checkout.status,JSON.stringify(checkout)).toBe(200);
   expect((await pool.query('SELECT status FROM reservations WHERE id=$1',[id])).rows[0].status).toBe('checked_out');
   expect((await pool.query('SELECT status FROM rooms WHERE id=$1',[room])).rows[0].status).toBe('dirty');
   // Repeating a different CC operation cannot recreate settled group debt.
   await expect(storage.createReservationPaymentWithLedger({payment:{reservationId:id,amount:'1.00',method:'cuenta_corriente',date:'2026-11-05',invoiceRef:JSON.stringify({id:991999})} as any,receiptType:'cierre_habitacion',sourceLabel:'Duplicado',accountSettlement:{entityType:'guest',entityId:guest,description:'No debe crearse',reference:'duplicate-'+id}})).rejects.toMatchObject({statusCode:409});
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
 it('serializa dos traslados contra saldo grupal ya parcialmente cobrado, sin duplicar deuda',async()=>{
  if(!pool)return;
  const id=randomUUID(), gid='group-'+id, shift='shift-'+id;
  try {
   await pool.query("INSERT INTO groups(id,group_code,name,check_in_date,check_out_date,created_at) VALUES($1::text,$1::text,'Saldo grupal',CURRENT_DATE,CURRENT_DATE,NOW())",[gid]);
   await pool.query("INSERT INTO reservations(id,reservation_code,guest_id,room_type_id,room_id,check_in_date,check_out_date,status,total_room_amount,created_at) VALUES($1::text,$1::text,'test-guest','test-type','test-room',CURRENT_DATE,CURRENT_DATE,'checked_in',100,NOW())",[id]);
   await pool.query("INSERT INTO group_reservation_links(id,group_id,reservation_id) VALUES($1::text,$2,$1::text)",[id,gid]);
   await pool.query("INSERT INTO group_payments(id,group_id,amount,method,date,distribution,destination,created_at) VALUES($1,$2,80,'efectivo',CURRENT_DATE,'equal','master_folio',NOW())",[randomUUID(),gid]);
   await pool.query("INSERT INTO cash_shifts(id,area,shift_number,opened_at,status) VALUES($1,'reception',990016,NOW(),'open')",[shift]);
   const transfer=(reference:string)=>storage.createReservationPaymentWithLedger({payment:{reservationId:id,amount:'15.00',method:'cuenta_corriente',date:'2026-11-05',invoiceRef:JSON.stringify({id:reference})} as any,receiptType:'cierre_habitacion',sourceLabel:'Traslado de prueba',accountSettlement:{entityType:'guest',entityId:'test-guest',description:'Saldo grupal',reference}});
   const result=await Promise.allSettled([transfer('a-'+id),transfer('b-'+id)]);
   expect(result.filter(r=>r.status==='fulfilled')).toHaveLength(1);
   expect(result.find(r=>r.status==='rejected')).toMatchObject({reason:{statusCode:409}});
   expect((await pool.query('SELECT amount FROM account_movements WHERE reservation_id=$1',[id])).rows).toEqual([{amount:'15.00'}]);
   expect((await pool.query('SELECT amount FROM group_payments WHERE group_id=$1',[gid])).rows).toEqual([{amount:'80.00'}]);
   expect((await pool.query("SELECT id FROM cash_movements WHERE source_id=$1 AND movement_type='income'",[id])).rows).toHaveLength(0);
  } finally {
   await pool.query('DELETE FROM account_movements WHERE reservation_id=$1',[id]);
   await pool.query('DELETE FROM folio_movements WHERE folio_id IN (SELECT id FROM folios WHERE entity_id=$1)',[id]);
   await pool.query('DELETE FROM folios WHERE entity_id=$1',[id]);
   await pool.query('DELETE FROM cash_movements WHERE source_id=$1',[id]);
   await pool.query('DELETE FROM payments WHERE reservation_id=$1',[id]);
   await pool.query('DELETE FROM group_payments WHERE group_id=$1',[gid]);
   await pool.query('DELETE FROM group_reservation_links WHERE reservation_id=$1',[id]);
   await pool.query('DELETE FROM reservations WHERE id=$1',[id]);
   await pool.query('DELETE FROM groups WHERE id=$1',[gid]);
   await pool.query('DELETE FROM cash_shifts WHERE id=$1',[shift]);
  }
 });

});
