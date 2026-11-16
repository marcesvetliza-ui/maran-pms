import type { Pool } from 'pg';
import { z } from 'zod';

export const inboxQuerySchema = z.object({
  view: z.enum(['attention', 'new', 'modified', 'cancelled', 'all']).default('all'),
  page: z.coerce.number().int().min(1).max(100000).default(1),
});
// Order by the channel timestamp, not receipt order. A delayed stale revision
// must never replace the current state of a booking in the operating inbox.
const latest = `WITH ranked AS (
 SELECT v.*, row_number() OVER (
  PARTITION BY (booking_id IS NULL), COALESCE(booking_id,revision_id)
  ORDER BY (status='stale'), COALESCE(inserted_at,created_at) DESC, created_at DESC, revision_id DESC
 ) AS position, count(*) OVER (PARTITION BY (booking_id IS NULL),COALESCE(booking_id,revision_id))::int AS revision_count
 FROM channex_inbound_revisions v WHERE connection_id=$1
), latest AS (
 SELECT *, CASE WHEN payload#>>'{attributes,status}' IN ('new','modified','cancelled') THEN payload#>>'{attributes,status}'
  ELSE 'attention' END AS inbox_view FROM ranked WHERE position=1
)`;
// Explicit allowlist: never return the raw source payload, contact details,
// encrypted notes, payment guarantees or webhook credentials to the browser.
const summary = `v.revision_id,v.booking_id,v.status,v.review_code,v.acked_at,v.created_at,v.inserted_at,
 v.payload#>>'{attributes,status}' AS booking_status,
 v.payload#>>'{attributes,ota_name}' AS channel,
 COALESCE(v.payload#>>'{attributes,ota_reservation_code}',v.payload#>>'{attributes,unique_id}',v.booking_id) AS reference,
 concat_ws(' ',v.payload#>>'{attributes,customer,name}',v.payload#>>'{attributes,customer,surname}') AS guest_name,
 v.payload#>>'{attributes,arrival_date}' AS arrival,
 v.payload#>>'{attributes,departure_date}' AS departure,
 v.payload#>>'{attributes,amount}' AS amount,v.payload#>>'{attributes,currency}' AS currency`;
const reservations = `COALESCE((SELECT jsonb_agg(jsonb_build_object(
 'id',r.id,'code',r.reservation_code,'guestName',concat_ws(' ',g.first_name,g.last_name),
 'roomNumber',rm.room_number,'category',rt.name,'checkInDate',r.check_in_date,'checkOutDate',r.check_out_date,'status',r.status)
 ORDER BY rm.room_number)
 FROM channex_inbound_rooms link JOIN reservations r ON r.id=link.reservation_id
 JOIN guests g ON g.id=r.guest_id JOIN rooms rm ON rm.id=r.room_id
 LEFT JOIN room_types rt ON rt.id=rm.room_type_id
 WHERE link.connection_id=v.connection_id AND link.booking_id=v.booking_id),'[]'::jsonb) AS reservations`;
export async function listInboundBookings(pool: Pool, connectionId: string, view: string, page: number) {
 const result = await pool.query(`${latest}, counts AS (
 SELECT count(*)::int AS "all",count(*) FILTER(WHERE status IN ('review','pending') OR inbox_view='attention')::int AS attention,
 count(*) FILTER(WHERE inbox_view='new')::int AS new,count(*) FILTER(WHERE inbox_view='modified')::int AS modified,
 count(*) FILTER(WHERE inbox_view='cancelled')::int AS cancelled FROM latest
 ), page_rows AS (
 SELECT * FROM latest WHERE ($2='all' OR inbox_view=$2 OR ($2='attention' AND status IN ('review','pending')))
 ORDER BY created_at DESC,revision_id DESC LIMIT 25 OFFSET $3
 ), items AS (SELECT ${summary},v.inbox_view,v.revision_count,${reservations} FROM page_rows v)
 SELECT row_to_json(counts) AS counts,COALESCE((SELECT jsonb_agg(items) FROM items),'[]'::jsonb) AS bookings FROM counts`,
 [connectionId,view,(page-1)*25]);
 return {...result.rows[0],page,pageSize:25};
}
export async function inboundBookingHistory(pool: Pool, connectionId: string, revisionId: string, page: number) {
 return (await pool.query(`WITH anchor AS (
 SELECT booking_id,revision_id FROM channex_inbound_revisions WHERE connection_id=$1 AND revision_id=$2
 ), history AS (
 SELECT v.* FROM channex_inbound_revisions v JOIN anchor a ON
 (a.booking_id IS NOT NULL AND v.booking_id=a.booking_id OR a.booking_id IS NULL AND v.revision_id=a.revision_id)
 WHERE v.connection_id=$1
 ), items AS (SELECT ${summary} FROM history v ORDER BY v.inserted_at DESC NULLS LAST,v.created_at DESC,v.revision_id DESC LIMIT 25 OFFSET $3)
 SELECT (SELECT count(*)::int FROM history) AS total,
 COALESCE((SELECT jsonb_agg(items) FROM items),'[]'::jsonb) AS revisions`,[connectionId,revisionId,(page-1)*25])).rows[0];
}
