import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { drizzle } from "drizzle-orm/node-postgres";
import { sql } from "drizzle-orm";
import { enrichAccountMovementInvoices } from "../accountMovementInvoices";
const enabled = !!process.env.DATABASE_URL;
if (enabled) {
  const url = new URL(process.env.DATABASE_URL!);
  if (!["localhost", "127.0.0.1"].includes(url.hostname) || !url.pathname.includes("test")) throw Error("Invoice reference tests require a local disposable database.");
}
let pool: typeof import('../db').pool;
describe.skipIf(!enabled)("Referencias de comprobantes en cuenta corriente (solo lectura)", () => {
  beforeAll(async () => { ({ pool } = await import('../db')); });
  afterAll(async () => { await pool?.end(); });
  async function fixture(run: (f: any) => Promise<void>) {
    const client = await pool.connect();
    await client.query('BEGIN');
    try {
      const database = drizzle(client), entity = randomUUID(), otherEntity = randomUUID(), reservation = randomUUID();
      const invoices: any[] = [], movements: any[] = [];
      async function invoice(overrides: any = {}) {
        const input = { type: 'FA', point: 9931, number: invoices.length + 1, status: 'emitida', operation: randomUUID(), entity, payment: null, group: null, ...overrides };
        const result = await client.query(`INSERT INTO sales_invoices(tipo_comprobante,punto_venta,numero,fecha_emision,cliente_razon_social,cliente_condicion_iva,monto_neto,monto_total,estado,reserva_id,recipient_entity_type,recipient_entity_id,credit_reapplication_intent,payment_id,group_payment_id)
          VALUES($1,$2,$3,'2026-11-26','Empresa sintética','IVA Responsable Inscripto',294000,294000,$4,$5,'company',$6,$7,$8,$9) RETURNING *`,
          [input.type, input.point, input.number, input.status, reservation, input.entity, JSON.stringify({ operationId: input.operation }), input.payment, input.group]);
        const row = { ...result.rows[0], operation: input.operation }; invoices.push(row); return row;
      }
      async function movement(reference: string, extra: any = {}) {
        const id = randomUUID();
        await client.query(`INSERT INTO account_movements(id,entity_type,entity_id,date,type,description,amount,reservation_id,reference,payment_id,group_payment_id)
          VALUES($1,'company',$2,'2026-11-26','cargo','Anticipo FA — Empresa',294000,$3,$4,$5,$6)`, [id, entity, reservation, reference, extra.paymentId || null, extra.groupPaymentId || null]);
        const row = { id, reference, amount: '294000.00', saldoPendiente: 294000, ...extra }; movements.push(row); return row;
      }
      await run({ database, client, entity, otherEntity, reservation, invoice, movement, invoices, movements });
    } finally { await client.query('ROLLBACK'); client.release(); }
  }
  it("resuelve cada operación exacta sin confundir dos anticipos iguales ni alterar registros o saldos", async () => fixture(async f => {
    const a = await f.invoice(), b = await f.invoice();
    const ma = await f.movement(`credit-operation:${a.operation}`), mb = await f.movement(`credit-operation:${b.operation}`);
    const orphan = await f.movement(`credit-operation:${randomUUID()}`);
    const stored = async () => (await f.client.query('SELECT * FROM account_movements WHERE id=ANY($1::varchar[]) ORDER BY id', [f.movements.map((m: any) => m.id)])).rows;
    const before = await stored(), input = structuredClone(f.movements);
    const execute = vi.fn((query: any) => f.database.execute(query));
    const result = await enrichAccountMovementInvoices({ execute }, f.movements);
    expect(execute).toHaveBeenCalledTimes(2);
    expect(result.find(m => m.id === ma.id)?.invoiceDisplay).toEqual({ id: a.id, type: 'FA', pointOfSale: 9931, number: a.numero, status: 'emitida' });
    expect(result.find(m => m.id === mb.id)?.invoiceDisplay?.id).toBe(b.id);
    expect(result.find(m => m.id === orphan.id)?.invoiceDisplay).toBeUndefined();
    expect(f.movements).toEqual(input); expect(await stored()).toEqual(before);
    expect(result.reduce((sum, m) => sum + Number(m.amount), 0)).toBe(882000);
  }));
  it("no confunde facturas de otra entidad con una referencia textual y conserva comprobantes manuales", async () => fixture(async f => {
    const own = await f.invoice(), foreign = await f.invoice({ entity: f.otherEntity });
    const a = await f.movement(`FA-09931-${String(own.numero).padStart(8, '0')}`);
    const b = await f.movement(`FA-9931-${String(foreign.numero).padStart(8, '0')}`);
    const manual = await f.movement('FA-0005-00001234');
    const result = await enrichAccountMovementInvoices(f.database, f.movements);
    expect(result.find(m => m.id === a.id)?.invoiceDisplay?.id).toBe(own.id);
    expect(result.find(m => m.id === b.id)?.invoiceDisplay).toBeUndefined();
    expect(result.find(m => m.id === manual.id)).toEqual(manual);
  }));
  it("excluye pendientes y archivados, señala anuladas y no elige entre vínculos contradictorios", async () => fixture(async f => {
    const pending = await f.invoice({ status: 'pendiente' }), archived = await f.invoice(), voided = await f.invoice({ status: 'anulada' });
    const a = await f.invoice(), b = await f.invoice({ operation: a.operation });
    await f.database.execute(sql`INSERT INTO sales_control_archive(kind,record_id,batch_id) VALUES('invoice',${String(archived.id)},'synthetic-ref-test')`);
    for (const invoice of [pending, archived, voided, a]) await f.movement(`credit-operation:${invoice.operation}`);
    const result = await enrichAccountMovementInvoices(f.database, f.movements);
    expect(result.map(m => m.invoiceDisplay?.id)).toEqual([undefined, undefined, voided.id, undefined]);
    expect(result[2].invoiceDisplay?.status).toBe('anulada');
    expect(b.id).not.toBe(a.id);
  }));
  it("respeta vínculos de pagos individuales y grupales, incluso si el receptor fiscal difiere del titular de la cuenta", async () => fixture(async f => {
    const payment = randomUUID(), groupPayment = randomUUID();
    const a = await f.invoice({ entity: f.otherEntity }), b = await f.invoice({ group: groupPayment });
    await f.client.query(`INSERT INTO payments(id,reservation_id,amount,method,date,invoice_ref) VALUES($1,$2,294000,'cuenta_corriente','2026-11-26',$3)`, [payment, f.reservation, JSON.stringify({ id: a.id })]);
    await f.client.query(`INSERT INTO group_payments(id,group_id,amount,method,date,invoice_id) VALUES($1,$2,294000,'cuenta_corriente','2026-11-26',$3)`, [groupPayment, randomUUID(), b.id]);
    await f.movement('Anticipo', { paymentId: payment }); await f.movement('Pago grupal', { groupPaymentId: groupPayment });
    const result = await enrichAccountMovementInvoices(f.database, f.movements);
    expect(result.map(m => m.invoiceDisplay?.id)).toEqual([a.id, b.id]);
  }));
  it("tolera referencias históricas malformadas y no consulta para listas vacías", async () => fixture(async f => {
    const execute = vi.fn(); expect(await enrichAccountMovementInvoices({ execute }, [])).toEqual([]); expect(execute).not.toHaveBeenCalled();
    await f.movement('{id: no es JSON}');
    expect(await enrichAccountMovementInvoices(f.database, f.movements)).toEqual(f.movements);
  }));
});
