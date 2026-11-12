import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "@shared/schema";
import { pool } from "../db";
import { hasPermission } from "../permissions";
import { getBillingConfig } from "./billingConfig";
import { centerRejectedInvoiceRequest } from "./centerInvoiceRecovery";
import { resolveFiscalRecipientDocument } from "./fiscalDocument";

const fail = (message: string, statusCode = 409) => Object.assign(new Error(message), { statusCode });
const marker = "ARCA_REJECTED_CENTER_CORRECTED";

/** An explicit correction closes only an unissued, unposted draft after a
 * read-only ARCA lookup. It never requests a CAE or advances a counter. */
export async function correctRejectedCenterInvoice(id: number, actor: { id?: string; name?: string; role: string; ip?: string }) {
  const client = await pool.connect();
  let locked = false, seriesKey = "";
  try {
    let invoice = (await client.query("SELECT * FROM sales_invoices WHERE id=$1", [id])).rows[0];
    let operation;
    if (invoice) {
      operation = (await client.query("SELECT * FROM billing_operations WHERE operation_id=$1 AND invoice_id=$2", [invoice.fiscal_identity?.operationId || "", id])).rows[0];
    } else {
      operation = (await client.query("SELECT * FROM billing_operations WHERE stage='corrected' AND error_code=$1 AND request_snapshot->'discardedDraft'->>'id'=$2 LIMIT 1", [marker, String(id)])).rows[0];
      invoice = operation?.request_snapshot?.discardedDraft;
    }
    if (!invoice) throw fail("No se encontró un intento rechazado verificable.", 404);
    const area = invoice.center_settlement_area;
    if (!["recepcion", "restaurant", "spa"].includes(area) || !hasPermission(actor.role, `api:emitir-comprobante:${area}`)) throw fail("No autorizado para corregir comprobantes de esta área", 403);
    if (operation?.stage === "corrected" && operation.error_code === marker) {
      centerRejectedInvoiceRequest(invoice, { ...operation, invoice_id:id, stage:"rejected", error_code:"ARCA_AUTHORIZATION_REJECTED" });
      return { corrected:true, invoiceId:id };
    }
    centerRejectedInvoiceRequest(invoice, operation);
    const identity = operation.fiscal_identity;
    seriesKey = `funding-fiscal:${identity.environment}:${identity.issuer}:${identity.type}:${identity.pointOfSale}`;
    locked = (await client.query("SELECT pg_try_advisory_lock(hashtextextended($1,0)) AS locked", [seriesKey])).rows[0]?.locked === true;
    if (!locked) throw fail("La serie fiscal está ocupada. Volvé a verificar en unos segundos.");
    await client.query("BEGIN");
    invoice = (await client.query("SELECT * FROM sales_invoices WHERE id=$1 FOR UPDATE", [id])).rows[0];
    operation = (await client.query("SELECT * FROM billing_operations WHERE operation_id=$1 FOR UPDATE", [operation.operation_id])).rows[0];
    centerRejectedInvoiceRequest(invoice, operation);
    const database = drizzle(client, { schema });
    const config = await getBillingConfig(database);
    if (config.arcaAmbiente !== identity.environment || String(config.arcaCuit || config.cuit).replace(/\D/g, "") !== identity.issuer) throw fail("La revisión debe usar el ambiente y emisor del intento original.");

    const label = `${invoice.tipo_comprobante}-${String(invoice.punto_venta).padStart(4,"0")}-${String(invoice.numero).padStart(8,"0")}`;
    const legacy = `${invoice.tipo_comprobante}-${String(invoice.numero).padStart(8,"0")}`;
    const assertNoLinks = async () => {
      const linked = await client.query(`SELECT 1 FROM cash_movements WHERE source_type='comprobante' AND source_id=$1::text
        UNION ALL SELECT 1 FROM folio_movements WHERE source_type IN('invoice','comprobante') AND source_id=$1::text
        UNION ALL SELECT 1 FROM sales_invoices WHERE nota_credito_id=$1::integer
        UNION ALL SELECT 1 FROM group_payments WHERE invoice_id=$1::integer
        UNION ALL SELECT 1 FROM group_invoices WHERE sales_invoice_id=$1::integer
        UNION ALL SELECT 1 FROM spa_treatment_sales WHERE sales_invoice_id=$1::integer
        UNION ALL SELECT 1 FROM account_movements WHERE reference IN($2,$3,$4,$5)
        LIMIT 1`, [String(id), label, legacy, label.replace("-", " "), `invoice:${id}:${invoice.tipo_comprobante}:${invoice.punto_venta}:${invoice.numero}`]);
      const paymentRefs = await client.query("SELECT invoice_ref FROM payments WHERE invoice_ref LIKE $1", [`%${id}%`]);
      const linkedPayment = paymentRefs.rows.some(row => {
        try { return Number(JSON.parse(row.invoice_ref)?.id) === id; } catch { return true; }
      });
      if (linked.rows.length || linkedPayment) throw fail("Hay movimientos o documentos vinculados. El intento se conserva para conciliación.");
    };
    await assertNoLinks();

    const { getTokenAuth } = await import("./wsaaClient");
    const { feCompConsultar } = await import("./wsfevClient");
    const { token, sign } = await getTokenAuth(config.arcaCert!, config.arcaKey!, identity.environment, database);
    const document = resolveFiscalRecipientDocument({ cuit:invoice.cliente_cuit, dni:invoice.cliente_dni, documentType:invoice.cliente_document_type });
    const authorized = await feCompConsultar({ tipo:identity.type, puntoVenta:identity.pointOfSale, numero:Number(invoice.numero), cuitEmisor:identity.issuer, token, sign }, identity.environment,
      { total:Number(invoice.monto_total), fecha:String(invoice.fecha_emision).replaceAll("-", ""), docTipo:document.tipo, docNro:document.numero });
    if (authorized !== null) throw fail("ARCA confirma una autorización existente. El comprobante se conserva para recuperar su CAE; no se cierra el intento.");
    await assertNoLinks();
    await client.query("UPDATE billing_operations SET request_snapshot=jsonb_set(request_snapshot,'{discardedDraft}',$2::jsonb),invoice_id=NULL,stage='corrected',error_code=$3,updated_at=now() WHERE operation_id=$1", [operation.operation_id, JSON.stringify(invoice), marker]);
    await client.query("INSERT INTO audit_logs(user_id,user_name,action,module,entity_type,entity_id,description,details,ip_address,timestamp) VALUES($1,$2,'update','billing','billing_operation',$3,$4,$5,$6,now())", [actor.id || null, actor.name || null, operation.operation_id,
      "Intento del Centro rechazado y no autorizado según consulta ARCA; cerrado sin emisión ni registro económico",
      JSON.stringify({ invoiceId:id, original:invoice, operationId:operation.operation_id, arcaNotAuthorized:true, requestHash:operation.payload_hash }), actor.ip || null]);
    const deleted = await client.query("DELETE FROM sales_invoices WHERE id=$1 AND estado='autorizacion_pendiente' AND cae IS NULL RETURNING id", [id]);
    if (deleted.rows.length !== 1) throw fail("El comprobante cambió. Se conserva el intento.");
    await client.query("COMMIT");
    return { corrected:true, invoiceId:id };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    try { if (locked) await client.query("SELECT pg_advisory_unlock(hashtextextended($1,0))", [seriesKey]); client.release(); }
    catch (error) { client.release(error as Error); }
  }
}
