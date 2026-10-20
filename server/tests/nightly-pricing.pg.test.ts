import { beforeAll, afterAll, beforeEach, describe, it, expect } from "vitest";
import { existsSync } from "node:fs";
import type { Server } from "node:http";
import express from "express";
import pg from "pg";
import { nightlyTotal } from "../../shared/nightlyPricing";

// Never uses an inherited DATABASE_URL. Copies only the known, local synthetic demo.
const available = existsSync("/tmp/maran-nightly-folio-demo/socket/.s.PGSQL.55478");
const database = `nightly_folio_test_${process.pid}_${Date.now()}`;
const admin = new pg.Pool({ host: "/tmp/maran-nightly-folio-demo/socket", port: 55478, user: "runner", database: "postgres", ssl: false });
let applicationPool: pg.Pool, server: Server, base: string, storage: any, fixture: any;
let actor: "admin" | "reception" | "housekeeping" | "piloto_externo" | null = "admin";
let created = false, counter = 0;
const editable = "nightly-demo-editable";
const url = `postgresql://runner@/${database}?host=%2Ftmp%2Fmaran-nightly-folio-demo%2Fsocket&port=55478`;
async function request(path: string, body?: any, method = "POST") {
  const response = await fetch(`${base}${path}`, {
    method: body === undefined ? "GET" : method,
    headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  if (!response.headers.get("content-type")?.includes("application/json")) throw new Error(`HTTP ${response.status}: ${text.slice(0, 1800)}`);
  return { status: response.status, data: JSON.parse(text) };
}
const pathFor = (id = editable) => `/api/reservations/${id}/nightly-pricing`;
const rateBody = (extra: any = {}) => ({
  revision: 0, reason: "Prueba sintética de tarifa",
  edit: { kind: "rates", dates: fixture.nightlyPricing.map((n: any) => n.date), rate: "", discount: "5000", discountMode: "amount", discountScope: "night" },
  ...extra,
});
async function saved(id = editable) { return storage.getReservation(id); }
async function moneyEvidence() {
  return (await applicationPool.query(`SELECT
    (SELECT coalesce(jsonb_agg(to_jsonb(p) ORDER BY id),'[]') FROM payments p) AS payments,
    (SELECT coalesce(jsonb_agg(to_jsonb(c) ORDER BY id),'[]') FROM cash_movements c) AS cash,
    (SELECT coalesce(jsonb_agg(to_jsonb(i) ORDER BY id),'[]') FROM sales_invoices i) AS invoices`)).rows[0];
}
describe.skipIf(!available)("precios nocturnos · PostgreSQL y middleware reales · copia desechable", () => {
  beforeAll(async () => {
    const location = (await admin.query("SELECT inet_server_addr() AS address")).rows[0];
    expect(location.address).toBe(null);
    await admin.query(`CREATE DATABASE ${database} TEMPLATE maran_nightly_folio_demo`);
    created = true;
    process.env.DATABASE_URL = url;
    ({ pool: applicationPool } = await import("../db"));
    const permissions = await import("../accommodationPermissions");
    await permissions.ensureAccommodationPermissionsSchema();
    await applicationPool.query(`INSERT INTO system_users(id,username,email,full_name,role,created_at)
      VALUES ('permission-fixture','permission.fixture','fixture@example.invalid','Synthetic permission test','piloto_externo',NOW())
      ON CONFLICT(id) DO NOTHING`);
    await applicationPool.query("INSERT INTO role_permissions(role,resource_key) VALUES ('admin','sidebar:/reservations'),('piloto_externo','sidebar:/reservations') ON CONFLICT DO NOTHING");
    await (await import("../permissions")).loadRolePermissionsCache();
    ({ storage } = await import("../db-storage"));
    const { registerReservationsRoutes } = await import("../routes/reservations");
    // The interactive demo is deliberately persistent. Normalize only our
    // disposable COPY so running this suite after a demo edit is repeatable.
    const template = await saved();
    const day = (offset: number) => new Date(Date.parse(`${template.checkInDate}T00:00:00Z`) + offset * 86400000).toISOString().slice(0, 10);
    const baseline = [9_000_000, 9_500_000, 10_000_000].map((rateCents, index) => ({
      date: day(index), rateCents, discountCents: 0,
    }));
    await applicationPool.query(`UPDATE reservations SET nightly_pricing=$1,pricing_revision=0,
      total_room_amount='285000.00',base_rate_per_night='95000.00',final_rate_per_night='95000.00',
      discount_type='none',discount_value=0,check_out_date=$2,nights=3 WHERE id=$3`,
      [JSON.stringify(baseline), day(3), editable]);
    fixture = await saved();
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      req.isAuthenticated = (() => actor !== null) as any;
      if (actor) req.user = { id: actor === "piloto_externo" ? "permission-fixture" : "nightly-demo-admin", username: "Demo Actor", role: actor } as any;
      next();
    });
    app.use("/api", (await import("../pilot-external-role")).authorizePilotExternalRole);
    permissions.registerAccommodationPermissionRoutes(app);
    registerReservationsRoutes(app);
    app.use((error: any, _req: any, res: any, _next: any) => {
      console.error("Synthetic API middleware error:", error.stack || error.message);
      res.status(error.statusCode || 500).json({ error: error.message });
    });
    server = app.listen(0, "127.0.0.1");
    await new Promise<void>(resolve => server.once("listening", resolve));
    const address = server.address() as any;
    base = `http://127.0.0.1:${address.port}`;
  }, 60_000);
  beforeEach(async () => {
    actor = "admin";
    await applicationPool.query("DELETE FROM user_permission_overrides WHERE user_id IN ('permission-fixture','nightly-demo-admin')");
    await applicationPool.query(`UPDATE reservations SET nightly_pricing=$1,pricing_revision=0,
      total_room_amount=$2,base_rate_per_night=$3,final_rate_per_night=$4,
      discount_type='none',discount_value=0,check_in_date=$5,check_out_date=$6,nights=3
      WHERE id=$7`, [JSON.stringify(fixture.nightlyPricing), fixture.totalRoomAmount, fixture.baseRatePerNight, fixture.finalRatePerNight, fixture.checkInDate, fixture.checkOutDate, editable]);
    await applicationPool.query("DELETE FROM reservation_changelog WHERE reservation_id=$1 AND tipo<>'creation'", [editable]);
  });
  afterAll(async () => {
    if (server) await new Promise<void>(resolve => server.close(() => resolve()));
    if (applicationPool) await applicationPool.end();
    if (created) await admin.query(`DROP DATABASE ${database} WITH (FORCE)`);
    await admin.end();
  });
  it("admin grants and revokes only the individual permission without changing roles", async () => {
    const endpoint = "/api/admin/accommodation-permissions/permission-fixture";
    actor = "piloto_externo";
    expect((await request("/api/reservation-edit-permission")).data.canEdit).toBe(false);
    expect((await request(endpoint, { allowed: true }, "PUT")).status).toBe(403);
    expect((await request(`/api/reservations/${editable}/nightly-pricing/preview`, rateBody())).status).toBe(403);
    actor = "admin";
    const grant = await fetch(`${base}${endpoint}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ allowed: true }) });
    expect(grant.status).toBe(204);
    actor = "piloto_externo";
    expect((await request("/api/reservation-edit-permission")).data.canEdit).toBe(true);
    expect((await request(`/api/reservations/${editable}/nightly-pricing/preview`, rateBody())).status).toBe(200);
    expect((await request(`/api/reservations/nightly-demo-full/nightly-pricing/preview`, rateBody())).status).toBe(409);
    actor = "admin";
    const revoke = await fetch(`${base}${endpoint}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ allowed: false }) });
    expect(revoke.status).toBe(204);
    actor = "piloto_externo";
    expect((await request(`/api/reservations/${editable}/nightly-pricing/preview`, rateBody())).status).toBe(403);
    expect((await request(`/api/reservations/${editable}/nightly-pricing/apply`, rateBody())).status).toBe(403);
    expect((await applicationPool.query("SELECT role FROM system_users WHERE id='permission-fixture'")).rows[0].role).toBe("piloto_externo");
    expect((await applicationPool.query("SELECT count(*) FROM audit_logs WHERE entity_type='user_permission' AND entity_id='permission-fixture'")).rows[0].count).toBe("2");
  });
  it("autoriza con middleware real, sin depender de los controles del navegador", async () => {
    actor = null;
    expect((await request(pathFor())).status).toBe(401);
    actor = "housekeeping";
    expect((await request(`${pathFor()}/apply`, rateBody())).status).toBe(403);
    actor = "reception";
    expect((await request("/api/reservation-pricing/activation", { confirm: true })).status).toBe(403);
  });
  it("la previsualización no escribe; guardar persiste total, revisión, actor, antes/después y motivo", async () => {
    const evidence = await moneyEvidence();
    const preview = await request(`${pathFor()}/preview`, rateBody());
    expect(preview.status).toBe(200);
    expect((await saved()).pricingRevision).toBe(0);
    const applied = await request(`${pathFor()}/apply`, rateBody());
    expect(applied.status).toBe(200);
    const reloaded = (await request(pathFor())).data.reservation;
    expect(reloaded.pricingRevision).toBe(1);
    expect(reloaded.totalRoomAmount).toBe("270000.00");
    expect(nightlyTotal(reloaded.nightlyPricing)).toBe(27_000_000);
    const log = (await applicationPool.query("SELECT * FROM reservation_changelog WHERE reservation_id=$1 AND tipo='tarifa'", [editable])).rows;
    expect(log).toHaveLength(1);
    expect(log[0].operador).toBe("Demo Actor");
    expect(log[0].fecha).toBeTruthy();
    expect(log[0].descripcion).toContain("Prueba sintética de tarifa");
    expect(log[0].descripcion).toContain('"before"');
    expect(log[0].descripcion).toContain('"after"');
    expect(await moneyEvidence()).toEqual(evidence);
  });
  it("activa sólo nuevas altas del servidor; fecha de ingreso futura no convierte las anteriores", async () => {
    const future = (offset: number) => new Date(Date.parse(`${fixture.checkInDate}T00:00:00Z`) + offset * 86400000).toISOString().slice(0,10);
    const body = { guestId: fixture.guestId, roomTypeId: fixture.roomTypeId, roomId: "nightly-demo-room-5",
      checkInDate: future(30), checkOutDate: future(31), nights: 1,
      baseRatePerNight: "90000", finalRatePerNight: "85000", totalRoomAmount: "85000",
      discountType: "fixed", discountValue: "5000", status: "confirmed", source: "directo",
      createdAt: "1900-01-01", pricingScheme: "legacy" };
    const first = await request("/api/reservations", body);
    expect(first.status).toBe(201);
    expect(first.data.pricingScheme).toBe("nightly_v1");
    expect(first.data.nightlyPricing).toEqual([{ date: body.checkInDate, rateCents: 9_000_000, discountCents: 500_000 }]);
    const activation = (await request("/api/reservation-pricing/activation")).data.activatedAt;
    expect((await request("/api/reservation-pricing/activation", { confirm: true })).status).toBe(200);
    expect((await request("/api/reservation-pricing/activation")).data.activatedAt).toBe(activation);
    expect((await saved("nightly-demo-legacy")).pricingScheme).toBe("legacy");
    await applicationPool.query("UPDATE system_settings SET value='2999-01-01T00:00:00Z' WHERE key='reservation_nightly_activation_at'");
    try {
      const second = await request("/api/reservations", { ...body, checkInDate: future(32), checkOutDate: future(33), pricingScheme: "nightly_v1" });
      expect(second.status).toBe(201);
      expect(second.data.pricingScheme).toBe("legacy");
      expect(second.data.nightlyPricing).toBe(null);
    } finally {
      await applicationPool.query("UPDATE system_settings SET value=$1 WHERE key='reservation_nightly_activation_at'", [activation]);
    }
  });
  it("rechaza datos inválidos y motivo vacío sin alterar nada", async () => {
    expect((await request(`${pathFor()}/apply`, rateBody({ reason: "" }))).status).toBe(400);
    const invalid = rateBody(); invalid.edit.discount = "-1";
    expect((await request(`${pathFor()}/apply`, invalid)).status).toBe(400);
    expect((await saved()).pricingRevision).toBe(0);
  });
  it("serializa dos operadores: uno guarda y el otro recibe conflicto", async () => {
    const replies = await Promise.all([
      request(`${pathFor()}/apply`, rateBody()),
      request(`${pathFor()}/apply`, rateBody({ reason: "Segundo operador" })),
    ]);
    expect(replies.map(r => r.status).sort()).toEqual([200, 409]);
    expect((await saved()).pricingRevision).toBe(1);
    expect((await applicationPool.query("SELECT count(*)::int AS n FROM reservation_changelog WHERE reservation_id=$1 AND tipo='tarifa'", [editable])).rows[0].n).toBe(1);
  });
  it.each(["partial", "full"])("bloquea factura %s tanto en el endpoint nuevo como en el PATCH anterior", async (suffix) => {
    const id = `nightly-demo-${suffix}`;
    const state = await request(pathFor(id));
    expect(state.data.blocked).toContain("fiscal");
    expect(state.data.fiscal.state).toBe(suffix === "partial" ? "parcial" : "facturado");
    expect((await request(`${pathFor(id)}/apply`, rateBody())).status).toBe(409);
    expect((await request(`/api/reservations/${id}`, { totalRoomAmount: "1" }, "PATCH")).status).toBe(409);
  });
  it("no convierte anteriores al leer, editar notas o intentar inyectar un esquema", async () => {
    const id = "nightly-demo-legacy";
    const before = await saved(id);
    expect((await request(`${pathFor(id)}/apply`, rateBody())).status).toBe(409);
    expect((await request(`/api/reservations/${id}`, { notes: "Nota sintética", pricingScheme: "nightly_v1", nightlyPricing: fixture.nightlyPricing, pricingRevision: 300 }, "PATCH")).status).toBe(200);
    const after = await saved(id);
    expect(after.pricingScheme).toBe("legacy");
    expect(after.nightlyPricing).toBe(null);
    expect(after.totalRoomAmount).toBe(before.totalRoomAmount);
  });
  it("impide cambiar noches o tarifas por el PATCH genérico del Planning", async () => {
    expect((await request(`/api/reservations/${editable}`, { nights: 4 }, "PATCH")).status).toBe(409);
    expect((await request(`/api/reservations/${editable}`, { finalRatePerNight: "1" }, "PATCH")).status).toBe(409);
    expect((await saved()).totalRoomAmount).toBe(fixture.totalRoomAmount);
  });
  it("quita una noche junto con su descuento y conserva exactamente las restantes", async () => {
    const discounted = await request(`${pathFor()}/apply`, rateBody());
    expect(discounted.status).toBe(200);
    const current = await saved();
    const proposal = { revision: 1, reason: "Acortar estadía sintética", edit: {
      kind: "stay", checkIn: current.nightlyPricing[1].date, checkOut: current.checkOutDate, addedRates: {},
    } };
    expect((await request(`${pathFor()}/preview`, proposal)).status).toBe(200);
    expect((await request(`${pathFor()}/apply`, proposal)).status).toBe(200);
    expect((await saved()).nightlyPricing).toEqual(current.nightlyPricing.slice(1));
  });
  it("precio explícito para agregadas; revalida disponibilidad al confirmar, no sólo en preview", async () => {
    const nextDay = new Date(Date.parse(`${fixture.checkOutDate}T00:00:00Z`) + 86400000).toISOString().slice(0,10);
    const proposal = { revision: 0, reason: "Extensión sintética", edit: {
      kind: "stay", checkIn: fixture.checkInDate, checkOut: nextDay, addedRates: {},
    } };
    expect((await request(`${pathFor()}/preview`, proposal)).status).toBe(400);
    (proposal.edit.addedRates as any)[fixture.checkOutDate] = "97000.01";
    expect((await request(`${pathFor()}/preview`, proposal)).status).toBe(200);
    expect((await request(`${pathFor()}/apply`, proposal)).status).toBe(200);
    const extended = await saved();
    expect(extended.nightlyPricing.slice(0,3)).toEqual(fixture.nightlyPricing);
    expect(extended.nightlyPricing[3].rateCents).toBe(9_700_001);
    expect(extended.totalRoomAmount).toBe("382000.01");
    // A second extension loses availability after preview.
    proposal.revision = 1;
    proposal.edit.checkOut = new Date(Date.parse(`${nextDay}T00:00:00Z`) + 86400000).toISOString().slice(0,10);
    (proposal.edit.addedRates as any)[nextDay] = "98000.01";
    expect((await request(`${pathFor()}/preview`, proposal)).status).toBe(200);
    await storage.createReservation({ ...fixture, id: undefined, reservationCode: `CONFLICT-${++counter}`, nightlyPricing: undefined,
      checkInDate: nextDay, checkOutDate: proposal.edit.checkOut, nights: 1,
      baseRatePerNight: "97000.01", finalRatePerNight: "97000.01", totalRoomAmount: "97000.01", createdAt: new Date() });
    expect((await request(`${pathFor()}/apply`, proposal)).status).toBe(409);
    expect((await saved()).checkOutDate).toBe(nextDay);
  });
  it("una falla del historial revierte precio, revisión y auditoría en la misma transacción", async () => {
    await applicationPool.query(`CREATE FUNCTION reject_nightly_test_history() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RAISE EXCEPTION 'synthetic history failure'; END$$;
      CREATE TRIGGER reject_nightly_test_history BEFORE INSERT ON reservation_changelog FOR EACH ROW EXECUTE FUNCTION reject_nightly_test_history()`);
    try {
      expect((await request(`${pathFor()}/apply`, rateBody())).status).toBe(500);
      expect((await saved()).pricingRevision).toBe(0);
      expect((await saved()).totalRoomAmount).toBe(fixture.totalRoomAmount);
    } finally {
      await applicationPool.query("DROP TRIGGER reject_nightly_test_history ON reservation_changelog; DROP FUNCTION reject_nightly_test_history()");
    }
  });
  it("serializa con el mismo bloqueo de emisión fiscal y no edita después de una nueva factura", async () => {
    const { withReservationFinancialLock } = await import("../nightlyPricingGuard");
    let release!: () => void, acquired!: () => void;
    const hold = new Promise<void>(resolve => { release = resolve; });
    const ready = new Promise<void>(resolve => { acquired = resolve; });
    const emission = withReservationFinancialLock(editable, async () => {
      acquired(); await hold;
      await applicationPool.query("UPDATE sales_invoices SET reserva_id=$1 WHERE reserva_id='nightly-demo-full'", [editable]);
    });
    await ready;
    let settled = false;
    const editing = request(`${pathFor()}/apply`, rateBody()).finally(() => { settled = true; });
    await new Promise(resolve => setTimeout(resolve, 50));
    try { expect(settled).toBe(false); } finally { release(); }
    await emission;
    expect((await editing).status).toBe(409);
    expect((await saved()).pricingRevision).toBe(0);
  });
});
