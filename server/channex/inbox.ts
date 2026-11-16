import type { Pool } from 'pg';
import { z } from 'zod';

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v => { const d=new Date(`${v}T12:00:00Z`); return !Number.isNaN(d.getTime()) && d.toISOString().slice(0,10)===v; });
export const inboxQuerySchema = z.object({
  view: z.enum(['attention', 'new', 'modified', 'cancelled', 'all']).default('all'),
  page: z.coerce.number().int().min(1).max(100000).default(1),
  search: z.string().trim().max(120).default(''), channel: z.string().max(160).default(''),
  dateType: z.enum(['received','stay']).default('received'), from: day.optional(), to: day.optional(),
}).refine(v => !v.from || !v.to || v.from<=v.to, {message:'El rango de fechas no es válido'});
export type InboxFilters = Pick<z.infer<typeof inboxQuerySchema>,'search'|'channel'|'dateType'|'from'|'to'>;
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
// Cancel notifications can be minimal. Recover display fields from the latest
// preceding full revision, retaining the current cancellation/apply state.
const displayFields = `, display AS (
 SELECT v.*, COALESCE(context.payload,'{}'::jsonb) AS context_payload
 FROM latest v LEFT JOIN LATERAL (
  SELECT old.payload FROM channex_inbound_revisions old
  WHERE old.connection_id=v.connection_id AND old.booking_id=v.booking_id
   AND old.payload#>>'{attributes,status}' IN ('new','modified') AND old.status<>'stale'
   AND COALESCE(old.inserted_at,old.created_at)<=COALESCE(v.inserted_at,v.created_at)
  ORDER BY COALESCE(old.inserted_at,old.created_at) DESC,old.created_at DESC,old.revision_id DESC LIMIT 1
 ) context ON true
), enriched AS (SELECT ${summary.replaceAll(/v\.payload#>>'(\{attributes,[^']+\})'/g, (match, path) => path==='{attributes,status}' ? match : `COALESCE(${match},v.context_payload#>>'${path}')`)},
 v.connection_id,v.payload,v.inbox_view,v.revision_count,${reservations} FROM display v)`;

export async function listInboundBookings(pool: Pool, connectionId: string, view: string, page: number, filters: Partial<InboxFilters>={}) {
 const result = await pool.query(`${latest}${displayFields}, filtered AS (
 SELECT * FROM enriched v WHERE
  ($4='' OR strpos(lower(concat_ws(' ',v.guest_name,v.reference,v.booking_id,
    (SELECT string_agg(concat_ws(' ',r->>'guestName',r->>'code'),' ') FROM jsonb_array_elements(v.reservations) r))),lower($4))>0)
  AND ($5='' OR v.channel=$5)
  AND ($6::text IS NULL OR CASE WHEN $8='received'
    THEN (v.created_at AT TIME ZONE 'America/Argentina/Buenos_Aires')::date::text >= $6
    ELSE v.departure > $6 END)
  AND ($7::text IS NULL OR CASE WHEN $8='received'
    THEN (v.created_at AT TIME ZONE 'America/Argentina/Buenos_Aires')::date::text <= $7
    ELSE v.arrival <= $7 END)
 ), counts AS (
 SELECT count(*)::int AS "all",count(*) FILTER(WHERE status IN ('review','pending') OR inbox_view='attention')::int AS attention,
 count(*) FILTER(WHERE inbox_view='new')::int AS new,count(*) FILTER(WHERE inbox_view='modified')::int AS modified,
 count(*) FILTER(WHERE inbox_view='cancelled')::int AS cancelled FROM filtered
 ), page_rows AS (
 SELECT * FROM filtered WHERE ($2='all' OR inbox_view=$2 OR ($2='attention' AND status IN ('review','pending')))
 ORDER BY created_at DESC,revision_id DESC LIMIT 25 OFFSET $3
 ), items AS (SELECT revision_id,booking_id,status,review_code,acked_at,created_at,inserted_at,
 booking_status,channel,reference,guest_name,arrival,departure,amount,currency,inbox_view,revision_count,reservations FROM page_rows)
 SELECT row_to_json(counts) AS counts,
 COALESCE((SELECT jsonb_agg(items ORDER BY items.created_at DESC,items.revision_id DESC) FROM items),'[]'::jsonb) AS bookings,
 COALESCE((SELECT jsonb_agg(channel ORDER BY channel) FROM (SELECT DISTINCT channel FROM enriched WHERE channel IS NOT NULL AND channel<>'') c),'[]'::jsonb) AS channels FROM counts`,
 [connectionId,view,(page-1)*25,filters.search||'',filters.channel||'',filters.from||null,filters.to||null,filters.dateType||'received']);
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
