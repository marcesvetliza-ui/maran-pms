import express from "express";
import { randomUUID } from "node:crypto";
import { beforeAll, afterAll, describe, expect, it } from "vitest";

const enabled = !!process.env.DATABASE_URL;
if (enabled) {
  const url = new URL(process.env.DATABASE_URL!);
  if (!["localhost", "127.0.0.1"].includes(url.hostname) || !/test/.test(url.pathname)) {
    throw new Error("Group block tests require a local disposable database.");
  }
}
const prefix = `block-confirm-${randomUUID()}`;
let pool: typeof import("../db")["pool"], server: any, base: string;
const fixtures: Array<{ typeId: string; groupId: string; guestId: string; competitorId: string }> = [];

async function fixture(externalReservation = true) {
  const id = `${prefix}-${fixtures.length}`;
  const f = { typeId: id, groupId: `${id}-group`, guestId: `${id}-guest`, competitorId: `${id}-other` };
  fixtures.push(f);
  await pool.query("INSERT INTO room_types(id,code,name) VALUES($1::text,$1,'Synthetic Premium')", [f.typeId]);
  await pool.query("INSERT INTO guests(id,first_name,last_name) VALUES($1,'Synthetic','Inventory')", [f.guestId]);
  for (let i = 0; i < 3; i++) {
    await pool.query("INSERT INTO rooms(id,room_number,room_type_id,is_active,is_virtual,status) VALUES($1::text,$1,$2,true,false,'available')", [`${id}-room-${i}`, f.typeId]);
  }
  await pool.query(`INSERT INTO groups(id,group_code,name,status,check_in_date,check_out_date,created_at)
    VALUES($1::text,$1,'Synthetic JOHNSON example','blocked','2026-11-23','2026-11-25',now())`, [f.groupId]);
  if (externalReservation) {
    await pool.query(`INSERT INTO reservations(id,reservation_code,guest_id,room_id,room_type_id,check_in_date,check_out_date,nights,status,created_at)
      VALUES($1::text,$1,$2,$3,$4,'2026-11-24','2026-11-25',1,'confirmed',now())`, [`${id}-external`, f.guestId, `${id}-room-2`, f.typeId]);
  }
  return f;
}
async function post(groupId: string, data: any) {
  const response = await fetch(`${base}/api/groups/${groupId}/blocks`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(data) });
  return { status: response.status, body: await response.json() };
}
async function assertNoPartialBlock(f: Awaited<ReturnType<typeof fixture>>) {
  expect((await pool.query("SELECT id FROM group_room_blocks WHERE group_id=$1", [f.groupId])).rows).toHaveLength(0);
  expect((await pool.query("SELECT reservation_id FROM group_reservation_links WHERE group_id=$1", [f.groupId])).rows).toHaveLength(0);
  expect((await pool.query("SELECT id FROM reservations WHERE reservation_code LIKE $1", [`G${f.groupId}-%`])).rows).toHaveLength(0);
  expect((await pool.query("SELECT id FROM guests WHERE codigo=$1", [`GROUP-${f.groupId}`])).rows).toHaveLength(0);
  expect((await pool.query("SELECT status FROM rooms WHERE room_type_id=$1", [f.typeId])).rows.every(r => r.status === "available")).toBe(true);
}

