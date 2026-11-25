import express from "express";
import { randomUUID } from "node:crypto";
import { beforeAll, afterAll, describe, it, expect } from "vitest";
const enabled = !!process.env.DATABASE_URL;
if (enabled) {
  const u = new URL(process.env.DATABASE_URL!);
  if (
    !["localhost", "127.0.0.1"].includes(u.hostname) ||
    !/test/.test(u.pathname)
  )
    throw Error("Requires a local disposable test database.");
}
let pool: any, server: any, base: string;
const fixtures: any[] = [];
async function fixture({
  placeholder = false,
  quantity = 1,
  paid = false,
} = {}) {
  const id = "group-block-import-" + randomUUID();
  const f = {
    id,
    group: id + "-group",
    type: id + "-type",
    guest: id + "-guest",
    placeholderGuest: id + "-placeholder",
    block: id + "-block",
    reservation: id + "-res",
    slot: id + "-slot",
    room: id + "-room",
    slotRoom: id + "-slot-room",
  };
  fixtures.push(f);
  await pool.query(
    "INSERT INTO room_types(id,code,name) VALUES($1::text,$1::text,'Synthetic category')",
    [f.type],
  );
  await pool.query(
    "INSERT INTO rooms(id,room_number,room_type_id,is_active,is_virtual,status) VALUES($1::text,$1::text,$3,true,false,'available'),($2::text,$2::text,$3,true,false,'available')",
    [f.room, f.slotRoom, f.type],
  );
  await pool.query(
    "INSERT INTO guests(id,first_name,last_name) VALUES($1,'Fixture','Person')",
    [f.guest],
  );
  await pool.query(
    "INSERT INTO guests(id,first_name,last_name,codigo) VALUES($1,'Fixture','Placeholder',$2)",
    [f.placeholderGuest, `GROUP-${f.group}`],
  );
  await pool.query(
    "INSERT INTO groups(id,group_code,name,status,check_in_date,check_out_date,created_at) VALUES($1::text,$1::text,'Synthetic group','blocked','2026-01-01','2026-01-02',now())",
    [f.group],
  );
  await pool.query(
    "INSERT INTO group_room_blocks(id,group_id,room_type_id,quantity,agreed_rate) VALUES($1,$2,$3,$4,100)",
    [f.block, f.group, f.type, quantity],
  );
  await pool.query(
    "INSERT INTO reservations(id,reservation_code,guest_id,room_type_id,room_id,check_in_date,check_out_date,nights,total_room_amount,base_rate_per_night,final_rate_per_night,status,created_at) VALUES($1::text,$1::text,$2,$3,$4,'2026-01-01','2026-01-02',1,100,100,100,'confirmed',now())",
    [f.reservation, f.guest, f.type, f.room],
  );
  if (placeholder) {
    await pool.query(
      "INSERT INTO reservations(id,reservation_code,guest_id,room_type_id,room_id,check_in_date,check_out_date,nights,total_room_amount,base_rate_per_night,final_rate_per_night,status,created_at) VALUES($1::text,$1::text,$2,$3,$4,'2026-01-01','2026-01-02',1,100,100,100,'confirmed',now())",
      [f.slot, f.placeholderGuest, f.type, f.slotRoom],
    );
    await pool.query(
      "INSERT INTO group_reservation_links(group_id,reservation_id,block_id) VALUES($1,$2,$3)",
      [f.group, f.slot, f.block],
    );
  }
  if (paid) {
    await pool.query(
      "INSERT INTO payments(id,reservation_id,amount,method,date,status) VALUES($1,$2,40,'efectivo','2026-01-01','active')",
      [id + "-payment", f.reservation],
    );
  }
  return f;
}
async function request(path: string, body?: any) {
  const r = await fetch(base + path, {
    method: body ? "POST" : "GET",
    headers: { "content-type": "application/json" },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return { status: r.status, body: await r.json() };
}
async function preview(f: any, choice: any = { blockId: f.block }) {
  return request(`/api/groups/${f.group}/import-reservation/preview`, {
    reservationId: f.reservation,
    ...choice,
  });
}
async function confirm(
  f: any,
  view: any,
  choice: any = { blockId: f.block },
  operationId = randomUUID(),
) {
  const body = {
    reservationId: f.reservation,
    ...choice,
    operationId,
    fingerprint: view.fingerprint,
    reason: "Synthetic grouping reason",
  };
  return request(`/api/groups/${f.group}/import-reservation`, body);
}
describe.skipIf(!enabled)(
  "group block identities and existing reservation imports",
  () => {
    beforeAll(async () => {
      ({ pool } = await import("../db"));
      await (await import("../permissions")).loadRolePermissionsCache();
      const app = express();
      app.use(express.json());
      app.use((req, _res, next) => {
        req.user = {
          id: "fixture-operator",
          username: "Fixture operator",
          role: "admin",
        } as any;
        req.isAuthenticated = () => true;
        next();
      });
      (await import("../routes/groups")).registerGroupsRoutes(app);
      server = app.listen(0, "127.0.0.1");
      await new Promise<void>((r) => server.once("listening", r));
      base = `http://127.0.0.1:${server.address().port}`;
    }, 30000);
    afterAll(async () => {
      if (server) await new Promise<void>((r) => server.close(() => r()));
      if (!pool) return;
      for (const f of fixtures) {
        await pool.query(
          "DELETE FROM group_reservation_imports WHERE group_id=$1",
          [f.group],
        );
        await pool.query(
          "DELETE FROM audit_logs WHERE entity_id=$1 OR entity_id IN(SELECT id FROM reservations WHERE room_type_id=$2)",
          [f.group, f.type],
        );
        await pool.query(
          "DELETE FROM reservation_changelog WHERE reservation_id IN(SELECT id FROM reservations WHERE room_type_id=$1)",
          [f.type],
        );
        await pool.query(
          "DELETE FROM payments WHERE reservation_id IN(SELECT id FROM reservations WHERE room_type_id=$1)",
          [f.type],
        );
        await pool.query(
          "DELETE FROM sales_invoices WHERE group_id=$1 OR reserva_id IN(SELECT id FROM reservations WHERE room_type_id=$2)",
          [f.group, f.type],
        );
        await pool.query(
          "DELETE FROM group_reservation_links WHERE group_id=$1",
          [f.group],
        );
        await pool.query("DELETE FROM reservations WHERE room_type_id=$1", [
          f.type,
        ]);
        await pool.query("DELETE FROM group_room_blocks WHERE group_id=$1", [
          f.group,
        ]);
        await pool.query("DELETE FROM groups WHERE id=$1", [f.group]);
        await pool.query("DELETE FROM guests WHERE id=ANY($1::text[])", [
          [f.guest, f.placeholderGuest],
        ]);
        await pool.query("DELETE FROM rooms WHERE room_type_id=$1", [f.type]);
        await pool.query("DELETE FROM room_types WHERE id=$1", [f.type]);
      }
    });
    it("imports the same reservation and preserves its original paid amount and all stored stay fields", async () => {
      const f = await fixture({ paid: true });
      const before = (
          await pool.query("SELECT * FROM reservations WHERE id=$1", [
            f.reservation,
          ])
        ).rows[0],
        payments = (
          await pool.query("SELECT * FROM payments WHERE reservation_id=$1", [
            f.reservation,
          ])
        ).rows;
      const p = await preview(f);
      expect(p.status, JSON.stringify(p.body)).toBe(200);
      expect(p.body).toMatchObject({ canImport: true, historicalPayments: 40 });
      const done = await confirm(f, p.body);
      expect(done.status, JSON.stringify(done.body)).toBe(200);
      expect(
        (
          await pool.query("SELECT * FROM reservations WHERE id=$1", [
            f.reservation,
          ])
        ).rows[0],
      ).toEqual(before);
      expect(
        (
          await pool.query("SELECT * FROM payments WHERE reservation_id=$1", [
            f.reservation,
          ])
        ).rows,
      ).toEqual(payments);
      expect(
        (
          await pool.query(
            "SELECT block_id FROM group_reservation_links WHERE reservation_id=$1",
            [f.reservation],
          )
        ).rows,
      ).toEqual([{ block_id: f.block }]);
    });
    it("replaces only an explicitly selected empty placeholder without creating another reservation", async () => {
      const f = await fixture({ placeholder: true });
      const choice = { blockId: f.block, replaceReservationId: f.slot };
      const p = await preview(f, choice);
      expect(p.body.canImport).toBe(true);
      const done = await confirm(f, p.body, choice);
      expect(done.status, JSON.stringify(done.body)).toBe(200);
      expect(
        (
          await pool.query("SELECT status FROM reservations WHERE id=$1", [
            f.slot,
          ])
        ).rows[0].status,
      ).toBe("cancelled");
      expect(
        (
          await pool.query(
            "SELECT id FROM reservations WHERE room_type_id=$1",
            [f.type],
          )
        ).rows,
      ).toHaveLength(2);
      expect(
        (
          await pool.query("SELECT status FROM reservations WHERE id=$1", [
            f.reservation,
          ])
        ).rows[0].status,
      ).toBe("confirmed");
    });
    it("refuses to replace a placeholder with money instead of transferring or deleting its payment", async () => {
      const f = await fixture({ placeholder: true });
      await pool.query(
        "INSERT INTO payments(id,reservation_id,amount,method,date,status) VALUES($1,$2,1,'efectivo','2026-01-01','active')",
        [f.id + "-slot-payment", f.slot],
      );
      const c = { blockId: f.block, replaceReservationId: f.slot };
      const p = await preview(f, c);
      expect(p.body.canImport).toBe(false);
      expect((await confirm(f, p.body, c)).status).toBe(409);
      expect(
        (
          await pool.query("SELECT status FROM reservations WHERE id=$1", [
            f.slot,
          ])
        ).rows[0].status,
      ).toBe("confirmed");
    });
    it("adds a separate block without another physical booking or a new payment", async () => {
      const f = await fixture();
      const before = (
        await pool.query("SELECT * FROM reservations WHERE id=$1", [
          f.reservation,
        ])
      ).rows[0];
      const c = { addBlock: true };
      const p = await preview(f, c);
      expect(p.body.canImport).toBe(true);
      const r = await confirm(f, p.body, c);
      expect(r.status, JSON.stringify(r.body)).toBe(200);
      expect(r.body.blockId).not.toBe(f.block);
      expect(
        (
          await pool.query("SELECT * FROM reservations WHERE id=$1", [
            f.reservation,
          ])
        ).rows[0],
      ).toEqual(before);
      expect(
        (
          await pool.query(
            "SELECT id FROM reservations WHERE room_type_id=$1",
            [f.type],
          )
        ).rows,
      ).toHaveLength(1);
    });
    it("replays concurrent/lost-response imports with one link and one import identity", async () => {
      const f = await fixture();
      const p = await preview(f);
      const op = randomUUID();
      const results = await Promise.all([
        confirm(f, p.body, undefined, op),
        confirm(f, p.body, undefined, op),
      ]);
      expect(results.map((r) => r.status)).toEqual([200, 200]);
      expect(results.filter((r) => r.body.replayed)).toHaveLength(1);
      expect(
        (
          await pool.query(
            "SELECT id FROM group_reservation_links WHERE reservation_id=$1",
            [f.reservation],
          )
        ).rows,
      ).toHaveLength(1);
    });
    it("rejects a stale preview before linking or repricing", async () => {
      const f = await fixture();
      const p = await preview(f);
      await pool.query(
        "UPDATE reservations SET total_room_amount=101 WHERE id=$1",
        [f.reservation],
      );
      const r = await confirm(f, p.body);
      expect(r.status).toBe(409);
      expect(r.body.notApplied).toBe(true);
      expect(
        (
          await pool.query(
            "SELECT id FROM group_reservation_links WHERE reservation_id=$1",
            [f.reservation],
          )
        ).rows,
      ).toHaveLength(0);
    });
    it("persists a manual block identity without changing the reservation or its payments", async () => {
      const f = await fixture({ paid: true });
      await pool.query(
        "INSERT INTO group_reservation_links(group_id,reservation_id) VALUES($1,$2)",
        [f.group, f.reservation],
      );
      const before = (
        await pool.query("SELECT * FROM reservations WHERE id=$1", [
          f.reservation,
        ])
      ).rows[0];
      const r = await request(
        `/api/groups/${f.group}/reservations/${f.reservation}/block`,
        { blockId: f.block },
      );
      expect(r.status, JSON.stringify(r.body)).toBe(200);
      expect(
        (
          await pool.query("SELECT * FROM reservations WHERE id=$1", [
            f.reservation,
          ])
        ).rows[0],
      ).toEqual(before);
      const replay = await request(
        `/api/groups/${f.group}/reservations/${f.reservation}/block`,
        { blockId: f.block },
      );
      expect(replay.body.replayed).toBe(true);
    });
    it("refuses to replace a placeholder already covered by a group invoice", async () => {
      const f = await fixture({ placeholder: true });
      await pool.query(
        "INSERT INTO sales_invoices(tipo_comprobante,punto_venta,numero,fecha_emision,cliente_razon_social,cliente_condicion_iva,monto_neto,monto_total,group_id,source_charge_amounts) VALUES('FB',1,999991,'2026-01-01','Synthetic Fixture','consumidor_final',100,100,$1,$2::jsonb)",
        [
          f.group,
          JSON.stringify({ [`reservation:${f.slot}:accommodation`]: 100 }),
        ],
      );
      const choice = { blockId: f.block, replaceReservationId: f.slot },
        view = await preview(f, choice);
      expect(view.body.canImport).toBe(false);
      expect(view.body.blockers.join(" ")).toContain("cobertura fiscal");
      expect((await confirm(f, view.body, choice)).status).toBe(409);
      expect(
        (
          await pool.query("SELECT status FROM reservations WHERE id=$1", [
            f.slot,
          ])
        ).rows[0].status,
      ).toBe("confirmed");
    });
    it("does not overfill a block when two separate existing reservations compete for its final slot", async () => {
      const f = await fixture();
      const second = f.id + "-second";
      await pool.query(
        "INSERT INTO reservations SELECT (jsonb_populate_record(NULL::reservations,to_jsonb(r)||jsonb_build_object('id',$2::text,'reservation_code',$2::text,'room_id',$3::text))).* FROM reservations r WHERE id=$1",
        [f.reservation, second, f.slotRoom],
      );
      const g = { ...f, reservation: second };
      const [a, b] = await Promise.all([preview(f), preview(g)]);
      expect(a.body.canImport).toBe(true);
      expect(b.body.canImport).toBe(true);
      const result = await Promise.all([
        confirm(f, a.body),
        confirm(g, b.body),
      ]);
      expect(result.map((r) => r.status).sort()).toEqual([200, 409]);
      expect(
        (
          await pool.query(
            "SELECT id FROM group_reservation_links WHERE group_id=$1",
            [f.group],
          )
        ).rows,
      ).toHaveLength(1);
    });
    it("preserves a provable individual invoice when linking the original reservation", async () => {
      const f = await fixture({ paid: true });
      const inserted = await pool.query(
        "INSERT INTO sales_invoices(tipo_comprobante,punto_venta,numero,fecha_emision,cliente_razon_social,cliente_condicion_iva,monto_neto,monto_total,reserva_id,source_charge_amounts) VALUES('FB',1,999992,'2026-01-01','Synthetic Fixture','consumidor_final',100,100,$1,$2::jsonb) RETURNING *",
        [f.reservation, JSON.stringify({ accommodation: 100 })],
      );
      const p = await preview(f);
      expect(p.body.canImport, JSON.stringify(p.body)).toBe(true);
      expect((await confirm(f, p.body)).status).toBe(200);
      expect(
        (
          await pool.query("SELECT * FROM sales_invoices WHERE id=$1", [
            inserted.rows[0].id,
          ])
        ).rows[0],
      ).toEqual(inserted.rows[0]);
    });
    it("releases only the explicitly identified empty block and keeps the other dated block and original booking intact", async () => {
      const f = await fixture({ placeholder: true }),
        other = f.id + "-other",
        otherBlock = f.id + "-other-block";
      await pool.query(
        "INSERT INTO group_room_blocks(id,group_id,room_type_id,quantity,agreed_rate,block_check_in_date,block_check_out_date) VALUES($1,$2,$3,1,100,'2026-01-02','2026-01-03')",
        [otherBlock, f.group, f.type],
      );
      await pool.query(
        "INSERT INTO reservations SELECT (jsonb_populate_record(NULL::reservations,to_jsonb(r)||jsonb_build_object('id',$2::text,'reservation_code',$2::text,'room_id',$3::text,'check_in_date','2026-01-02','check_out_date','2026-01-03'))).* FROM reservations r WHERE id=$1",
        [f.slot, other, f.room],
      );
      await pool.query(
        "INSERT INTO group_reservation_links(group_id,reservation_id,block_id) VALUES($1,$2,$3)",
        [f.group, other, otherBlock],
      );
      const result = await fetch(base + `/api/group-blocks/${f.block}`, {
        method: "DELETE",
      });
      expect(result.status, await result.text()).toBe(204);
      expect(
        (
          await pool.query("SELECT status FROM reservations WHERE id=$1", [
            f.slot,
          ])
        ).rows[0].status,
      ).toBe("cancelled");
      expect(
        (
          await pool.query("SELECT status FROM reservations WHERE id=$1", [
            other,
          ])
        ).rows[0].status,
      ).toBe("confirmed");
      expect(
        (
          await pool.query("SELECT status FROM reservations WHERE id=$1", [
            f.reservation,
          ])
        ).rows[0].status,
      ).toBe("confirmed");
      expect(
        (
          await pool.query("SELECT id FROM group_room_blocks WHERE id=$1", [
            otherBlock,
          ])
        ).rows,
      ).toHaveLength(1);
    });
  },
);
