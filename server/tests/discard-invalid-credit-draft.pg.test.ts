import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { discardInvalidCreditDraft } from '../billing/discardInvalidCreditDraft';
const suite = process.env.DATABASE_URL ? describe : describe.skip;
const schema = `discard_nc_${randomUUID().replaceAll('-','')}`;
const admin = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, options: `-c search_path=${schema},public` });
const identity = { environment: 'homologacion', issuer: '30717698130' };
const fiscal = { ...identity, type: 'NCB', pointOfSale: 9901, operationId: 'discard-nc-test' };
const tables = ['sales_invoices','billing_operations','audit_logs','payments','cash_movements','folio_movements','charges','account_movements'];
async function discard(lookup = vi.fn().mockResolvedValue(null)) { return discardInvalidCreditDraft(pool, 12, 'reservation-test', null, identity, lookup); }
suite('Descarte de NC no autorizada sobre voucher: PostgreSQL aislado', () => {
  beforeAll(async () => {
    await admin.query(`CREATE SCHEMA ${schema}`);
    for (const table of tables) await admin.query(`CREATE TABLE ${schema}.${table} (LIKE public.${table} INCLUDING DEFAULTS)`);
  });
  beforeEach(async () => {
    for (const table of tables) await pool.query(`TRUNCATE ${table}`);
    await pool.query(`INSERT INTO sales_invoices(id,tipo_comprobante,punto_venta,numero,fecha_emision,cliente_razon_social,cliente_condicion_iva,monto_neto,monto_total,reserva_id,modo_ficticio,estado,monto_acreditado)
      VALUES(7,'cierre_habitacion',9901,14,'2026-11-06','Prueba','Consumidor Final',0,184000,'reservation-test',false,'emitida',0)`);
    await pool.query(`INSERT INTO sales_invoices(id,tipo_comprobante,punto_venta,numero,fecha_emision,cliente_razon_social,cliente_condicion_iva,monto_neto,monto_total,reserva_id,modo_ficticio,estado,reconciliation_status,nota_credito_id,fiscal_identity)
      VALUES(12,'NCB',9901,3,'2026-11-06','Prueba','Consumidor Final',0,184000,'reservation-test',false,'autorizacion_pendiente','pendiente',7,$1::jsonb)`, [JSON.stringify(fiscal)]);
    await pool.query(`INSERT INTO billing_operations(operation_id,owner_type,owner_id,payload_hash,request_snapshot,fiscal_identity,stage,invoice_id)
      VALUES('discard-nc-test','reservation','reservation-test','hash','{}',$1::jsonb,'uncertain',12)`, [JSON.stringify(fiscal)]);
  });
  afterAll(async () => { await pool.end(); await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`); await admin.end(); });
  it('solo elimina tras un null explícito; audita, retira el journal y permite repetir sin consultar ni aplicar dinero', async () => {
    const lookup = vi.fn().mockResolvedValue(null);
    expect(await discard(lookup)).toEqual({ discarded: true, alreadyDiscarded: false });
    expect(lookup).toHaveBeenCalledOnce();
    expect((await pool.query('SELECT id FROM sales_invoices ORDER BY id')).rows).toEqual([{ id: 7 }]);
    expect((await pool.query('SELECT stage,invoice_id,error_code,request_snapshot FROM billing_operations')).rows[0]).toMatchObject({ stage: 'corrected', invoice_id: null, error_code: 'BILLING_INVALID_CREDIT_DRAFT_DISCARDED', request_snapshot: { discardedDraft: { id: 12 } } });
    const audit = (await pool.query("SELECT details FROM audit_logs WHERE entity_type='discarded_invalid_credit_draft'")).rows[0];
    expect(JSON.parse(audit.details)).toMatchObject({ arcaNotAuthorized: true, before: { id: 12 }, originalId: 7 });
    expect(await discard(lookup)).toEqual({ discarded: true, alreadyDiscarded: true });
    expect(lookup).toHaveBeenCalledOnce();
    for (const table of ['payments','cash_movements','folio_movements','charges','account_movements']) expect((await pool.query(`SELECT * FROM ${table}`)).rows).toEqual([]);
    expect((await pool.query('SELECT monto_acreditado FROM sales_invoices WHERE id=7')).rows[0].monto_acreditado).toBe('0.00');
  });
  it.each([undefined, false, {}, { cae: '12345678901234' }])('una consulta que no devuelve null conserva el registro (%s)', async result => {
    await expect(discard(vi.fn().mockResolvedValue(result))).rejects.toThrow('autorización');
    expect((await pool.query('SELECT id FROM sales_invoices WHERE id=12')).rows).toHaveLength(1);
    expect((await pool.query('SELECT * FROM audit_logs')).rows).toHaveLength(0);
  });
  it('timeout/HTTP 500 de ARCA conserva borrador y journal', async () => {
    await expect(discard(vi.fn().mockRejectedValue(new Error('HTTP 500')))).rejects.toThrow('HTTP 500');
    expect((await pool.query('SELECT stage FROM billing_operations')).rows[0].stage).toBe('uncertain');
    expect((await pool.query('SELECT id FROM sales_invoices WHERE id=12')).rows).toHaveLength(1);
  });
  it.each([
    "UPDATE sales_invoices SET cae='12345678901234' WHERE id=12",
    "UPDATE sales_invoices SET estado='emitida' WHERE id=12",
    "UPDATE sales_invoices SET tipo_comprobante='FB' WHERE id=7",
    "UPDATE sales_invoices SET tipo_comprobante='desconocido' WHERE id=7",
    "UPDATE sales_invoices SET monto_acreditado=1 WHERE id=7",
    "UPDATE sales_invoices SET fiscal_identity=jsonb_set(fiscal_identity,'{environment}','\"produccion\"') WHERE id=12",
    "UPDATE billing_operations SET stage='authorized'",
    "UPDATE billing_operations SET owner_id='otra-reserva'",
  ])('bloquea condiciones inseguras antes de consultar: %s', async query => {
    await pool.query(query); const lookup = vi.fn().mockResolvedValue(null);
    await expect(discard(lookup)).rejects.toThrow(); expect(lookup).not.toHaveBeenCalled();
    expect((await pool.query('SELECT id FROM sales_invoices WHERE id=12')).rows).toHaveLength(1);
  });
  it('un cargo aplicado por esta NC impide borrarla', async () => {
    await pool.query("INSERT INTO charges(id,reservation_id,description,amount,date) VALUES('charge-test','reservation-test','Ajuste [nc:12:accommodation]',-184000,'2026-11-06')");
    const lookup=vi.fn().mockResolvedValue(null); await expect(discard(lookup)).rejects.toThrow('movimientos'); expect(lookup).not.toHaveBeenCalled();
  });
  it('un pago con referencia JSON a la NC impide borrarla', async () => {
    await pool.query(`INSERT INTO payments(id,reservation_id,amount,method,date,invoice_ref) VALUES('payment-test','reservation-test',184000,'efectivo','2026-11-06','{"id" : "12"}')`);
    const lookup=vi.fn().mockResolvedValue(null);await expect(discard(lookup)).rejects.toThrow('movimientos');expect(lookup).not.toHaveBeenCalled();
  });
  it('un fallo de auditoría revierte todo el descarte', async () => {
    await pool.query("ALTER TABLE audit_logs ADD CONSTRAINT force_audit_failure CHECK(description='imposible')");
    try { await expect(discard()).rejects.toThrow(); expect((await pool.query('SELECT id FROM sales_invoices WHERE id=12')).rows).toHaveLength(1); }
    finally { await pool.query('ALTER TABLE audit_logs DROP CONSTRAINT force_audit_failure'); }
  });
});
