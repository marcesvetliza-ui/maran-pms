import { randomUUID } from "node:crypto";
import express from "express";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("../billing/billingConfig", async original => {
  const actual = await original<any>();
  return { ...actual, getBillingConfig: async () => ({ ...await actual.getBillingConfig(), modoArca: false, arcaAmbiente: "ficticio" }) };
});
vi.mock("../email-service", () => ({ sendCheckoutEmail: vi.fn(), sendConfirmationEmail: vi.fn() }));
const database = process.env.DATABASE_URL || "";
const enabled = !!database && (process.env.CI === "true" || process.env.ALLOW_DESTRUCTIVE_PG_TESTS === "true");
if (enabled && (!["localhost", "127.0.0.1"].includes(new URL(database).hostname) || !/test/i.test(new URL(database).pathname))) throw Error("Disposable local test database required");
let pool: any, server: any, base: string, role = "admin";
const created: any[] = [];
async function request(path: string, body?: any) {
  const response = await fetch(base + path, { method: body === undefined ? "GET" : "POST", headers: { "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: response.status, body: await response.json() as any };
}
async function fixture() {
  const id = `post-stay-test-${randomUUID()}`;
  const f = { id, other: `${id}-other`, guest: `${id}-guest`, room: `${id}-room`, type: `${id}-type`, shift: `${id}-shift`, operation: randomUUID() };
  created.push(f);
  await pool.query("INSERT INTO room_types(id,code,name) VALUES($1::text,$1::text,'Synthetic type')", [f.type]);
  await pool.query("INSERT INTO rooms(id,room_number,room_type_id,status) VALUES($1::text,$1::text,$2,'occupied')", [f.room, f.type]);
  await pool.query("INSERT INTO guests(id,first_name,last_name,document_number) VALUES($1,'Anterior','Huésped','12345678')", [f.guest]);
  await pool.query(`INSERT INTO reservations(id,reservation_code,guest_id,room_id,room_type_id,check_in_date,check_out_date,nights,total_room_amount,status,checked_out_at,created_at)
    VALUES($1::text,$1::text,$3,$4,$5,CURRENT_DATE-2,CURRENT_DATE-1,1,100,'checked_out',NOW(),NOW()),
      ($2::text,$2::text,$3,$4,$5,CURRENT_DATE,CURRENT_DATE+1,1,100,'checked_in',NULL,NOW())`, [f.id, f.other, f.guest, f.room, f.type]);
  const old = (await pool.query(`INSERT INTO sales_invoices(tipo_comprobante,punto_venta,numero,fecha_emision,cliente_razon_social,cliente_condicion_iva,monto_neto,monto_total,estado,reserva_id,source_charge_ids,source_charge_amounts,items)
    VALUES('FB',998,floor(random()*100000000)::int,CURRENT_DATE,'Historical guest','Consumidor Final',100,100,'emitida',$1,'["accommodation"]','{"accommodation":100}','[]') RETURNING id`, [f.id])).rows[0];
  await pool.query("INSERT INTO payments(id,reservation_id,amount,method,date,status,invoice_ref) VALUES($1,$2,100,'efectivo',CURRENT_DATE-1,'active',$3)", [`${id}-paid`, f.id, JSON.stringify({ id: old.id })]);
  await pool.query("INSERT INTO cash_shifts(id,area,shift_number,opened_at,status) VALUES($1,'reception',floor(random()*1000000)::int,NOW(),'open')", [f.shift]);
  return { ...f, oldInvoice: old.id };
}
const payload = (f: any) => ({ operationId: f.operation, description: "Cena después de la salida", amount: "121.00", category: "restaurant" });
async function snapshots(f: any) {
  return { reservations: (await pool.query("SELECT * FROM reservations WHERE id IN($1,$2) ORDER BY id", [f.id, f.other])).rows,
    room: (await pool.query("SELECT * FROM rooms WHERE id=$1", [f.room])).rows,
    oldInvoice: (await pool.query("SELECT * FROM sales_invoices WHERE id=$1", [f.oldInvoice])).rows,
    oldPayment: (await pool.query("SELECT * FROM payments WHERE id=$1", [`${f.id}-paid`])).rows };
}
async function invoice(f: any, chargeId: string, cc = true) {
  const body = { tipoComprobante: "FB", cliente: { razonSocial: "Huésped Anterior", condicionIva: "Consumidor Final", dni: "12345678" },
    items: [{ descripcion: "Cena posterior", cantidad: 1, precioUnitario: 121, subtotalNeto: 100, subtotal: 121, alicuotaIva: "21" }],
    reservaId: f.id, sourceChargeIds: [chargeId], sourceChargeAmounts: { [chargeId]: 121 }, creditOperationId: randomUUID(),
    creditReapplications: [], ordinaryAdvanceApplications: [], cashFormaPago: cc ? "cuenta_corriente" : "efectivo",
    cashFormaPagoDetalle: [{ method: cc ? "cuenta_corriente" : "efectivo", amount: 121 }],
    ...(cc ? { reservationSettlementMethod: "cuenta_corriente", ccEntityType: "guest", ccEntityId: f.guest } : {}) };
  return { ...await request("/api/billing/invoices", body), request: body };
}

describe.skipIf(!enabled)("financial work after departure is independent of current room occupancy", () => {
  beforeAll(async () => {
    ({ pool } = await import("../db"));
    await (await import("../permissions")).loadRolePermissionsCache();
    const app = express(); app.use(express.json());
    app.use((req, _res, next) => { req.user = { id: "post-stay-operator", username: "Synthetic reception", role } as any; req.isAuthenticated = () => true; next(); });
    (await import("../routes/reservations")).registerReservationsRoutes(app);
    (await import("../billing/routes")).registerBillingRoutes(app);
    server = app.listen(0, "127.0.0.1"); await new Promise<void>(resolve => server.once("listening", resolve)); base = `http://127.0.0.1:${server.address().port}`;
  });
  afterAll(async () => {
    if (server) await new Promise<void>(resolve => server.close(resolve));
    for (const f of created) {
      await pool.query("DELETE FROM cash_movements WHERE source_id=$1 OR source_id IN(SELECT id::text FROM sales_invoices WHERE reserva_id=$1)", [f.id]);
      for (const [table, column] of [["account_movements", "reservation_id"], ["billing_operations", "owner_id"], ["sales_invoices", "reserva_id"], ["payments", "reservation_id"], ["charges", "reservation_id"], ["reservation_changelog", "reservation_id"], ["audit_logs", "entity_id"]]) await pool.query(`DELETE FROM ${table} WHERE ${column}=$1`, [f.id]);
      await pool.query("DELETE FROM folio_movements WHERE folio_id IN(SELECT id FROM folios WHERE entity_id=$1)", [f.id]);
      await pool.query("DELETE FROM folios WHERE entity_id=$1", [f.id]);
      await pool.query("DELETE FROM reservations WHERE id IN($1,$2)", [f.id, f.other]);
      await pool.query("DELETE FROM rooms WHERE id=$1", [f.room]); await pool.query("DELETE FROM room_types WHERE id=$1", [f.type]); await pool.query("DELETE FROM guests WHERE id=$1", [f.guest]); await pool.query("DELETE FROM cash_shifts WHERE id=$1", [f.shift]);
    }
    await pool?.end();
  });
  it("adds and invoices a new consumption to CC exactly once while another guest occupies the room", async () => {
    const f = await fixture(), before = await snapshots(f), path = `/api/reservations/${f.id}/post-checkout/charges`;
    const results = await Promise.all([request(path, payload(f)), request(path, payload(f))]);
    expect(results.map(r => r.status).sort(), JSON.stringify(results)).toEqual([200, 201]);
    const chargeId = results[0].body.id;
    expect((await request(path, { ...payload(f), amount: "999.00" })).status).toBe(409);
    expect((await pool.query("SELECT * FROM charges WHERE reservation_id=$1", [f.id])).rows).toHaveLength(1);
    expect((await pool.query("SELECT * FROM folio_movements WHERE source_id=$1", [chargeId])).rows).toHaveLength(1);
    expect((await pool.query("SELECT * FROM audit_logs WHERE entity_id=$1 AND description LIKE 'Consumo posterior%'", [f.id])).rows).toHaveLength(1);
    const emitted = await invoice(f, chargeId); expect(emitted.status, JSON.stringify(emitted.body)).toBe(201);
    const retry = await request("/api/billing/invoices", emitted.request);
    expect(retry.status, JSON.stringify(retry.body)).toBeLessThan(300); expect(retry.body.id).toBe(emitted.body.id);
    expect((await pool.query("SELECT amount FROM account_movements WHERE reservation_id=$1 AND type='cargo'", [f.id])).rows).toEqual([{ amount: "121.00" }]);
    expect((await pool.query("SELECT amount FROM payments WHERE reservation_id=$1 AND method='cuenta_corriente'", [f.id])).rows).toEqual([{ amount: "121.00" }]);
    expect(await snapshots(f)).toEqual(before);
  });
  it("collects an issued post-stay invoice once and rejects a second payment or an old invoice", async () => {
    const f = await fixture(), before = await snapshots(f);
    const charge = await request(`/api/reservations/${f.id}/post-checkout/charges`, payload(f));
    const emitted = await invoice(f, charge.body.id, false); expect(emitted.status, JSON.stringify(emitted.body)).toBe(201);
    const body = { reservationId: f.id, amount: "121.00", method: "efectivo", paymentRequestId: randomUUID(), invoiceData: { id: emitted.body.id }, receiptType: "FB" };
    const results = await Promise.all([request("/api/payments", body), request("/api/payments", body)]);
    expect(results.map(r => r.status).sort(), JSON.stringify(results)).toEqual([200, 201]);
    expect((await request("/api/payments", { ...body, paymentRequestId: randomUUID() })).status).toBe(409);
    expect((await request("/api/payments", { ...body, paymentRequestId: randomUUID(), invoiceData: { id: f.oldInvoice } })).status).toBe(409);
    expect((await pool.query("SELECT * FROM cash_movements WHERE source_id=$1 AND movement_type='income'", [f.id])).rows).toHaveLength(1);
    expect(await snapshots(f)).toEqual(before);
  });
  it("rolls back charge and ledger together, keeps generic historical editing blocked, and enforces permissions", async () => {
    const f = await fixture(), path = `/api/reservations/${f.id}/post-checkout/charges`;
    const { storage } = await import("../db-storage");
    const failure = vi.spyOn(storage, "addFolioCharge").mockRejectedValueOnce(Error("Synthetic ledger failure"));
    expect((await request(path, payload(f))).status).toBe(500); failure.mockRestore();
    expect((await pool.query("SELECT * FROM charges WHERE reservation_id=$1", [f.id])).rows).toHaveLength(0);
    expect((await request("/api/charges", { reservationId: f.id, description: "Historical bypass", amount: "9", category: "otros", date: "2026-11-17" })).status).toBe(403);
    role = "restaurant";
    try { expect((await request(path, payload(f))).status).toBe(403); expect((await request(path)).status).toBe(403); expect((await request(`/api/reservations/${f.id}/undo-checkout`, {})).status).toBe(403); }
    finally { role = "admin"; }
    await pool.query("UPDATE reservations SET status='cancelled' WHERE id=$1", [f.id]);
    expect((await request(path, payload(f))).status).toBe(409);
    expect((await request(path, { ...payload(f), status: "checked_in" })).status).toBe(400);
  });
  it("reinstates only today's verified departure and refuses a room currently occupied by someone else", async () => {
    const f = await fixture(), before = await snapshots(f);
    expect((await request(`/api/reservations/${f.id}/checkout-reversal`)).body.allowed).toBe(true);
    expect((await request(`/api/reservations/${f.id}/undo-checkout`, {})).status).toBe(409);
    expect(await snapshots(f)).toEqual(before);
    await pool.query("DELETE FROM reservations WHERE id=$1", [f.other]); await pool.query("UPDATE rooms SET status='clean' WHERE id=$1", [f.room]);
    expect((await request(`/api/reservations/${f.id}/undo-checkout`, {})).status).toBe(200);
    expect((await pool.query("SELECT status,checked_out_at FROM reservations WHERE id=$1", [f.id])).rows).toEqual([{ status: "checked_in", checked_out_at: null }]);
    expect((await pool.query("SELECT status FROM rooms WHERE id=$1", [f.room])).rows[0].status).toBe("occupied");
    await pool.query("UPDATE reservations SET status='checked_out',checked_out_at=NOW()-INTERVAL '2 days' WHERE id=$1", [f.id]);
    expect((await request(`/api/reservations/${f.id}/checkout-reversal`)).body.allowed).toBe(false);
    expect((await request(`/api/reservations/${f.id}/undo-checkout`, {})).status).toBe(409);
  });
  it("uses audited departure evidence for legacy stays and still protects the next arrival", async () => {
    const f = await fixture();
    await pool.query("UPDATE reservations SET checked_out_at=NULL WHERE id=$1", [f.id]);
    expect((await request(`/api/reservations/${f.id}/checkout-reversal`)).body.allowed).toBe(false);
    await pool.query("INSERT INTO audit_logs(action,module,entity_type,entity_id,description,details,timestamp) VALUES('update','reservations','reservation',$1,'Legacy checkout',$2,NOW())", [f.id, JSON.stringify({ before: { status: "checked_in" }, after: { status: "checked_out" } })]);
    expect((await request(`/api/reservations/${f.id}/checkout-reversal`)).body.allowed).toBe(true);
    await pool.query("UPDATE reservations SET status='confirmed' WHERE id=$1", [f.other]);
    await pool.query("UPDATE rooms SET status='clean' WHERE id=$1", [f.room]);
    expect((await request(`/api/reservations/${f.id}/undo-checkout`, {})).status).toBe(409);
    await pool.query("DELETE FROM reservations WHERE id=$1", [f.other]);
    expect((await request(`/api/reservations/${f.id}/undo-checkout`, {})).status).toBe(200);
  });
});
