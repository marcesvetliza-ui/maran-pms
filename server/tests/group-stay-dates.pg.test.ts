import { randomUUID } from "node:crypto";
import pg from "pg";
import express from "express";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { storage } from "../db-storage";
import { previewGroupStayDates } from "../groupStayDates";
import { calendarNights } from "@shared/nightlyPricing";

const url = process.env.DATABASE_URL;
const enabled = !!url && ["localhost", "127.0.0.1"].includes(new URL(url).hostname) && /test/i.test(new URL(url).pathname);
const suite = enabled ? describe : describe.skip;
const pool = enabled ? new pg.Pool({ connectionString: url }) : null;
const next = { checkInDate: "2030-05-04", checkOutDate: "2030-05-07" };

async function fixture(run: (f: any) => Promise<void>) {
  const f = Object.fromEntries(["group", "type", "guest", "room1", "room2", "r1", "r2", "block", "folio", "cash", "account"].map(key => [key, randomUUID()]));
  const grid = calendarNights("2030-05-03", "2030-05-07").map(date => ({ date, rateCents: 14700000, discountCents: 0 }));
  try {
    await pool!.query("INSERT INTO room_types(id,code,name) VALUES($1::text,$1::text,'Grupo sintético')", [f.type]);
    await pool!.query("INSERT INTO guests(id,codigo,first_name,last_name) VALUES($1,$2,'Grupo','Prueba')", [f.guest, `GROUP-${f.group}`]);
    for (const room of [f.room1, f.room2]) await pool!.query("INSERT INTO rooms(id,room_number,room_type_id,status) VALUES($1::text,$1::text,$2,'available')", [room, f.type]);
    await pool!.query("INSERT INTO groups(id,group_code,name,check_in_date,check_out_date,status,created_at) VALUES($1::text,$1::text,'Grupo sintético','2030-05-03','2030-05-07','confirmed',now())", [f.group]);
    await pool!.query("INSERT INTO group_room_blocks(id,group_id,room_type_id,quantity,agreed_rate) VALUES($1,$2,$3,2,147000)", [f.block, f.group, f.type]);
    for (const [id, room] of [[f.r1, f.room1], [f.r2, f.room2]]) {
      await pool!.query(`INSERT INTO reservations(id,reservation_code,guest_id,room_type_id,room_id,check_in_date,check_out_date,nights,base_rate_per_night,final_rate_per_night,total_room_amount,status,pricing_scheme,pricing_revision,nightly_pricing,created_at)
        VALUES($1::text,$1::text,$2,$3,$4,'2030-05-03','2030-05-07',4,147000,147000,588000,'confirmed','nightly_v1',0,$5,now())`, [id, f.guest, f.type, room, JSON.stringify(grid)]);
      await pool!.query("INSERT INTO group_reservation_links(group_id,reservation_id,block_id) VALUES($1,$2,$3)", [f.group, id, f.block]);
    }
    f.rows = async () => (await pool!.query("SELECT * FROM reservations WHERE id=ANY($1) ORDER BY id", [[f.r1, f.r2]])).rows;
    f.groupRow = async () => (await pool!.query("SELECT * FROM groups WHERE id=$1", [f.group])).rows[0];
    f.preview = (patch = next, rates: any = {}) => previewGroupStayDates(f.group, { ...patch, addedRates: rates });
    f.apply = (preview: any, patch = next, rates: any = {}) => storage.updateGroupAtomic(f.group, { patch, dateChangeConfirmation: { fingerprint: preview.fingerprint, addedRates: rates }, actor: { name: "Prueba" } });
    await run(f);
  } finally {
    await pool!.query("DELETE FROM audit_logs WHERE entity_id=ANY($1)", [[f.group, f.r1, f.r2]]);
    await pool!.query("DELETE FROM reservation_changelog WHERE reservation_id=ANY($1)", [[f.r1, f.r2]]);
    await pool!.query("DELETE FROM group_invoices WHERE group_id=$1", [f.group]);
    await pool!.query("DELETE FROM sales_invoices WHERE group_id=$1 OR reserva_id=ANY($2)", [f.group, [f.r1, f.r2]]);
    await pool!.query("DELETE FROM billing_operations WHERE owner_id=ANY($1)", [[f.group, f.r1, f.r2]]);
    await pool!.query("DELETE FROM payments WHERE reservation_id=ANY($1)", [[f.r1, f.r2]]);
    await pool!.query("DELETE FROM group_payments WHERE group_id=$1", [f.group]);
    await pool!.query("DELETE FROM folio_movements WHERE folio_id=$1", [f.folio]);
    await pool!.query("DELETE FROM folios WHERE id=$1", [f.folio]);
    await pool!.query("DELETE FROM cash_movements WHERE id=$1", [f.cash]);
    await pool!.query("DELETE FROM account_movements WHERE id=$1", [f.account]);
    await pool!.query("DELETE FROM maintenance_blocks WHERE room_id=ANY($1)", [[f.room1, f.room2]]);
    await pool!.query("DELETE FROM group_reservation_links WHERE group_id=$1", [f.group]);
    await pool!.query("DELETE FROM group_room_blocks WHERE group_id=$1", [f.group]);
    await pool!.query("DELETE FROM reservations WHERE id=ANY($1)", [[f.r1, f.r2]]);
    await pool!.query("DELETE FROM groups WHERE id=$1", [f.group]);
    await pool!.query("DELETE FROM rooms WHERE id=ANY($1)", [[f.room1, f.room2]]);
    await pool!.query("DELETE FROM guests WHERE id=$1", [f.guest]);
    await pool!.query("DELETE FROM room_types WHERE id=$1", [f.type]);
  }
}

