import {sql} from "drizzle-orm";

/** Same persisted facts used by the locked payment validation. */
export function groupPersonalExtrasFactsQuery(reservationId:string){
  return sql`
            WITH linked AS (
              SELECT l.group_id, r.id AS reservation_id
              FROM group_reservation_links l
              JOIN reservations r ON r.id = l.reservation_id
              WHERE r.id = ${reservationId}
            ),
            eligible_room_payments AS (
              SELECT linked.group_id, p.amount::numeric AS amount, p.notes
              FROM linked JOIN payments p ON p.reservation_id=linked.reservation_id
              LEFT JOIN group_payments gp ON gp.id=p.group_payment_id AND gp.group_id=linked.group_id
              WHERE COALESCE(p.status,'active') <> 'anulado'
                AND (p.group_payment_id IS NULL OR (gp.id IS NOT NULL
                  AND gp.destination IS DISTINCT FROM 'master_folio'
                  AND gp.distribution IS DISTINCT FROM 'master_folio'))
            ), facts AS (
              SELECT linked.group_id,
                COALESCE((SELECT master_folio_config FROM groups WHERE id = linked.group_id), 'accommodation') AS config,
                COALESCE((SELECT SUM(c.amount::numeric)
                  FROM charges c
                  WHERE c.reservation_id = linked.reservation_id
                    AND c.status <> 'anulado'
                    AND (
                      c.amount::numeric < 0
                      OR COALESCE(c.category, '') NOT IN (
                        'room', 'payment', 'adjustment', 'transfer_in', 'transfer_out'
                      )
                    )), 0) AS extras,
                COALESCE((SELECT SUM(p.amount) FROM eligible_room_payments p WHERE p.group_id=linked.group_id),0) AS direct_paid,
                COALESCE((SELECT SUM(p.amount) FROM eligible_room_payments p WHERE p.group_id=linked.group_id AND p.notes LIKE '%[personal_extras]%'),0) AS personal_paid,
                COALESCE((SELECT r.total_room_amount::numeric FROM reservations r WHERE r.id=linked.reservation_id),0) AS room_lodging,
                COALESCE((SELECT SUM(gp.amount::numeric)
                  FROM group_payments gp
                  WHERE gp.group_id = linked.group_id
                    AND (gp.destination = 'master_folio' OR gp.distribution = 'master_folio')), 0) AS group_funds,
                COALESCE((SELECT SUM(r2.total_room_amount::numeric)
                  FROM group_reservation_links l2
                  JOIN reservations r2 ON r2.id = l2.reservation_id
                  WHERE l2.group_id = linked.group_id
                    AND r2.status <> 'cancelled'), 0) AS group_lodging
              FROM linked
            )
            SELECT config, extras, direct_paid, personal_paid, room_lodging, group_funds, group_lodging FROM facts
          `;
}
