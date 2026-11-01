import pg from 'pg';
import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { discardRejectedExemptInvoice } from '../billing/rejectedExemptInvoice';
const url = process.env.REJECTED_EXEMPT_TEST_DATABASE_URL;
if (url && new URL(url).pathname !== '/reservation_cancel_test') throw Error('Only disposable reservation_cancel_test allowed');
const suite = url ? describe : describe.skip;
const pool = url ? new pg.Pool({ connectionString: url }) : null;
suite('Rejected A/Exento correction with read-only ARCA lookup', () => {
  afterAll(async () => { await pool?.end(); });
  async function fixture(run: (f: any) => Promise<void>) {
    const reservationId = randomUUID(), operationId = randomUUID(), companyId = randomUUID();
    const cuit = String(30000000000 + Math.floor(Math.random() * 999999999));
    await pool!.query("INSERT INTO companies(id,razon_social,cuil_cuit,condicion_iva) VALUES($1,'Institución prueba',$2,'consumidor_final')", [companyId, cuit]);
    const invoice = (await pool!.query(`INSERT INTO sales_invoices(tipo_comprobante,punto_venta,numero,fecha_emision,cliente_razon_social,cliente_cuit,cliente_condicion_iva,monto_total,monto_neto,estado,cae,modo_ficticio,reserva_id,items,credit_reapplication_intent,reconciliation_error,created_at)
      VALUES('FA',9991,$1,CURRENT_DATE,'Institución prueba',$2,'Exento','531600','439338.84','autorizacion_pendiente',NULL,false,$3,'[]',$4,'ARCA rechazó 10243: condición IVA no válida',now()) RETURNING *`,
      [Math.floor(Math.random() * 100000000), cuit, reservationId, JSON.stringify({ operationId, payments: [], ordinaryAdvances: [], status: 'pending', settlement: { status: 'pending', destination: 'cash' } })])).rows[0];
    try { await run({ reservationId, operationId, companyId, invoice }); }
    finally {
      await pool!.query('DELETE FROM audit_logs WHERE entity_id=$1', [String(invoice.id)]);
      await pool!.query('DELETE FROM payments WHERE reservation_id=$1', [reservationId]);
      await pool!.query('DELETE FROM sales_invoices WHERE id=$1', [invoice.id]);
      await pool!.query('DELETE FROM companies WHERE id=$1', [companyId]);
    }
  }
  const correct = (f: any, lookup: any) => discardRejectedExemptInvoice(pool!, f.reservationId, f.operationId, { id: 'test', name: 'Recepción' }, { environment: 'produccion', issuer: '30111111118' }, lookup);
  it.each(['cash','none'])('requires ARCA not-found and preserves audit for %s settlement', async destination => fixture(async f => {
    await pool!.query(`UPDATE sales_invoices SET credit_reapplication_intent=jsonb_set(credit_reapplication_intent,'{settlement,destination}',to_jsonb($2::text)) WHERE id=$1`,[f.invoice.id,destination]);
    const lookup = vi.fn(async () => null);
    expect(await correct(f, lookup)).toMatchObject({ discarded: true, correctedCompanyId: f.companyId });
    expect(await correct(f, lookup)).toMatchObject({ discarded: true, correctedCompanyId: f.companyId });
    expect(lookup).toHaveBeenCalledTimes(1);
    expect((await pool!.query('SELECT id FROM sales_invoices WHERE id=$1', [f.invoice.id])).rows).toHaveLength(0);
    expect((await pool!.query('SELECT condicion_iva FROM companies WHERE id=$1', [f.companyId])).rows[0].condicion_iva).toBe('exento');
    const audit = (await pool!.query('SELECT details FROM audit_logs WHERE entity_id=$1', [String(f.invoice.id)])).rows;
    expect(audit).toHaveLength(1);
    expect(JSON.parse(audit[0].details)).toMatchObject({ arcaNotAuthorized: true, before: { id: f.invoice.id }, companyBefore: { condicion_iva: 'consumidor_final' } });
    expect((await pool!.query('SELECT id FROM payments WHERE reservation_id=$1', [f.reservationId])).rows).toHaveLength(0);
  }));
  it('rolls back the company and draft if its audit cannot be saved', async () => fixture(async f => {
    const fn='exempt_audit_'+randomUUID().replaceAll('-','');
    await pool!.query(`CREATE FUNCTION ${fn}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.entity_id='${f.invoice.id}' THEN RAISE EXCEPTION 'audit unavailable'; END IF; RETURN NEW; END $$`);
    await pool!.query(`CREATE TRIGGER ${fn} BEFORE INSERT ON audit_logs FOR EACH ROW EXECUTE FUNCTION ${fn}()`);
    try {
      await expect(correct(f,vi.fn(async()=>null))).rejects.toThrow('audit unavailable');
      expect((await pool!.query('SELECT id FROM sales_invoices WHERE id=$1',[f.invoice.id])).rows).toHaveLength(1);
      expect((await pool!.query('SELECT condicion_iva FROM companies WHERE id=$1',[f.companyId])).rows[0].condicion_iva).toBe('consumidor_final');
    } finally { await pool!.query(`DROP TRIGGER ${fn} ON audit_logs`); await pool!.query(`DROP FUNCTION ${fn}()`); }
  }));
  it('serializes two corrections and keeps one audited outcome', async () => fixture(async f => {
    const lookup=vi.fn(async()=>null);
    const results=await Promise.allSettled([correct(f,lookup),correct(f,lookup)]);
    expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(2);
    expect(lookup).toHaveBeenCalledTimes(1);
    expect((await pool!.query('SELECT id FROM audit_logs WHERE entity_id=$1',[String(f.invoice.id)])).rows).toHaveLength(1);
  }));
  it.each(['authorized', 'network', 'unknown'])('preserves the draft and company on %s lookup', async result => fixture(async f => {
    const lookup = vi.fn(async () => { if (result === 'network') throw Error('Timeout'); return result === 'authorized' ? { cae: '12345678901234' } : undefined; });
    await expect(correct(f, lookup)).rejects.toThrow();
    expect((await pool!.query('SELECT estado FROM sales_invoices WHERE id=$1', [f.invoice.id])).rows[0].estado).toBe('autorizacion_pendiente');
    expect((await pool!.query('SELECT condicion_iva FROM companies WHERE id=$1', [f.companyId])).rows[0].condicion_iva).toBe('consumidor_final');
  }));
  it.each(['other_error', 'has_cae', 'credit', 'payment'])('refuses unsafe %s before contacting ARCA', async unsafe => fixture(async f => {
    if (unsafe === 'other_error') await pool!.query("UPDATE sales_invoices SET reconciliation_error='502 timeout' WHERE id=$1", [f.invoice.id]);
    if (unsafe === 'has_cae') await pool!.query("UPDATE sales_invoices SET cae='12345678901234' WHERE id=$1", [f.invoice.id]);
    if (unsafe === 'credit') await pool!.query(`UPDATE sales_invoices SET credit_reapplication_intent=jsonb_set(credit_reapplication_intent,'{payments}','[{"paymentId":"advance","amount":1}]') WHERE id=$1`, [f.invoice.id]);
    if (unsafe === 'payment') await pool!.query("INSERT INTO payments(id,reservation_id,amount,method,date) VALUES($1,$2,1,'efectivo',CURRENT_DATE)", [randomUUID(), f.reservationId]);
    const lookup = vi.fn(async () => null);
    await expect(correct(f, lookup)).rejects.toThrow(); expect(lookup).not.toHaveBeenCalled();
    expect((await pool!.query('SELECT id FROM sales_invoices WHERE id=$1', [f.invoice.id])).rows).toHaveLength(1);
  }));
});
