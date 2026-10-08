import {sql} from 'drizzle-orm';
import {db} from './db';

export async function getDeferredDespegarReservationIds(reservationIds:string[]) {
 if(!reservationIds.length)return new Set<string>();
 const result=await db.execute(sql`
      SELECT DISTINCT r.id FROM reservations r
      LEFT JOIN agencies a ON a.id=r.agency_id
      WHERE r.id IN (${sql.join(reservationIds.map(id=>sql`${id}`), sql`, `)})
      AND (r.source='despegar' OR
        regexp_replace(upper(coalesce(a.razon_social,'')), '[^A-Z0-9]', '', 'g') IN ('DESPEGAR','DESPEGARSA','DESPEGARCOMAR','DESPEGARCOMARSA') OR
        regexp_replace(upper(coalesce(a.nombre_fantasia,'')), '[^A-Z0-9]', '', 'g') IN ('DESPEGAR','DESPEGARSA','DESPEGARCOMAR','DESPEGARCOMARSA'))
      AND EXISTS(SELECT 1 FROM sales_invoices si WHERE si.reserva_id=r.id
        AND si.estado='emitida' AND si.tipo_comprobante IN ('FA','FB','FC','FT')
        AND si.monto_total=0 AND si.cash_forma_pago='cuenta_corriente')
      AND NOT EXISTS(SELECT 1 FROM sales_invoices si WHERE si.reserva_id=r.id
        AND si.estado='emitida' AND si.tipo_comprobante IN ('FA','FB','FC','FT') AND si.monto_total>0)
    `);
 return new Set(result.rows.map(row=>String(row.id)));
}
