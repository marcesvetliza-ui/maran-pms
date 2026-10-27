import { beforeAll, afterAll, beforeEach, describe, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import type { Server } from "node:http";
import express from "express";
import pg from "pg";
import { nightlyTotal } from "../../shared/nightlyPricing";

// Run only with explicit destructive-test consent and a local test database.
const url = process.env.DATABASE_URL;
const available = !!url && process.env.ALLOW_DESTRUCTIVE_PG_TESTS === "true";
if (available) {
  const target = new URL(url!);
  if (!["127.0.0.1", "localhost"].includes(target.hostname) || !/test/i.test(target.pathname)) {
    throw new Error("Nightly pricing tests require a disposable local test database.");
  }
}
const prefix = `nightly-test-${randomUUID()}`;
const idFor = (name: string) => `${prefix}-${name}`;
let applicationPool: pg.Pool, server: Server, base: string, storage: any, fixture: any;
let actor: "admin" | "reception" | "housekeeping" | null = "admin";
let counter = 0;
const editable = idFor("editable");
let previousActivation: any;
async function request(path: string, body?: any, method = "POST") {
  const response = await fetch(`${base}${path}`, {
    method: body === undefined ? "GET" : method,
    headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (response.status === 204) return {status:204,data:null};
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
describe.skipIf(!available)("precios nocturnos · PostgreSQL y middleware reales · datos sintéticos en base desechable", () => {
  beforeAll(async () => {
    ({ pool: applicationPool } = await import("../db"));
    await (await import("../accommodationPermissions")).ensureAccommodationPermissionsSchema();
    previousActivation = (await applicationPool.query("SELECT * FROM system_settings WHERE key='reservation_nightly_activation_at'")).rows[0];
    await applicationPool.query(`INSERT INTO system_settings(key,value,category,updated_at) VALUES ('reservation_nightly_activation_at','2001-01-01T00:00:00Z','reservations',NOW())
      ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value`);
    await (await import("../permissions")).loadRolePermissionsCache();
    ({ storage } = await import("../db-storage"));
    const { registerReservationsRoutes } = await import("../routes/reservations");
    await applicationPool.query(`INSERT INTO system_users(id,username,password,email,full_name,role,is_active,created_at)
      VALUES ($1::text,$1::text,'unused-synthetic','nightly@example.invalid','Synthetic nightly actor','admin','true',NOW())`, [idFor("admin")]);
    await applicationPool.query("INSERT INTO room_types(id,code,name) VALUES ($1::text,$1::text,'Synthetic nightly type')", [idFor("type")]);
    await applicationPool.query("INSERT INTO guests(id,first_name,last_name,document_type,document_number) VALUES ($1::text,'Synthetic','Nightly','dni',$1::text)", [idFor("guest")]);
    for (let i=1; i<=5; i++) await applicationPool.query("INSERT INTO rooms(id,room_number,room_type_id,floor,status) VALUES ($1::text,$1::text,$2,0,'available')", [idFor(`room-${i}`),idFor("type")]);
    const baseline = [9_000_000,9_500_000,10_000_000].map((rateCents,index) => ({date:`2090-01-0${index+1}`,rateCents,discountCents:0}));
    for (const [index,name] of ["editable","partial","full","legacy"].entries()) {
      await applicationPool.query(`INSERT INTO reservations(id,reservation_code,guest_id,room_id,room_type_id,
        check_in_date,check_out_date,nights,base_rate_per_night,final_rate_per_night,total_room_amount,
        discount_type,discount_value,status,source,number_of_guests,created_at,pricing_scheme,pricing_revision,nightly_pricing)
        VALUES ($1::text,$1::text,$2,$3,$4,'2090-01-01','2090-01-04',3,95000,95000,285000,'none',0,'confirmed','directo',1,'2000-01-01',$5,0,$6)`,
        [idFor(name),idFor("guest"),idFor(`room-${index+1}`),idFor("type"),name==="legacy"?"legacy":"nightly_v1",name==="legacy"?null:JSON.stringify(baseline)]);
      await applicationPool.query("INSERT INTO payments(id,reservation_id,amount,method,notes,date,status) VALUES ($1,$2,50000,'efectivo','Synthetic advance',NOW(),'active')",[idFor(`payment-${name}`),idFor(name)]);
      if (["partial","full"].includes(name)) await applicationPool.query(`INSERT INTO sales_invoices(tipo_comprobante,punto_venta,numero,fecha_emision,cliente_razon_social,
        cliente_condicion_iva,monto_neto,monto_total,estado,modo_ficticio,reserva_id,source_charge_ids,source_charge_amounts,items)
        VALUES ('FB',999,$1,NOW(),'Synthetic nightly','Consumidor Final',$2,$2,'emitida',true,$3,'["accommodation"]',$4,'[]')`,
        [index,name==="full"?285000:50000,idFor(name),JSON.stringify({accommodation:name==="full"?285000:50000})]);
    }
    fixture = await saved();
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      req.isAuthenticated = (() => actor !== null) as any;
      if (actor) req.user = { id: idFor("admin"), username: "Demo Actor", role: actor } as any;
      next();
    });
    registerReservationsRoutes(app);
    (await import("../accommodationPermissions")).registerAccommodationPermissionRoutes(app);
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
    await applicationPool.query(`UPDATE reservations SET nightly_pricing=$1,pricing_revision=0,
      total_room_amount=$2,base_rate_per_night=$3,final_rate_per_night=$4,
      discount_type='none',discount_value=0,check_in_date=$5,check_out_date=$6,nights=3
      WHERE id=$7`, [JSON.stringify(fixture.nightlyPricing), fixture.totalRoomAmount, fixture.baseRatePerNight, fixture.finalRatePerNight, fixture.checkInDate, fixture.checkOutDate, editable]);
    await applicationPool.query("DELETE FROM reservation_changelog WHERE reservation_id=$1 AND tipo<>'creation'", [editable]);
  });
  afterAll(async () => {
    if (server) await new Promise<void>(resolve => server.close(() => resolve()));
    if (applicationPool) {
      await applicationPool.query("DELETE FROM sales_invoices WHERE reserva_id IN (SELECT id FROM reservations WHERE guest_id=$1)",[idFor("guest")]);
      await applicationPool.query("DELETE FROM payments WHERE reservation_id IN (SELECT id FROM reservations WHERE guest_id=$1)",[idFor("guest")]);
      await applicationPool.query("DELETE FROM reservation_changelog WHERE reservation_id IN (SELECT id FROM reservations WHERE guest_id=$1)",[idFor("guest")]);
      await applicationPool.query("DELETE FROM reservations WHERE guest_id=$1",[idFor("guest")]);
      await applicationPool.query("DELETE FROM rooms WHERE room_type_id=$1",[idFor("type")]);
      await applicationPool.query("DELETE FROM room_types WHERE id=$1",[idFor("type")]);
      await applicationPool.query("DELETE FROM guests WHERE id=$1",[idFor("guest")]);
      await applicationPool.query("DELETE FROM user_permission_overrides WHERE user_id=$1",[idFor("admin")]);
      await applicationPool.query("DELETE FROM audit_logs WHERE user_id=$1",[idFor("admin")]);
      await applicationPool.query("DELETE FROM system_users WHERE id=$1",[idFor("admin")]);
      if (previousActivation) await applicationPool.query("UPDATE system_settings SET value=$1 WHERE key='reservation_nightly_activation_at'",[previousActivation.value]);
      else await applicationPool.query("DELETE FROM system_settings WHERE key='reservation_nightly_activation_at'");
      await applicationPool.end();
    }
  });
  it("autoriza con middleware real, sin depender de los controles del navegador", async () => {
    actor = null;
    expect((await request(pathFor())).status).toBe(401);
    actor = "housekeeping";
    expect((await request(`${pathFor()}/apply`, rateBody())).status).toBe(403);
    actor = "reception";

  });
  it("aplica el permiso por rol en preview y PATCH y retira la edición individual", async () => {
    actor = "reception";
    expect((await request("/api/reservation-edit-permission")).data.canEdit).toBe(true);
    expect((await request(`${pathFor()}/preview`, rateBody())).status).toBe(200);
    expect((await request(`/api/admin/accommodation-permissions/${idFor("admin")}`, {allowed:true}, "PUT")).status).toBe(403);
    actor = "admin";
    const { revokePermission, grantPermission } = await import("../permissions");
    expect((await request(`/api/admin/accommodation-permissions/${idFor("admin")}`, {allowed:false}, "PUT")).status).toBe(410);
    try {
      await revokePermission("admin", "reservations:edit-accommodation");
      expect((await request("/api/reservation-edit-permission")).data.canEdit).toBe(false);
      expect((await request(`${pathFor()}/preview`, rateBody())).status).toBe(403);
      expect((await request(`${pathFor()}/apply`, rateBody())).status).toBe(403);
      expect((await request(`/api/reservations/${editable}`, {totalRoomAmount:"1"}, "PATCH")).status).toBe(403);
      expect((await saved()).pricingRevision).toBe(0);
    } finally {
      await grantPermission("admin", "reservations:edit-accommodation");
    }
    expect((await request("/api/reservation-edit-permission")).data.canEdit).toBe(true);
  });
  it("sin configuración una nueva reserva usa precios nocturnos sin aceptar el detalle inyectado", async () => {
    const activation = (await applicationPool.query("SELECT value FROM system_settings WHERE key='reservation_nightly_activation_at'")).rows[0]?.value;
    await applicationPool.query("DELETE FROM system_settings WHERE key='reservation_nightly_activation_at'");
    try {
      const result = await request("/api/reservations", {
        guestId:fixture.guestId,roomTypeId:fixture.roomTypeId,roomId:idFor("room-5"),
        checkInDate:"2090-03-01",checkOutDate:"2090-03-02",nights:1,
        baseRatePerNight:"90000",finalRatePerNight:"90000",totalRoomAmount:"90000",
        status:"confirmed",source:"directo",pricingScheme:"nightly_v1",nightlyPricing:fixture.nightlyPricing,
      });
      expect(result.status).toBe(201);
      expect(result.data.pricingScheme).toBe("nightly_v1");
      expect(result.data.nightlyPricing).toEqual([{date:"2090-03-01",rateCents:9000000,discountCents:0}]);
    } finally {
      await applicationPool.query("INSERT INTO system_settings(key,value,category,updated_at) VALUES ('reservation_nightly_activation_at',$1,'reservations',NOW())",[activation]);
    }
  });
  it("crea paquetes con total exacto aunque el promedio por noche redondee hacia abajo", async () => {
    const result=await request("/api/reservations",{
      guestId:fixture.guestId,roomTypeId:fixture.roomTypeId,roomId:idFor("room-5"),
      checkInDate:"2090-04-01",checkOutDate:"2090-04-04",nights:3,
      baseRatePerNight:"33.33",finalRatePerNight:"33.33",totalRoomAmount:"100.00",
      discountType:"none",discountValue:"0",status:"confirmed",source:"directo",
    });
    expect(result.status).toBe(201);
    expect(result.data.totalRoomAmount).toBe("100.00");
    expect(nightlyTotal(result.data.nightlyPricing)).toBe(10000);
    expect(result.data.nightlyPricing.every((n:any)=>n.discountCents===0)).toBe(true);
  });
  it.each(["autorizacion_pendiente","ambiguous"])("no modifica alojamiento ante evidencia fiscal %s", async state => {
    const id=idFor("full");
    try {
      await applicationPool.query("UPDATE sales_invoices SET estado=$1,source_charge_amounts=$2 WHERE reserva_id=$3",
        [state === "ambiguous"?"emitida":state,state === "ambiguous"?null:JSON.stringify({accommodation:285000}),id]);
      const result=await request(pathFor(id));
      expect(result.data.fiscal.state).toBe(state === "ambiguous"?"revisar":"en_curso");
      expect((await request(`${pathFor(id)}/apply`,rateBody())).status).toBe(409);
    } finally {
      await applicationPool.query("UPDATE sales_invoices SET estado='emitida',source_charge_amounts=$1 WHERE reserva_id=$2",[JSON.stringify({accommodation:285000}),id]);
    }
  });
  it("remite al Folio Maestro cuando hay facturación del grupo", async () => {
    const group=idFor("group");
    await applicationPool.query("INSERT INTO groups(id,group_code,name,check_in_date,check_out_date,status,created_at) VALUES ($1::text,$1::text,'Synthetic nightly group','2090-01-01','2090-01-04','confirmed',NOW())",[group]);
    try {
      await applicationPool.query("INSERT INTO group_reservation_links(id,group_id,reservation_id) VALUES ($1,$2,$3)",[idFor("group-link"),group,editable]);
      await applicationPool.query("UPDATE sales_invoices SET group_id=$1 WHERE reserva_id=$2",[group,idFor("full")]);
      expect((await request(pathFor())).data.fiscal.state).toBe("grupal");
      const result=await request(`${pathFor()}/apply`,rateBody());
      expect(result.status).toBe(409);
      expect(result.data.error).toContain("Folio Maestro");
    } finally {
      await applicationPool.query("UPDATE sales_invoices SET group_id=NULL WHERE group_id=$1",[group]);
      await applicationPool.query("DELETE FROM group_reservation_links WHERE group_id=$1",[group]);
      await applicationPool.query("DELETE FROM groups WHERE id=$1",[group]);
    }
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
    // Prefactura consumes this existing endpoint: use the saved total, not
    // a reconstructed rounded average, and keep the advance untouched.
    const folio = await request(`/api/reservations/${editable}/folio`);
    expect(folio.status).toBe(200);
    expect(folio.data.roomTotal).toBe(270000);
    expect(folio.data.totalPayments).toBe(50000);
    expect(folio.data.balance).toBe(220000);
    const log = (await applicationPool.query("SELECT * FROM reservation_changelog WHERE reservation_id=$1 AND tipo='tarifa'", [editable])).rows;
    expect(log).toHaveLength(1);
    expect(log[0].operador).toBe("Demo Actor");
    expect(log[0].fecha).toBeTruthy();
    expect(log[0].descripcion).toContain("Prueba sintética de tarifa");
    expect(log[0].descripcion).toContain('"before"');
    expect(log[0].descripcion).toContain('"after"');
    expect(await moneyEvidence()).toEqual(evidence);
  });
  it("usa el esquema nocturno sólo en nuevas altas del servidor; fecha de ingreso futura no convierte las anteriores", async () => {
    const future = (offset: number) => new Date(Date.parse(`${fixture.checkInDate}T00:00:00Z`) + offset * 86400000).toISOString().slice(0,10);
    const body = { guestId: fixture.guestId, roomTypeId: fixture.roomTypeId, roomId: idFor("room-5"),
      checkInDate: future(30), checkOutDate: future(31), nights: 1,
      baseRatePerNight: "90000", finalRatePerNight: "85000", totalRoomAmount: "85000",
      discountType: "fixed", discountValue: "5000", status: "confirmed", source: "directo",
      createdAt: "1900-01-01", pricingScheme: "legacy" };
    const first = await request("/api/reservations", body);
    expect(first.status).toBe(201);
    expect(first.data.pricingScheme).toBe("nightly_v1");
    expect(first.data.nightlyPricing).toEqual([{ date: body.checkInDate, rateCents: 9_000_000, discountCents: 500_000 }]);
    const activation = (await applicationPool.query("SELECT value FROM system_settings WHERE key='reservation_nightly_activation_at'")).rows[0]?.value;
    expect((await saved(idFor("legacy"))).pricingScheme).toBe("legacy");
    await applicationPool.query("UPDATE system_settings SET value='2999-01-01T00:00:00Z' WHERE key='reservation_nightly_activation_at'");
    try {
      const second = await request("/api/reservations", { ...body, checkInDate: future(32), checkOutDate: future(33), pricingScheme: "nightly_v1" });
      expect(second.status).toBe(201);
      expect(second.data.pricingScheme).toBe("nightly_v1");
      expect(second.data.nightlyPricing).toEqual([{date:future(32),rateCents:9000000,discountCents:500000}]);
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
    const id = idFor(suffix);
    const state = await request(pathFor(id));
    expect(state.data.blocked).toContain("fiscal");
    expect(state.data.fiscal.state).toBe(suffix === "partial" ? "parcial" : "facturado");
    expect((await request(`${pathFor(id)}/apply`, rateBody())).status).toBe(409);
    expect((await request(`/api/reservations/${id}`, { totalRoomAmount: "1" }, "PATCH")).status).toBe(409);
  });
  it("no convierte anteriores al leer, editar notas o intentar inyectar un esquema", async () => {
    const id = idFor("legacy");
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
  it("conserva la confirmación explícita de cupos tentativos al extender la estadía", async () => {
    const group=idFor("tentative");
    await applicationPool.query("INSERT INTO groups(id,group_code,name,check_in_date,check_out_date,status,created_at) VALUES ($1::text,$1::text,'Synthetic tentative group','2090-01-04','2090-01-05','tentative',NOW())",[group]);
    try {
      await applicationPool.query("INSERT INTO group_room_blocks(id,group_id,room_type_id,quantity) VALUES ($1,$2,$3,5)",[idFor("block"),group,idFor("type")]);
      const proposal={revision:0,reason:"Extensión con aviso de grupo",edit:{kind:"stay",checkIn:fixture.checkInDate,checkOut:"2090-01-05",addedRates:{"2090-01-04":"97000"}}};
      const warning=await request(`${pathFor()}/preview`,proposal);
      expect(warning.status).toBe(409);
      expect(warning.data.code).toBe("GROUP_BLOCK_WARNING");
      expect(warning.data.canOverride).toBe(true);
      expect((await request(`${pathFor()}/preview`,{...proposal,overrideTentativeGroupWarning:true})).status).toBe(200);
      expect((await request(`${pathFor()}/apply`,{...proposal,overrideTentativeGroupWarning:true})).status).toBe(200);
    } finally {
      await applicationPool.query("DELETE FROM group_room_blocks WHERE group_id=$1",[group]);
      await applicationPool.query("DELETE FROM groups WHERE id=$1",[group]);
    }
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
      await applicationPool.query("UPDATE sales_invoices SET reserva_id=$1 WHERE reserva_id=$2", [editable,idFor("full")]);
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
