import type { Pool } from 'pg';
import { readBookingNotes } from './bookingPrivate';
/** A separately authorized single-booking view. Audit before releasing notes;
 * never copy notes, contact fields, payloads or ciphertext into access logs. */
export async function inboundBookingDetail(pool:Pool,connectionId:string,revisionId:string,actor:{id?:string;name:string;ip?:string}){
 const c=await pool.connect();
 try{
  await c.query('BEGIN');
  const anchor=(await c.query('SELECT booking_id,inserted_at,created_at FROM channex_inbound_revisions WHERE connection_id=$1 AND revision_id=$2',[connectionId,revisionId])).rows[0];
  if(!anchor){await c.query('ROLLBACK');return null;}
  const archived=(await c.query(`SELECT revision_id,private_notes_encrypted FROM channex_inbound_revisions
    WHERE connection_id=$1 AND (booking_id=$2 OR ($2::text IS NULL AND revision_id=$3))
    AND private_notes_encrypted IS NOT NULL AND COALESCE(inserted_at,created_at)<=$4
    ORDER BY COALESCE(inserted_at,created_at) DESC,created_at DESC,revision_id DESC LIMIT 1`,[connectionId,anchor.booking_id,revisionId,anchor.inserted_at||anchor.created_at])).rows[0];
  let notes:string|null=null,notesStatus='not_saved';
  if(archived){try{
   const saved=readBookingNotes(archived.private_notes_encrypted,connectionId,archived.revision_id).notes;
   if(saved==='[payment-related note omitted]')notesStatus='payment_omitted';
   else if(typeof saved==='string'){notes=saved;notesStatus='available';}
  }catch{notesStatus='unavailable';}}
  const settlements=(await c.query(`SELECT DISTINCT ON(s.reservation_id) s.reservation_id,s.source_currency,s.source_total,s.exchange_rate,s.settlement_currency,s.settlement_total,s.created_at,s.revision_id
   FROM channex_inbound_settlements s JOIN channex_inbound_rooms link ON link.connection_id=s.connection_id AND link.reservation_id=s.reservation_id
   WHERE s.connection_id=$1 AND link.booking_id=$2 ORDER BY s.reservation_id,s.created_at DESC,s.revision_id DESC`,[connectionId,anchor.booking_id])).rows;
  await c.query(`INSERT INTO audit_logs(user_id,user_name,action,module,entity_type,entity_id,description,details,ip_address,timestamp)
   VALUES($1,$2,'view','ota','channex_booking_detail',$3,'Consulta de detalle de reserva OTA',$4,$5,now())`,[actor.id||null,actor.name,revisionId,JSON.stringify({connectionId,bookingId:anchor.booking_id,notesStatus}),actor.ip||null]);
  await c.query('COMMIT');return {notes,notesStatus,settlements};
 }catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
}
