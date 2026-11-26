import { sql } from 'drizzle-orm';
import { db } from '../db';
import { storage } from '../db-storage';
import { revisionHash, review } from './bookingRevision';
export type RoomGuestProfile={firstName:string;lastName:string;email:string|null;phone:string|null};
export function guestFingerprint(g:any){return revisionHash({firstName:g.firstName,lastName:g.lastName,email:g.email||null,phone:g.phone||null});}
/** Never match people across bookings. A shared legacy booker is split when
 * one room names a different guest, after checking the accepted fingerprint. */
export async function syncRoomGuest(input:{connectionId:string;bookingId:string;oldGuestId?:string;oldReservationId?:string;expectedHash?:string|null;profile:RoomGuestProfile;cache:Map<string,string>}){
 const hash=guestFingerprint(input.profile);
 let id=input.oldGuestId;
 if(id){
  await db.execute(sql`SELECT id FROM guests WHERE id=${id} FOR UPDATE`);
  const guest=await storage.getGuest(id);
  if(!guest||!input.expectedHash||guestFingerprint(guest)!==input.expectedHash)return review('LOCAL_GUEST_CHANGED');
  if(guestFingerprint(guest)!==hash){
   if(guest.documentNumber&&(guest.firstName!==input.profile.firstName||guest.lastName!==input.profile.lastName))return review('LOCAL_GUEST_CHANGED');
   if(input.oldReservationId){
    const prepared=(await db.execute(sql`SELECT 1 FROM reservations WHERE id=${input.oldReservationId} AND stay_details IS NOT NULL
     UNION ALL SELECT 1 FROM reservation_companions WHERE reservation_id=${input.oldReservationId} LIMIT 1`)).rows.length;
    if(prepared)return review('LOCAL_GUEST_CHANGED');
   }
   const foreign=(await db.execute(sql`SELECT 1 FROM reservations r WHERE r.guest_id=${id}
    AND NOT EXISTS(SELECT 1 FROM channex_inbound_rooms l WHERE l.connection_id=${input.connectionId} AND l.booking_id=${input.bookingId} AND l.reservation_id=r.id) LIMIT 1`)).rows.length;
   if(foreign)return review('SHARED_GUEST_REQUIRES_REVIEW');
   const count=(await db.execute(sql`SELECT count(*)::int n FROM reservations WHERE guest_id=${id}`)).rows[0] as any;
   if(Number(count.n)>1)id=undefined;
   else await storage.updateGuest(id,input.profile);
  }
 }
 if(!id)id=input.cache.get(hash)||(await storage.createGuest(input.profile)).id;
 input.cache.set(hash,id);
 return {id,hash};
}