suite("Fechas grupales y precios confirmados", () => {
  let server: ReturnType<ReturnType<typeof express>["listen"]>;
  let base: string;
  beforeAll(async () => {
    await (await import("../permissions")).loadRolePermissionsCache();
    const app = express(); app.use(express.json());
    app.use((req, _res, next) => {
      req.user = { username: "Prueba HTTP", role: "admin" } as any;
      req.isAuthenticated = (() => req.headers["x-test-auth"] !== "none") as any;
      next();
    });
    (await import("../routes/groups")).registerGroupsRoutes(app);
    server = app.listen(0, "127.0.0.1");
    await new Promise<void>(resolve => server.once("listening", resolve));
    base = `http://127.0.0.1:${(server.address() as any).port}`;
  }, 30_000);
  afterAll(async () => {
    if (server) await new Promise<void>(resolve => server.close(() => resolve()));
    await pool?.end();
  });
  const request = (f: any, path: string, method: string, body: any, anonymous = false) => fetch(`${base}/api/groups/${f.group}${path}`, {
    method, headers: { "content-type": "application/json", ...(anonymous ? { "x-test-auth": "none" } : {}) }, body: JSON.stringify(body),
  });
  it("HTTP exige sesión, prepara sin escribir y aplica solo la vista previa confirmada", async () => fixture(async f => {
    const before = await f.rows();
    expect((await request(f, "/date-change-preview", "POST", next, true)).status).toBe(401);
    expect((await request(f, "/date-change-preview", "POST", { ...next, checkInDate: "incorrecta" })).status).toBe(400);
    const previewResponse = await request(f, "/date-change-preview", "POST", next);
    expect(previewResponse.status).toBe(200);
    const preview = await previewResponse.json();
    expect(await f.rows()).toEqual(before);
    expect((await request(f, "", "PATCH", { ...next, dateChangeConfirmation: { fingerprint: "a".repeat(64) } })).status).toBe(409);
    expect(await f.rows()).toEqual(before);
    const applied = await request(f, "", "PATCH", { ...next, dateChangeConfirmation: { fingerprint: preview.fingerprint } });
    expect(applied.status, JSON.stringify(await applied.json())).toBe(200);
    for (const row of await f.rows()) expect(row).toMatchObject({ nights: 3, total_room_amount: "441000.00" });
  }));
  it("reproduce cuatro a tres noches y guarda el detalle y el importe junto con las fechas", async () => fixture(async f => {
    const before = await f.rows();
    const preview = await f.preview();
    expect(preview).toMatchObject({ canConfirm: true, beforeTotal: "1176000.00", afterTotal: "882000.00", difference: "-294000.00" });
    expect(await f.rows()).toEqual(before); // the preview is read only
    await f.apply(preview);
    for (const row of await f.rows()) {
      expect(row).toMatchObject({ check_in_date: next.checkInDate, check_out_date: next.checkOutDate, nights: 3, total_room_amount: "441000.00", pricing_revision: 1 });
      expect(row.nightly_pricing.map((n: any) => n.date)).toEqual(calendarNights(next.checkInDate, next.checkOutDate));
    }
    expect((await f.groupRow()).check_in_date).toBe(next.checkInDate);
    expect((await pool!.query("SELECT id FROM audit_logs WHERE entity_id=$1", [f.group])).rowCount).toBe(1);
    const saved = await f.rows();
    await f.apply(preview);
    expect(await f.rows()).toEqual(saved); // lost response/retry does not price twice
  }));
  it("exige la vista previa también a escritores que no usan la pantalla", async () => fixture(async f => {
    const before = await f.rows();
    await expect(storage.updateGroupAtomic(f.group, { patch: next })).rejects.toMatchObject({ statusCode: 409, response: { code: "GROUP_DATE_PREVIEW_REQUIRED" } });
    await expect(storage.updateGroup(f.group, next)).rejects.toMatchObject({ statusCode: 409 });
    expect(await f.rows()).toEqual(before);
  }));
  it("conserva pagos, Caja, cuenta corriente y folio de consumos al reprogramar", async () => fixture(async f => {
    await pool!.query("INSERT INTO payments(reservation_id,amount,method,date) VALUES($1,50000,'tarjeta_credito','2030-05-01')", [f.r1]);
    await pool!.query("INSERT INTO group_payments(group_id,amount,method,date) VALUES($1,100000,'efectivo','2030-05-01')", [f.group]);
    await pool!.query("INSERT INTO cash_movements(id,area,source_type,source_id,payment_method,amount) VALUES($1,'recepcion','group_payment',$2,'efectivo',100000)", [f.cash, f.group]);
    await pool!.query("INSERT INTO account_movements(id,entity_type,entity_id,date,type,description,amount) VALUES($1,'guest',$2,'2030-05-01','cargo','Prueba',100)", [f.account, f.guest]);
    await pool!.query("INSERT INTO folios(id,codigo,entity_type,entity_id,status,total_charges,total_payments,balance) VALUES($1::text,$1::text,'reservation',$2,'open',100,0,100)", [f.folio, f.r1]);
    await pool!.query("INSERT INTO folio_movements(folio_id,type,amount,description,source_type,source_id) VALUES($1,'charge',100,'Consumo','charge',$2)", [f.folio, randomUUID()]);
    const financial = async () => ({ payments: (await pool!.query("SELECT * FROM payments WHERE reservation_id=$1", [f.r1])).rows,
      group: (await pool!.query("SELECT * FROM group_payments WHERE group_id=$1", [f.group])).rows,
      cash: (await pool!.query("SELECT * FROM cash_movements WHERE id=$1", [f.cash])).rows,
      account: (await pool!.query("SELECT * FROM account_movements WHERE id=$1", [f.account])).rows,
      folio: (await pool!.query("SELECT * FROM folios WHERE id=$1", [f.folio])).rows,
      movements: (await pool!.query("SELECT * FROM folio_movements WHERE folio_id=$1", [f.folio])).rows });
    const before = await financial();
    await f.apply(await f.preview());
    expect(await financial()).toEqual(before);
  }));
  it.each(["payment", "price", "block"])("rechaza una vista previa desactualizada por %s sin propagar fechas", async kind => fixture(async f => {
    const preview = await f.preview();
    if (kind === "payment") await pool!.query("INSERT INTO payments(reservation_id,amount,method,date) VALUES($1,1,'efectivo','2030-05-01')", [f.r1]);
    if (kind === "price") await pool!.query("UPDATE reservations SET pricing_revision=pricing_revision+1 WHERE id=$1", [f.r1]);
    if (kind === "block") await pool!.query("UPDATE group_room_blocks SET agreed_rate=148000 WHERE id=$1", [f.block]);
    const before = await f.rows();
    await expect(f.apply(preview)).rejects.toMatchObject({ statusCode: 409, response: { code: "GROUP_DATE_PREVIEW_STALE" } });
    expect(await f.rows()).toEqual(before);
    expect((await f.groupRow()).check_in_date).toBe("2030-05-03");
  }));
  it.each(["reservation", "group"])("protege la facturación vigente o pendiente de %s", async owner => fixture(async f => {
    const preview = await f.preview();
    await pool!.query(`INSERT INTO sales_invoices(tipo_comprobante,punto_venta,numero,fecha_emision,cliente_razon_social,cliente_condicion_iva,monto_total,monto_neto,estado,modo_ficticio,reserva_id,group_id,source_charge_amounts)
      VALUES('FB',99976,$1,'2030-05-01','Prueba','Consumidor Final',588000,485950.41,'autorizacion_pendiente',false,$2,$3,$4)`,
      [10000 + Math.floor(Math.random() * 1000000), owner === 'reservation' ? f.r1 : null, owner === 'group' ? f.group : null, JSON.stringify({ accommodation: 588000 })]);
    const before = await f.rows();
    await expect(f.apply(preview)).rejects.toMatchObject({ statusCode: 409 });
    expect(await f.rows()).toEqual(before);
  }));
  it("conserva las reservas canceladas aunque su detalle histórico sea inconsistente", async () => fixture(async f => {
    await pool!.query("UPDATE reservations SET status='cancelled',check_in_date='2030-05-04' WHERE id=$1", [f.r2]);
    const cancelled = (await f.rows()).find((r: any) => r.id === f.r2);
    await f.apply(await f.preview());
    expect((await f.rows()).find((r: any) => r.id === f.r2)).toEqual(cancelled);
  }));
  it("mantiene fechas propias del bloque al cambiar las generales", async () => fixture(async f => {
    await pool!.query("UPDATE group_room_blocks SET block_check_in_date='2030-05-03',block_check_out_date='2030-05-07' WHERE id=$1", [f.block]);
    const before = await f.rows();
    const preview = await f.preview();
    expect(preview.rows.every(row => !row.changed)).toBe(true);
    await f.apply(preview);
    expect(await f.rows()).toEqual(before);
  }));
  it("impide mover la estadía si una habitación entró en mantenimiento después de la vista previa", async () => fixture(async f => {
    const preview = await f.preview();
    await pool!.query("INSERT INTO maintenance_blocks(room_id,block_from,block_to,blocked_by) VALUES($1,'2030-05-04','2030-05-06','Prueba')", [f.room1]);
    await expect(f.apply(preview)).rejects.toMatchObject({ statusCode: 409 });
    expect((await f.groupRow()).check_in_date).toBe("2030-05-03");
  }));
  it("cotiza explícitamente noches nuevas de un contrato con tarifas variables", async () => fixture(async f => {
    const row = (await f.rows()).find((r: any) => r.id === f.r1);
    row.nightly_pricing[0].rateCents += 10000;
    await pool!.query("UPDATE reservations SET total_room_amount=588100,nightly_pricing=$2 WHERE id=$1", [f.r1, JSON.stringify(row.nightly_pricing)]);
    const dates = { checkInDate: '2030-05-03', checkOutDate: '2030-05-08' };
    const missing = await f.preview(dates);
    expect(missing.canConfirm).toBe(false);
    await expect(f.apply(missing, dates)).rejects.toMatchObject({ statusCode: 409 });
    const rates = { [f.r1]: { '2030-05-07': '150000' } };
    await f.apply(await f.preview(dates, rates), dates, rates);
    const saved = (await f.rows()).find((r: any) => r.id === f.r1);
    expect(saved).toMatchObject({ nights: 5, total_room_amount: '738100.00' });
    expect(saved.nightly_pricing.slice(0,4)).toEqual(row.nightly_pricing);
  }));
  it("respeta una estadía individual con fechas propias aunque cambie el grupo", async () => fixture(async f => {
    const own = { checkInDate: '2030-05-04', checkOutDate: '2030-05-06' };
    const grid = calendarNights(own.checkInDate, own.checkOutDate).map(date => ({ date, rateCents: 14700000, discountCents: 0 }));
    await pool!.query("UPDATE reservations SET check_in_date=$2,check_out_date=$3,nights=2,total_room_amount=294000,nightly_pricing=$4 WHERE id=$1", [f.r2, own.checkInDate, own.checkOutDate, JSON.stringify(grid)]);
    const before = (await f.rows()).find((r: any) => r.id === f.r2);
    await f.apply(await f.preview());
    expect((await f.rows()).find((r: any) => r.id === f.r2)).toEqual(before);
  }));
  it("protege una habitación que ya realizó check-in", async () => fixture(async f => {
    await pool!.query("UPDATE reservations SET status='checked_in' WHERE id=$1", [f.r1]);
    await expect(f.preview()).rejects.toMatchObject({ statusCode: 409 });
    expect((await f.groupRow()).check_in_date).toBe('2030-05-03');
  }));
  it("protege un intento fiscal preparado sin factura creada todavía", async () => fixture(async f => {
    await pool!.query("INSERT INTO billing_operations(operation_id,owner_type,owner_id,payload_hash,request_snapshot,fiscal_identity,stage) VALUES($1,'group',$2,'synthetic','{}','{}','prepared')", [randomUUID(), f.group]);
    await expect(f.preview()).rejects.toMatchObject({ statusCode: 409 });
  }));
  it("revierte todas las fechas, precios e historial si falla la auditoría final", async () => fixture(async f => {
    const preview = await f.preview(), before = await f.rows(), groupBefore = await f.groupRow();
    const fn = `group_dates_${randomUUID().replaceAll('-', '')}`;
    await pool!.query(`CREATE FUNCTION ${fn}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.entity_id='${f.group}' THEN RAISE EXCEPTION 'synthetic audit failure'; END IF; RETURN NEW; END $$`);
    await pool!.query(`CREATE TRIGGER ${fn} BEFORE INSERT ON audit_logs FOR EACH ROW EXECUTE FUNCTION ${fn}()`);
    try {
      await expect(f.apply(preview)).rejects.toThrow();
      expect(await f.rows()).toEqual(before);
      expect(await f.groupRow()).toEqual(groupBefore);
      expect((await pool!.query("SELECT id FROM reservation_changelog WHERE reservation_id=ANY($1)", [[f.r1, f.r2]])).rowCount).toBe(0);
    } finally { await pool!.query(`DROP TRIGGER ${fn} ON audit_logs`); await pool!.query(`DROP FUNCTION ${fn}()`); }
  }));
  it("dos cambios simultáneos no pueden aplicar vistas previas incompatibles", async () => fixture(async f => {
    const other = { checkInDate: '2030-05-05', checkOutDate: '2030-05-07' };
    const one = await f.preview(), two = await f.preview(other);
    const results = await Promise.allSettled([f.apply(one), f.apply(two, other)]);
    expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter(r => r.status === 'rejected')).toHaveLength(1);
    for (const row of await f.rows()) expect(row.nightly_pricing.map((n: any) => n.date)).toEqual(calendarNights(row.check_in_date, row.check_out_date));
    expect((await pool!.query("SELECT id FROM audit_logs WHERE entity_id=$1", [f.group])).rowCount).toBe(1);
  }));
  it("vuelve a comprobar que la habitación siga habilitada después de la vista previa", async () => fixture(async f => {
    const preview = await f.preview();
    await pool!.query("UPDATE rooms SET is_active=false WHERE id=$1", [f.room1]);
    const before = await f.rows();
    await expect(f.apply(preview)).rejects.toMatchObject({ statusCode: 409 });
    expect(await f.rows()).toEqual(before);
    expect((await f.groupRow()).check_in_date).toBe("2030-05-03");
  }));
});
