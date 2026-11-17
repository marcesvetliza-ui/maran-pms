import express from "express";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { sql } from "drizzle-orm";

vi.mock("../auth", async () => {
  const { hasPermission } = await import("../permissions");
  return {
    requireAuth: (req: any, res: any, next: any) => {
      if (!req.headers["x-test-role"]) return res.sendStatus(401);
      req.user = { id: "synthetic-op-editor", username: "Operador sintético", role: req.headers["x-test-role"] }; next();
    },
    requirePermission: (key: string) => (req: any, res: any, next: any) => hasPermission(req.user.role, key) ? next() : res.sendStatus(403),
  };
});
const enabled = !!process.env.DATABASE_URL;
if (enabled) { const url = new URL(process.env.DATABASE_URL!); if (!["127.0.0.1", "localhost"].includes(url.hostname) || !url.pathname.includes("test")) throw Error("OP edit tests require a local disposable database."); }
let db: typeof import("../db").db;
let pool: typeof import("../db").pool;
let create: typeof import("../paymentOrder").createPaymentOrder;
let server: any, base: string;
const fixtures: any[] = [];
async function request(method: string, path: string, body?: unknown, role: string | null = "admin") {
  const response = await fetch(base + path, { method, headers: { "content-type": "application/json", ...(role ? { "x-test-role": role } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { status: response.status, body: response.headers.get("content-type")?.includes("json") ? await response.json() : await response.text() };
}
async function fixture(nonFiscal = false, mixed = false) {
  const result = await db.transaction(async tx => {
    const supplier = Number((await tx.execute(sql`INSERT INTO accounting_suppliers(razon_social,cuit,condicion_iva) VALUES('Proveedor sintético OP',${randomUUID()},'responsable_inscripto') RETURNING id`)).rows[0].id);
    const invoice = Number((await tx.execute(sql`INSERT INTO purchase_invoices(tipo_comprobante,supplier_id,numero_comprobante,fecha_emision,periodo,monto_neto,monto_total,saldo_pendiente,estado,condicion_pago)
      VALUES(${nonFiscal ? "REMITO-NF" : "FACT-A"},${supplier},${randomUUID()},'2026-11-16','11/2026',1200,1500,1500,'pendiente','cuenta_corriente') RETURNING id`)).rows[0].id);
    const { op } = await create(tx, { supplierId: supplier, facturaIds: [invoice], montoParcial: 1000, fecha: "2026-11-16", formaPago: nonFiscal ? "efectivo" : "transferencia", efectivo: nonFiscal ? 1000 : mixed ? 200 : 0, depBancario: mixed ? 500 : 0, retencionIibb: nonFiscal ? 0 : 20, observaciones: "Original" }, () => "2026-11-16");
    const cash = Number((await tx.execute(sql`INSERT INTO admin_cash_movements(fecha,tipo,concepto,importe,signo,payment_order_id) VALUES('2026-11-16','egreso_proveedor','Movimiento independiente',${op.total_abonado},'-',${op.id}) RETURNING id`)).rows[0].id);
    // Same supplier/number/date, but attached to the invoice: not an OP retention.
    const invoiceRetention = Number((await tx.execute(sql`INSERT INTO iibb_retentions(nro_constancia,supplier_id,cuit_proveedor,fecha_retencion,fecha_comprobante,nro_comprobante,importe_base,alicuota,importe_retenido,invoice_id)
      VALUES(99001,${supplier},'30111111111','2026-11-16','2026-11-16',${Number(op.numero.split('-')[1])},1000,2,20,${invoice}) RETURNING id`)).rows[0].id);
    return { op: op.id, supplier, invoice, cash, entry: op.asiento_id, invoiceRetention };
  });
  fixtures.push(result); return result;
}
async function state(f: any) {
  return {
    op: (await pool.query("SELECT * FROM payment_orders WHERE id=$1", [f.op])).rows[0],
    invoices: (await pool.query("SELECT * FROM purchase_invoices WHERE id=$1", [f.invoice])).rows,
    items: (await pool.query("SELECT * FROM payment_order_items WHERE payment_order_id=$1 ORDER BY id", [f.op])).rows,
    entry: (await pool.query("SELECT * FROM accounting_entries WHERE id=$1", [f.entry])).rows[0],
    lines: (await pool.query("SELECT l.*,a.codigo FROM accounting_entry_lines l JOIN accounting_accounts a ON a.id=l.account_id WHERE l.entry_id=$1 ORDER BY l.id", [f.entry])).rows,
    cash: (await pool.query("SELECT * FROM admin_cash_movements WHERE id=$1", [f.cash])).rows,
    retentions: (await pool.query("SELECT * FROM iibb_retentions WHERE supplier_id=$1 ORDER BY id", [f.supplier])).rows,
  };
}
async function snapshot(f: any) { const response = await request("GET", `/api/payment-orders/${f.op}/edit`); expect(response.status).toBe(200); return response.body; }
const body = (op: any, changes: any = {}) => ({ fecha: op.fecha, formaPago: op.forma_pago, observaciones: op.observaciones || "", motivo: "Corrección solicitada", expectedVersion: op.edit_version, ...changes });
describe.skipIf(!enabled)("Edición acotada de órdenes de pago", () => {
  beforeAll(async () => {
    ({ db, pool } = await import("../db")); ({ createPaymentOrder: create } = await import("../paymentOrder"));
    (await import("../permissions")).setRolePermissionsCacheForTests([{ role: "admin", resourceKey: "api:purchase-invoices:write" }, { role: "resp_administracion", resourceKey: "api:purchase-invoices:write" }]);
    for (const [code, type] of [["2.1.1.01", "pasivo"], ["1.1.1.01", "activo"], ["1.1.1.02", "activo"], ["1.1.4.01.08.01", "pasivo"], ["1.1.4.01.05", "pasivo"], ["1.1.4.01.04.01", "pasivo"]]) await pool.query("INSERT INTO accounting_accounts(codigo,nombre,tipo) VALUES($1,'Cuenta sintética OP',$2) ON CONFLICT(codigo) DO NOTHING", [code, type]);
    const app = express(); app.use(express.json()); (await import("../routes/paymentOrderEdits")).registerPaymentOrderEditRoutes(app);
    server = app.listen(0, "127.0.0.1"); await new Promise<void>(resolve => server.once("listening", resolve)); base = `http://127.0.0.1:${server.address().port}`;
  }, 30000);
  afterAll(async () => {
    if (server) await new Promise<void>(resolve => server.close(() => resolve()));
    if (!pool) return;
    for (const f of fixtures) {
      await pool.query("DELETE FROM audit_logs WHERE entity_type='payment_order_edit' AND entity_id=$1", [String(f.op)]);
      await pool.query("DELETE FROM admin_cash_movements WHERE id=$1", [f.cash]);
      await pool.query("DELETE FROM iibb_retentions WHERE supplier_id=$1", [f.supplier]);
      await pool.query("DELETE FROM payment_order_items WHERE payment_order_id=$1", [f.op]);
      await pool.query("DELETE FROM payment_orders WHERE id=$1", [f.op]);
      await pool.query("DELETE FROM accounting_entry_lines WHERE entry_id=$1", [f.entry]);
      await pool.query("DELETE FROM accounting_entries WHERE id=$1", [f.entry]);
      await pool.query("DELETE FROM purchase_invoices WHERE id=$1", [f.invoice]);
      await pool.query("DELETE FROM accounting_suppliers WHERE id=$1", [f.supplier]);
    }
  }, 30000);
  it("corrige fecha y observaciones, conserva importes/saldos/Caja e identidad y fecha solo la constancia de la OP", async () => {
    const f = await fixture(), op = await snapshot(f), before = await state(f);
    expect(await request("PATCH", `/api/payment-orders/${f.op}`, body(op, { fecha: "2026-12-01", observaciones: "Fecha corregida" }), "resp_administracion")).toMatchObject({ status: 200, body: { id: f.op, numero: op.numero, fecha: "2026-12-01", observaciones: "Fecha corregida" } });
    const after = await state(f);
    expect(after.op).toEqual({ ...before.op, fecha: "2026-12-01", observaciones: "Fecha corregida" });
    for (const key of ["invoices", "items", "cash", "lines"] as const) expect(after[key]).toEqual(before[key]);
    expect(after.entry).toMatchObject({ id: before.entry.id, fecha: "2026-12-01", periodo: "12/2026" });
    expect(after.retentions.find((r: any) => r.invoice_id === null)).toEqual({ ...before.retentions.find((r: any) => r.invoice_id === null), fecha_retencion: "2026-12-01", fecha_comprobante: "2026-12-01" });
    expect(after.retentions.find((r: any) => r.invoice_id === f.invoice)).toEqual(before.retentions.find((r: any) => r.invoice_id === f.invoice));
    const history = (await snapshot(f)).history;
    expect(history).toHaveLength(1); expect(JSON.parse(history[0].details)).toMatchObject({ reason: "Corrección solicitada", before: { fecha: "2026-11-16" }, after: { fecha: "2026-12-01" } });
  });
  it("conserva exactamente una distribución mixta cuando solo cambia observaciones", async () => {
    const f = await fixture(false, true), op = await snapshot(f), before = await state(f);
    expect((await request("PATCH", `/api/payment-orders/${f.op}`, body(op, { observaciones: "Nueva observación" }))).status).toBe(200);
    const after = await state(f);
    expect(after).toEqual({ ...before, op: { ...before.op, observaciones: "Nueva observación" } });
  });
  it("corrige cada forma de pago reclasificando el mismo total, sin aplicar otra vez las facturas", async () => {
    const f = await fixture(), before = await state(f);
    for (const method of ["efectivo", "cheque", "dep_bancario", "transferencia"]) {
      const op = await snapshot(f);
      expect((await request("PATCH", `/api/payment-orders/${f.op}`, body(op, { formaPago: method }))).status).toBe(200);
      const after = await state(f);
      expect(after.items).toEqual(before.items); expect(after.invoices).toEqual(before.invoices); expect(after.cash).toEqual(before.cash); expect(after.retentions).toEqual(before.retentions);
      expect(after.op.total_abonado).toBe("980.00"); expect(after.op.total_facturas).toBe("1000.00"); expect(after.op.asiento_id).toBe(before.entry.id);
      expect(after.op.efectivo).toBe(method === "efectivo" ? "980.00" : "0.00"); expect(after.op.cheques).toBe(method === "cheque" ? "980.00" : "0.00"); expect(after.op.dep_bancario).toBe(method === "dep_bancario" ? "980.00" : "0.00");
      const funding = after.lines.filter((line: any) => ["1.1.1.01", "1.1.1.02"].includes(line.codigo));
      expect(funding.every((line: any) => line.codigo === (method === "efectivo" ? "1.1.1.01" : "1.1.1.02"))).toBe(true);
      expect(after.lines.reduce((sum: number, line: any) => sum + Number(line.debe) - Number(line.haber), 0)).toBe(0);
      expect(after.lines.map((line: any) => [line.id, line.debe, line.haber])).toEqual(before.lines.map((line: any) => [line.id, line.debe, line.haber]));
    }
  });
  it("rechaza fecha imposible, medio desconocido, motivo vacío e importes/facturas/proveedor/retenciones enviados por fuera de la pantalla", async () => {
    const f = await fixture(), op = await snapshot(f), before = await state(f);
    for (const patch of [{ fecha: "2026-02-30" }, { fecha: "0000-01-01" }, { formaPago: "inventado" }, { motivo: " " }, { totalAbonado: 1 }, { facturaIds: [] }, { supplierId: 3 }, { retencionIibb: 0 }]) expect((await request("PATCH", `/api/payment-orders/${f.op}`, body(op, patch))).status).toBe(400);
    expect(await state(f)).toEqual(before); expect((await snapshot(f)).history).toHaveLength(0);
  });
  it("serializa dos editores y rechaza la versión anterior sin pisar la corrección ganadora", async () => {
    const f = await fixture(), op = await snapshot(f);
    const results = await Promise.all(["Uno", "Dos"].map(observaciones => request("PATCH", `/api/payment-orders/${f.op}`, body(op, { observaciones }))));
    expect(results.map(result => result.status).sort()).toEqual([200, 409]);
    const fresh = await snapshot(f); expect(fresh.history).toHaveLength(1); expect(fresh.edit_version).not.toBe(op.edit_version);
    expect((await request("PATCH", `/api/payment-orders/${f.op}`, body(op, { observaciones: "Vieja" }))).status).toBe(409);
    expect((await snapshot(f)).observaciones).toBe(fresh.observaciones);
  });
  it("permite corregir fecha y notas de una compra no fiscal y conserva efectivo como único medio", async () => {
    const f = await fixture(true), op = await snapshot(f);
    expect(op.non_fiscal).toBe(true);
    expect((await request("PATCH", `/api/payment-orders/${f.op}`, body(op, { formaPago: "transferencia" }))).status).toBe(400);
    expect((await request("PATCH", `/api/payment-orders/${f.op}`, body(op, { fecha: "2026-11-17", observaciones: "Corregido" }))).status).toBe(200);
  });
  it("revierte fecha, reclasificación, constancia y OP si falla el registro obligatorio de auditoría", async () => {
    const f = await fixture(), op = await snapshot(f), before = await state(f), trigger = "fail_op_edit_" + f.op;
    await pool.query(`CREATE FUNCTION ${trigger}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.entity_type='payment_order_edit' AND NEW.entity_id='${f.op}' THEN RAISE EXCEPTION 'synthetic OP edit audit failure'; END IF; RETURN NEW; END $$; CREATE TRIGGER ${trigger} BEFORE INSERT ON audit_logs FOR EACH ROW EXECUTE FUNCTION ${trigger}()`);
    try { expect((await request("PATCH", `/api/payment-orders/${f.op}`, body(op, { fecha: "2026-12-02", formaPago: "efectivo", observaciones: "No guardar" }))).status).toBe(500); }
    finally { await pool.query(`DROP TRIGGER ${trigger} ON audit_logs; DROP FUNCTION ${trigger}()`); }
    expect(await state(f)).toEqual(before); expect((await snapshot(f)).history).toHaveLength(0);
  });
  it("exige autenticación y permiso de compras tanto para cargar el editor como para guardar", async () => {
    const f = await fixture(), op = await snapshot(f), before = await state(f);
    for (const [role, status] of [[null, 401], ["reception", 403]] as const) {
      expect((await request("GET", `/api/payment-orders/${f.op}/edit`, undefined, role)).status).toBe(status);
      expect((await request("PATCH", `/api/payment-orders/${f.op}`, body(op, { observaciones: "Prohibido" }), role)).status).toBe(status);
    }
    expect(await state(f)).toEqual(before);
    expect((await request("GET", "/api/payment-orders/bad/edit")).status).toBe(400);
    expect((await request("GET", "/api/payment-orders/2147483648/edit")).status).toBe(400);
    expect((await request("GET", "/api/payment-orders/2147483647/edit")).status).toBe(404);
  });
});
