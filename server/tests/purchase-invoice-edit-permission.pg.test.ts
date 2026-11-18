import express from "express";
import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { PURCHASE_INVOICE_EDIT_ALL_PERMISSION as permission } from "@shared/purchase-invoice-edit";

const url = process.env.DATABASE_URL || "";
const enabled = !!url && (process.env.CI === "true" || process.env.ALLOW_DESTRUCTIVE_PG_TESTS === "true");
if (enabled && (!["localhost", "127.0.0.1"].includes(new URL(url).hostname) || !/test/i.test(new URL(url).pathname))) throw Error("Disposable local test database required");
let db: any, pool: any, server: any, base: string, account: number, savedGrants: any[];
const actor = `purchase-permission-test-${randomUUID()}`;
const fixtures: Array<{ id?: number; supplier: number }> = [];
async function request(method: string, path: string, body?: any, role = "resp_administracion", authenticated = true) {
  const response = await fetch(base + path, { method, headers: { "content-type": "application/json", "x-test-role": role, "x-test-auth": authenticated ? "yes" : "no" }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: response.status, body: response.status === 204 ? null : await response.json() as any };
}
async function fixture(paid = 100) {
  const suffix = randomUUID();
  const supplier = (await pool.query("INSERT INTO accounting_suppliers(razon_social,cuit,condicion_iva) VALUES($1,$2,'Responsable Inscripto') RETURNING id", [`Synthetic ${suffix}`, `30${suffix.replaceAll('-', '').slice(0, 9)}`])).rows[0].id;
  const entry: { id?: number; supplier: number } = { supplier }; fixtures.push(entry);
  const created = await request("POST", "/api/purchase-invoices", { tipoComprobante: "FACT-A", supplierId: supplier, puntoVenta: "1", numeroComprobante: `${Math.floor(Math.random() * 99999999) + 1}`, fechaEmision: "2026-11-18", periodo: "11/2026", condicionPago: "cuenta_corriente", montoNeto: "100", cuentaContableId: account }, "admin");
  expect(created.status, JSON.stringify(created.body)).toBe(201); entry.id = Number(created.body.id);
  if (paid) {
    const payment = await request("POST", "/api/payment-orders", { supplierId: supplier, facturaIds: [entry.id], montoParcial: paid < 100 ? paid : undefined, formaPago: "transferencia", fecha: "2026-11-18" });
    expect(payment.status, JSON.stringify(payment.body)).toBe(201);
  }
  return entry as { id: number; supplier: number };
}
async function settlements(id: number) {
  const ops = (await pool.query("SELECT po.* FROM payment_orders po JOIN payment_order_items i ON i.payment_order_id=po.id WHERE i.invoice_id=$1 ORDER BY po.id", [id])).rows;
  const items = (await pool.query("SELECT * FROM payment_order_items WHERE invoice_id=$1 ORDER BY id", [id])).rows;
  const entries = (await pool.query("SELECT * FROM accounting_entries WHERE id=ANY($1::int[]) ORDER BY id", [ops.map((op: any) => op.asiento_id).filter(Boolean)])).rows;
  const lines = (await pool.query("SELECT * FROM accounting_entry_lines WHERE entry_id=ANY($1::int[]) ORDER BY id", [entries.map((e: any) => e.id)])).rows;
  return { ops, items, entries, lines };
}
async function invoice(id: number) { return (await pool.query("SELECT * FROM purchase_invoices WHERE id=$1", [id])).rows[0]; }
async function grant(role: string) {
  const result = await request("POST", "/api/admin/role-permissions/grant", { role, resourceKey: permission }, "admin");
  expect(result.status, JSON.stringify(result.body)).toBe(204);
}

describe.skipIf(!enabled)("Purchase invoice exceptional edit permission · real PostgreSQL and real authorization", () => {
  beforeAll(async () => {
    ({ db, pool } = await import("../db"));
    savedGrants = (await pool.query("SELECT * FROM role_permissions WHERE resource_key=$1 ORDER BY role", [permission])).rows;
    await (await import("../permissions")).loadRolePermissionsCache();
    await pool.query("INSERT INTO accounting_accounts(codigo,nombre,tipo,nivel,activo) SELECT '1.1.4.07.01','IVA crédito fiscal prueba','activo',5,true WHERE NOT EXISTS(SELECT 1 FROM accounting_accounts WHERE codigo='1.1.4.07.01')");
    account = (await pool.query("SELECT id FROM accounting_accounts WHERE codigo='4.2.1.08.05.02'")).rows[0].id;
    const app = express(); app.use(express.json());
    app.use((req, _res, next) => { req.user = { id: actor, username: "Synthetic administration", role: req.headers["x-test-role"] || "resp_administracion" } as any; req.isAuthenticated = () => req.headers["x-test-auth"] !== "no"; next(); });
    server = createServer(app);
    await (await import("../routes")).registerRoutes(server, app);
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
    base = `http://127.0.0.1:${server.address().port}`;
  }, 30000);
  afterEach(async () => {
    await pool.query("DELETE FROM role_permissions WHERE resource_key=$1", [permission]);
    for (const row of savedGrants) await pool.query("INSERT INTO role_permissions(role,resource_key) VALUES($1,$2)", [row.role, row.resource_key]);
    await (await import("../permissions")).loadRolePermissionsCache();
  });
  afterAll(async () => {
    if (server) await new Promise<void>(resolve => server.close(resolve));
    for (const f of fixtures) {
      if (f.id) {
        const entryIds = (await pool.query("SELECT asiento_id FROM purchase_invoices WHERE id=$1 UNION SELECT po.asiento_id FROM payment_orders po JOIN payment_order_items i ON i.payment_order_id=po.id WHERE i.invoice_id=$1", [f.id])).rows.map((r: any) => r.asiento_id).filter(Boolean);
        const opIds = (await pool.query("SELECT payment_order_id FROM payment_order_items WHERE invoice_id=$1", [f.id])).rows.map((r: any) => r.payment_order_id);
        await pool.query("DELETE FROM payment_order_items WHERE invoice_id=$1", [f.id]);
        await pool.query("DELETE FROM payment_orders WHERE id=ANY($1::int[])", [opIds]);
        await pool.query("DELETE FROM accounting_entry_lines WHERE entry_id=ANY($1::int[])", [entryIds]);
        await pool.query("DELETE FROM accounting_entries WHERE id=ANY($1::int[])", [entryIds]);
        await pool.query("DELETE FROM iibb_retentions WHERE invoice_id=$1", [f.id]);
        await pool.query("DELETE FROM purchase_invoices WHERE id=$1", [f.id]);
      }
      await pool.query("DELETE FROM accounting_suppliers WHERE id=$1", [f.supplier]);
    }
    await pool.query("DELETE FROM audit_logs WHERE user_id=$1", [actor]);
    await pool?.end();
  });
  it("seeds the exception only for the administration lead and does not restore a revoked grant on restart", async () => {
    expect(savedGrants.map(r => r.role)).toEqual(["resp_administracion"]);
    const revoke = await request("POST", "/api/admin/role-permissions/revoke", { role: "resp_administracion", resourceKey: permission }, "admin");
    expect(revoke.status).toBe(204);
    await (await import("../migrate")).runMigrations();
    expect((await pool.query("SELECT role FROM role_permissions WHERE resource_key=$1", [permission])).rows).toEqual([]);
    await (await import("../permissions")).loadRolePermissionsCache();
    const f = await fixture();
    expect((await request("PATCH", `/api/purchase-invoices/${f.id}`, { montoNeto: "100" })).status).toBe(403);
  }, 30000);
  it("rejects direct requests by every other role and keeps pending editing available", async () => {
    const f = await fixture(); const before = await invoice(f.id), payments = await settlements(f.id);
    for (const role of ["admin", "manager", "resp_deposito", "reception", "comercial"]) expect((await request("PATCH", `/api/purchase-invoices/${f.id}`, { montoNeto: "120" }, role)).status).toBe(403);
    expect((await request("PATCH", `/api/purchase-invoices/${f.id}`, { montoNeto: "120" }, "resp_administracion", false)).status).toBe(401);
    expect(await invoice(f.id)).toEqual(before); expect(await settlements(f.id)).toEqual(payments);
    const pending = await fixture(0);
    expect((await request("PATCH", `/api/purchase-invoices/${pending.id}`, { montoNeto: "120", cuentaContableId: account }, "resp_deposito")).status).toBe(200);
  });
  it("corrects a paid invoice and its accounting entry while preserving every payment and OP", async () => {
    const f = await fixture(), payments = await settlements(f.id), original = await invoice(f.id);
    const updated = await request("PATCH", `/api/purchase-invoices/${f.id}`, { montoNeto: "90", montoIva21: "10", cuentaContableId: account, observaciones: "Corrección de impuestos" });
    expect(updated.status, JSON.stringify(updated.body)).toBe(200);
    expect(updated.body).toMatchObject({ estado: "pagado", saldo_pendiente: "0.00", monto_total: "100.00", monto_neto: "90.00", monto_iva21: "10.00" });
    expect(await settlements(f.id)).toEqual(payments);
    expect((await pool.query("SELECT id FROM accounting_entries WHERE id=$1", [original.asiento_id])).rows).toHaveLength(0);
    expect((await pool.query("SELECT id FROM accounting_entries WHERE origen_id=$1 AND origen_tipo='purchase_invoice'", [f.id])).rows).toHaveLength(1);
    const totals = (await pool.query("SELECT SUM(debe) AS debe,SUM(haber) AS haber FROM accounting_entry_lines WHERE entry_id=$1", [updated.body.asiento_id])).rows[0];
    expect(Number(totals.debe)).toBe(100); expect(Number(totals.haber)).toBe(100);
    const audit = (await pool.query("SELECT details FROM audit_logs WHERE entity_type='purchase_invoice' AND entity_id=$1 AND user_id=$2", [String(f.id), actor])).rows;
    expect(audit).toHaveLength(1);
    expect(JSON.parse(audit[0].details)).toMatchObject({ permission, before: { estado: "pagado", monto_neto: "100.00" }, after: { estado: "pagado", monto_neto: "90.00" } });
  });
  it("preserves the settled amount when the total changes and rejects a total below what has already been paid atomically", async () => {
    const f = await fixture(), payments = await settlements(f.id);
    const increased = await request("PATCH", `/api/purchase-invoices/${f.id}`, { montoNeto: "120", cuentaContableId: account });
    expect(increased.status, JSON.stringify(increased.body)).toBe(200);
    expect(increased.body).toMatchObject({ estado: "parcial", saldo_pendiente: "20.00", monto_total: "120.00" });
    const before = await invoice(f.id);
    const rejected = await request("PATCH", `/api/purchase-invoices/${f.id}`, { montoNeto: "90", cuentaContableId: account });
    expect(rejected.status).toBe(409); expect(rejected.body.error).toContain("ya cancelado");
    expect(await invoice(f.id)).toEqual(before); expect(await settlements(f.id)).toEqual(payments);
    const partial = await fixture(40);
    const adjusted = await request("PATCH", `/api/purchase-invoices/${partial.id}`, { montoNeto: "80", cuentaContableId: account });
    expect(adjusted.body).toMatchObject({ estado: "parcial", saldo_pendiente: "40.00", monto_total: "80.00" });
  });
  it("rolls back a paid edit if its accounting distribution would be unbalanced", async () => {
    const f = await fixture(), before = await invoice(f.id), payments = await settlements(f.id);
    const rejected = await request("PATCH", `/api/purchase-invoices/${f.id}`, { montoNeto: "100", cuentaContableId: null });
    expect(rejected.status).toBe(409); expect(rejected.body.error).toContain("asiento contable no cierra");
    expect(await invoice(f.id)).toEqual(before); expect(await settlements(f.id)).toEqual(payments);
    expect((await pool.query("SELECT id FROM accounting_entries WHERE origen_id=$1 AND origen_tipo='purchase_invoice'", [f.id])).rows).toHaveLength(1);
  });
  it("can delegate the permission and revoke it without a deployment, and still requires ordinary write permission", async () => {
    const f = await fixture(); await grant("resp_deposito");
    expect((await request("PATCH", `/api/purchase-invoices/${f.id}`, { montoNeto: "100", cuentaContableId: account }, "resp_deposito")).status).toBe(200);
    expect((await request("POST", "/api/admin/role-permissions/revoke", { role: "resp_deposito", resourceKey: permission }, "admin")).status).toBe(204);
    expect((await request("PATCH", `/api/purchase-invoices/${f.id}`, { montoNeto: "100" }, "resp_deposito")).status).toBe(403);
    (await import("../permissions")).setRolePermissionsCacheForTests([{ role: "resp_administracion", resourceKey: permission }]);
    expect((await request("PATCH", `/api/purchase-invoices/${f.id}`, { montoNeto: "100" })).status).toBe(403);
  });
  it.each(["registrado", "anulado"])("preserves the %s historical state without creating an OP", async state => {
    const f = await fixture(0);
    await pool.query("UPDATE purchase_invoices SET estado=$2,saldo_pendiente=0 WHERE id=$1", [f.id, state]);
    const changed = await request("PATCH", `/api/purchase-invoices/${f.id}`, { montoNeto: "120", cuentaContableId: account });
    expect(changed.status, JSON.stringify(changed.body)).toBe(200);
    expect(changed.body).toMatchObject({ estado: state, saldo_pendiente: "0.00" });
    expect((await settlements(f.id)).ops).toHaveLength(0);
  });
});
