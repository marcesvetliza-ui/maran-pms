import {randomUUID} from 'node:crypto';
import {beforeAll,afterAll,describe,it,expect} from 'vitest';
import {pool,withDatabaseTransaction} from '../db';
import {storage} from '../db-storage';
const suite=process.env.DATABASE_URL?describe:describe.skip;
const prefix='cancel-folio-'+randomUUID(),ids:string[]=[];
suite('cancelled reservations archive operational folios without financial reversal',()=>{
 beforeAll(async()=>{
  const url=new URL(process.env.DATABASE_URL!);if(!['localhost','127.0.0.1'].includes(url.hostname)||!/test/.test(url.pathname))throw Error('Local test DB required');
  await pool.query("INSERT INTO room_types(id,code,name)VALUES($1,$2,'Prueba')",[prefix,prefix]);
  await pool.query("INSERT INTO rooms(id,room_number,room_type_id,status)VALUES($1,$2,$3,'available')",[prefix,prefix,prefix]);
  await pool.query("INSERT INTO guests(id,first_name,last_name)VALUES($1,'Prueba','Folio')",[prefix]);
 });
 afterAll(async()=>{
  for(const id of ids){await pool.query("DELETE FROM folio_movements WHERE folio_id IN(SELECT id FROM folios WHERE entity_type='reservation' AND entity_id=$1)",[id]);await pool.query("DELETE FROM folios WHERE entity_type='reservation' AND entity_id=$1",[id]);await pool.query('DELETE FROM audit_logs WHERE entity_id=$1',[id]);await pool.query('DELETE FROM reservation_changelog WHERE reservation_id=$1',[id]);await pool.query('DELETE FROM cancelled_reservation_logs WHERE reservation_id=$1',[id]);await pool.query('DELETE FROM reservations WHERE id=$1',[id]);}
  await pool.query('DELETE FROM rooms WHERE id=$1',[prefix]);await pool.query('DELETE FROM room_types WHERE id=$1',[prefix]);await pool.query('DELETE FROM guests WHERE id=$1',[prefix]);await pool.end();
 });
 async function fixture(status='pending'){
  const id=prefix+'-'+ids.length;ids.push(id);
  await pool.query("INSERT INTO reservations(id,reservation_code,guest_id,room_id,room_type_id,check_in_date,check_out_date,nights,status,number_of_guests,final_rate_per_night,total_room_amount,created_at)VALUES($1,$2,$3,$4,$5,$7,$8,1,$6,1,200,200,now())",[id,id,prefix,prefix,prefix,status,`2027-05-${String(ids.length*2).padStart(2,'0')}`,`2027-05-${String(ids.length*2+1).padStart(2,'0')}`]);return id;
 }
 it('manual cancellation archives the folio while preserving charges, payments and balance',async()=>{
  const id=await fixture(),folio=await storage.getOrCreateFolio('reservation',id);
  await storage.addFolioCharge('reservation',id,200,'Alojamiento histórico');
  await pool.query("INSERT INTO folio_movements(folio_id,type,amount,description)VALUES($1,'payment',50,'Pago histórico')",[folio.id]);await storage.recalcFolioBalance(folio.id);
  const movements=(await pool.query('SELECT * FROM folio_movements WHERE folio_id=$1 ORDER BY id',[folio.id])).rows;
  const before=(await storage.getFolioById(folio.id))!;
  await storage.cancelReservationWithHistory(id,'Prueba de anulación',{name:'Operador de prueba'});
  const after=(await storage.getFolioById(folio.id))!;
  expect(after.status).toBe('closed');expect(after.closedBy).toBe('Operador de prueba');
  expect([after.totalCharges,after.totalPayments,after.balance]).toEqual([before.totalCharges,before.totalPayments,before.balance]);
  expect((await pool.query('SELECT * FROM folio_movements WHERE folio_id=$1 ORDER BY id',[folio.id])).rows).toEqual(movements);
 });
 it('generic cancellation used by Channex closes an existing empty folio',async()=>{
  const id=await fixture(),folio=await storage.getOrCreateFolio('reservation',id);
  await storage.updateReservation(id,{status:'cancelled',lastModifiedBy:'Channex'});
  expect((await storage.getFolioById(folio.id))?.status).toBe('closed');
 });
 it('a PDF/ensure request for a cancelled reservation creates a closed historical folio',async()=>{
  const id=await fixture('cancelled');const first=await storage.getOrCreateFolio('reservation',id),second=await storage.getOrCreateFolio('reservation',id);
  expect(first.status).toBe('closed');expect(second.id).toBe(first.id);
 });
 it('rolls back cancellation and folio archival together',async()=>{
  const id=await fixture(),folio=await storage.getOrCreateFolio('reservation',id);
  await expect(withDatabaseTransaction(async()=>{await storage.updateReservation(id,{status:'cancelled'});throw Error('rollback fixture');})).rejects.toThrow('rollback fixture');
  expect((await storage.getReservation(id))?.status).toBe('pending');expect((await storage.getFolioById(folio.id))?.status).toBe('open');
 });
 it('lazy creation racing cancellation never leaves an open folio',async()=>{
  const id=await fixture();await Promise.all([storage.getOrCreateFolio('reservation',id),storage.updateReservation(id,{status:'cancelled'})]);
  expect((await storage.getFolioByEntity('reservation',id))?.status).toBe('closed');
 });
 it('keeps an invoiced folio invoiced and archives a historical open folio on ensure',async()=>{
  const id=await fixture(),folio=await storage.getOrCreateFolio('reservation',id);await pool.query("UPDATE folios SET status='invoiced' WHERE id=$1",[folio.id]);
  await storage.updateReservation(id,{status:'cancelled'});expect((await storage.getFolioById(folio.id))?.status).toBe('invoiced');
  await pool.query("UPDATE folios SET status='open' WHERE id=$1",[folio.id]);expect((await storage.getOrCreateFolio('reservation',id)).status).toBe('closed');
 });
});
