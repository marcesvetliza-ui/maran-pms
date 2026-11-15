import {sql} from 'drizzle-orm';

/** The fiscal point can be shared in homologation. Prefer durable Restaurant
 * ownership, including an NC's original invoice; use its POS only for legacy
 * documents without any owner or cash provenance. Aliases: si and orig. */
export const restaurantInvoiceScope = sql`
  si.reserva_id IS NULL AND si.group_id IS NULL AND si.spa_account_id IS NULL
  AND orig.reserva_id IS NULL AND orig.group_id IS NULL AND orig.spa_account_id IS NULL
  AND COALESCE(si.center_settlement_area,'restaurant')='restaurant'
  AND COALESCE(orig.center_settlement_area,'restaurant')='restaurant'
  AND (
    EXISTS (SELECT 1 FROM restaurant_orders ro WHERE ro.id=si.restaurant_order_id OR ro.id=orig.restaurant_order_id)
    OR si.center_settlement_area='restaurant' OR orig.center_settlement_area='restaurant'
    OR (
      EXISTS (SELECT 1 FROM cash_movements cm WHERE cm.source_type='comprobante' AND cm.source_id IN (si.id::text,orig.id::text) AND cm.area='restaurant')
      AND NOT EXISTS (SELECT 1 FROM cash_movements cm WHERE cm.source_type='comprobante' AND cm.source_id IN (si.id::text,orig.id::text) AND cm.area<>'restaurant')
    )
    OR (
      si.restaurant_order_id IS NULL AND orig.restaurant_order_id IS NULL
      AND si.center_settlement_area IS NULL AND orig.center_settlement_area IS NULL
      AND si.folio_id IS NULL AND orig.folio_id IS NULL
      AND NOT EXISTS (SELECT 1 FROM cash_movements cm WHERE cm.source_type='comprobante' AND cm.source_id IN (si.id::text,orig.id::text))
      AND COALESCE(orig.punto_venta,si.punto_venta) IN (SELECT numero FROM pos_configs WHERE area='restaurant' AND activo=true)
    )
  )`;