describe.skipIf(!enabled)("atomic group block creation and accepted inventory warnings", () => {
  beforeAll(async () => {
    ({ pool } = await import("../db"));
    const app = express(); app.use(express.json());
    (await import("../routes/groups")).registerGroupsRoutes(app);
    server = app.listen(0, "127.0.0.1");
    await new Promise<void>(resolve => server.once("listening", resolve));
    base = `http://127.0.0.1:${server.address().port}`;
  }, 30_000);

  afterAll(async () => {
    if (server) await new Promise<void>(resolve => server.close(() => resolve()));
    if (!pool) return;
    for (const f of fixtures) {
      await pool.query("DELETE FROM audit_logs WHERE entity_id IN(SELECT id FROM reservations WHERE room_type_id=$1)", [f.typeId]);
      await pool.query("DELETE FROM reservation_changelog WHERE reservation_id IN(SELECT id FROM reservations WHERE room_type_id=$1)", [f.typeId]);
      await pool.query("DELETE FROM group_reservation_links WHERE group_id=ANY($1::text[])", [[f.groupId, f.competitorId]]);
      await pool.query("DELETE FROM reservations WHERE room_type_id=$1", [f.typeId]);
      await pool.query("DELETE FROM group_room_blocks WHERE group_id=ANY($1::text[])", [[f.groupId, f.competitorId]]);
      await pool.query("DELETE FROM groups WHERE id=ANY($1::text[])", [[f.groupId, f.competitorId]]);
      await pool.query("DELETE FROM guests WHERE id=$1 OR codigo=ANY($2::text[])", [f.guestId, [`GROUP-${f.groupId}`, `GROUP-${f.competitorId}`]]);
      await pool.query("DELETE FROM rooms WHERE room_type_id=$1", [f.typeId]);
      await pool.query("DELETE FROM room_types WHERE id=$1", [f.typeId]);
    }
  });

  it("rejects without partial writes, then accepts the same warning once and creates the available linked reservations", async () => {
    const f = await fixture();
    const externalBefore = (await pool.query("SELECT * FROM reservations WHERE id=$1", [`${f.typeId}-external`])).rows[0];
    const body = { roomTypeId: f.typeId, quantity: 3, agreedRate: "133000" };
    const first = await post(f.groupId, body);
    expect(first.status, JSON.stringify(first.body)).toBe(409);
    expect(first.body).toMatchObject({ code: "GROUP_BLOCK_WARNING", canOverride: true });
    expect(first.body.warning.warnings).toContainEqual(expect.objectContaining({ groupId: f.groupId, date: "2026-11-24" }));
    await assertNoPartialBlock(f);

    const accepted = await post(f.groupId, { ...body, overrideTentativeGroupWarning: true });
    expect(accepted.status, JSON.stringify(accepted.body)).toBe(201);
    expect(accepted.body).toMatchObject({ quantity: 3, autoAssigned: 2, totalRequested: 3 });
    const blocks = (await pool.query("SELECT quantity FROM group_room_blocks WHERE group_id=$1", [f.groupId])).rows;
    expect(blocks).toEqual([{ quantity: 3 }]);
    const reservations = (await pool.query(`SELECT r.room_id,r.check_in_date::text,r.check_out_date::text,r.final_rate_per_night,r.total_room_amount
      FROM reservations r JOIN group_reservation_links l ON l.reservation_id=r.id WHERE l.group_id=$1`, [f.groupId])).rows;
    expect(reservations).toHaveLength(2);
    expect(new Set(reservations.map(r => r.room_id)).size).toBe(2);
    for (const row of reservations) expect(row).toMatchObject({ check_in_date: "2026-11-23", check_out_date: "2026-11-25", final_rate_per_night: "133000.00", total_room_amount: "266000.00" });
    expect((await pool.query("SELECT * FROM reservations WHERE id=$1", [`${f.typeId}-external`])).rows[0]).toEqual(externalBefore);
  });

  it("rolls back an earlier successful room, its audit, guest, block and projection when a later insert fails", async () => {
    const f = await fixture();
    await pool.query(`CREATE FUNCTION test_group_block_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
      IF NEW.reservation_code LIKE 'G${f.groupId}-%' AND EXISTS(SELECT 1 FROM reservations WHERE reservation_code LIKE 'G${f.groupId}-%')
      THEN RAISE EXCEPTION 'Synthetic second room failure'; END IF; RETURN NEW; END $$;
      CREATE TRIGGER test_group_block_failure BEFORE INSERT ON reservations FOR EACH ROW EXECUTE FUNCTION test_group_block_failure()`);
    try {
      const response = await post(f.groupId, { roomTypeId: f.typeId, quantity: 3, agreedRate: "133000", overrideTentativeGroupWarning: true });
      expect(response.status).toBe(500);
      await assertNoPartialBlock(f);
      expect((await pool.query("SELECT id FROM audit_logs WHERE details LIKE $1", [`%${f.groupId}%`])).rows).toHaveLength(0);
    } finally { await pool.query("DROP TRIGGER test_group_block_failure ON reservations; DROP FUNCTION test_group_block_failure()"); }
  });

  it("still blocks confirmed group commitments after accepting a tentative warning", async () => {
    const f = await fixture(false);
    await pool.query(`INSERT INTO groups(id,group_code,name,status,check_in_date,check_out_date,created_at)
      VALUES($1::text,$1,'Other confirmed group','confirmed','2026-11-24','2026-11-25',now())`, [f.competitorId]);
    await pool.query("INSERT INTO group_room_blocks(group_id,room_type_id,quantity) VALUES($1,$2,3)", [f.competitorId, f.typeId]);
    const response = await post(f.groupId, { roomTypeId: f.typeId, quantity: 2, overrideTentativeGroupWarning: true });
    expect(response.status, JSON.stringify(response.body)).toBe(409);
    expect(response.body).toMatchObject({ code: "GROUP_BLOCK_SHORTAGE", canOverride: false });
    await assertNoPartialBlock(f);
    expect((await pool.query("SELECT quantity FROM group_room_blocks WHERE group_id=$1", [f.competitorId])).rows).toEqual([{ quantity: 3 }]);
  });

  it("serializes concurrent block allocation and never assigns a physical room twice", async () => {
    const f = await fixture(false);
    await pool.query(`INSERT INTO groups(id,group_code,name,status,check_in_date,check_out_date,created_at)
      VALUES($1::text,$1,'Second tentative group','blocked','2026-11-23','2026-11-25',now())`, [f.competitorId]);
    const body = { roomTypeId: f.typeId, quantity: 2, overrideTentativeGroupWarning: true };
    const responses = await Promise.all([post(f.groupId, body), post(f.competitorId, body)]);
    expect(responses.map(r => r.status), JSON.stringify(responses)).toEqual([201, 201]);
    expect(responses.map(r => r.body.autoAssigned).sort()).toEqual([1, 2]);
    const assignments = (await pool.query("SELECT room_id FROM reservations WHERE room_type_id=$1", [f.typeId])).rows;
    expect(assignments).toHaveLength(3);
    expect(new Set(assignments.map(r => r.room_id)).size).toBe(3);
  });

  it("rejects invalid quantities before creating a block", async () => {
    const f = await fixture(false);
    for (const quantity of [0, -1, 1.5, "3oops", "NaN", null, true, {}, []]) {
      expect((await post(f.groupId, { roomTypeId: f.typeId, quantity })).status).toBe(400);
    }
    await assertNoPartialBlock(f);
  });
});
