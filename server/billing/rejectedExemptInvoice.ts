import type { Pool } from 'pg';

const conflict = (message: string) => Object.assign(new Error(message), { statusCode: 409 });

// Only the old, specifically rejected A/Exento combination is correctable here.
// The caller provides a read-only ARCA lookup; this function never authorizes a voucher.
export async function discardRejectedExemptInvoice(pool: Pool, reservationId: string, operationId: string,
  actor: { id?: string; name?: string; ip?: string }, identity: { environment: string; issuer: string },
  lookup: (invoice: any) => Promise<unknown>) {
  const c = await pool.connect();
  let reservationLocked = false, seriesKey = '';
  try {
    await c.query('SELECT pg_advisory_lock(hashtext($1))', [`folio-invoice:${reservationId}`]);
    reservationLocked = true;
    const find = () => c.query(`SELECT * FROM sales_invoices WHERE reserva_id=$1 AND credit_reapplication_intent->>'operationId'=$2 ORDER BY id DESC LIMIT 1`, [reservationId, operationId]);
    let invoice = (await find()).rows[0];
    if (!invoice) {
      // A lost response must be safely replayable using the committed audit proof.
      const audits = (await c.query(`SELECT details FROM audit_logs WHERE entity_type='rejected_invoice_draft' AND details LIKE $1 ORDER BY timestamp DESC LIMIT 20`, [`%${operationId}%`])).rows;
      for (const row of audits) {
        try {
          const proof = typeof row.details === 'string' ? JSON.parse(row.details) : row.details;
          if (proof?.operationId === operationId && proof?.before?.reserva_id === reservationId && proof?.arcaNotAuthorized === true)
            return { discarded: true, correctedCompanyId: proof.companyBefore?.id || null };
        } catch {}
      }
      throw conflict('No se encontró el intento pendiente. Actualizá el folio.');
    }
    seriesKey = `funding-fiscal:${identity.environment}:${identity.issuer}:${invoice.tipo_comprobante}:${invoice.punto_venta}`;
    await c.query('SELECT pg_advisory_lock(hashtextextended($1,0))', [seriesKey]);
    await c.query('BEGIN');
    invoice = (await c.query(`SELECT * FROM sales_invoices WHERE id=$1 FOR UPDATE`, [invoice.id])).rows[0];
    const intent = invoice?.credit_reapplication_intent;
    if (!invoice || invoice.estado !== 'autorizacion_pendiente' || invoice.cae || invoice.modo_ficticio ||
        !['FA','FM'].includes(invoice.tipo_comprobante) || String(invoice.cliente_condicion_iva).trim().toLowerCase() !== 'exento' ||
        !/\b10243\b/.test(invoice.reconciliation_error || '') || !['produccion','homologacion'].includes(identity.environment) ||
        !intent || !Array.isArray(intent.payments) || intent.payments.length || (intent.ordinaryAdvances?.length || 0) || intent.checkoutDiscount ||
        invoice.payment_id || invoice.group_id || invoice.spa_account_id || invoice.restaurant_order_id || intent.status !== 'pending' || intent.settlement?.status !== 'pending' || !['cash','none'].includes(intent.settlement?.destination)) {
      throw conflict('Este intento no puede descartarse automáticamente; requiere conciliación fiscal.');
    }
    const linked = await c.query(`SELECT 1 FROM payments WHERE reservation_id=$1 AND status<>'anulado'
      UNION ALL SELECT 1 FROM sales_invoices WHERE nota_credito_id=$2::integer
      UNION ALL SELECT 1 FROM cash_movements WHERE source_type='comprobante' AND source_id=$2::text
      UNION ALL SELECT 1 FROM folio_movements WHERE source_type IN ('invoice','comprobante') AND source_id=$2::text LIMIT 1`, [reservationId, invoice.id]);
    if (linked.rowCount) throw conflict('Hay pagos o movimientos vinculados. Conservamos el intento para conciliación.');
    if (await lookup(invoice) !== null) throw conflict('ARCA informa un comprobante autorizado. No se descarta ni se vuelve a emitir.');
    const companies = (await c.query(`SELECT id,condicion_iva FROM companies WHERE regexp_replace(cuil_cuit,'[^0-9]','','g')=$1 FOR UPDATE`, [String(invoice.cliente_cuit).replace(/\D/g,'')])).rows;
    if (companies.length > 1) throw conflict('Hay varias fichas con el mismo CUIT; revisá cuál corresponde antes de corregir.');
    if (companies.length === 1) await c.query(`UPDATE companies SET condicion_iva='exento' WHERE id=$1`, [companies[0].id]);
    await c.query(`INSERT INTO audit_logs(user_id,user_name,action,module,entity_type,entity_id,description,details,ip_address,timestamp)
      VALUES($1,$2,'delete','billing','rejected_invoice_draft',$3,$4,$5,$6,now())`,
      [actor.id || null, actor.name || 'Sistema', String(invoice.id), 'Corrección IVA Exento: borrador A rechazado 10243, no autorizado según consulta ARCA; preparar B sin emitir ni cobrar',
       JSON.stringify({ before: invoice, companyBefore: companies[0] || null, companyVatAfter: companies.length ? 'exento' : null, arcaNotAuthorized: true, operationId }), actor.ip || null]);
    await c.query(`DELETE FROM sales_invoices WHERE id=$1`, [invoice.id]);
    await c.query('COMMIT');
    return { discarded: true, correctedCompanyId: companies[0]?.id || null };
  } catch (error) { await c.query('ROLLBACK').catch(() => {}); throw error; }
  finally {
    if (seriesKey) await c.query('SELECT pg_advisory_unlock(hashtextextended($1,0))', [seriesKey]).catch(() => {});
    if (reservationLocked) await c.query('SELECT pg_advisory_unlock(hashtext($1))', [`folio-invoice:${reservationId}`]).catch(() => {});
    c.release();
  }
}
