import { beforeAll, afterAll, expect, it, vi } from "vitest";
import express from "express";
import type { Server } from "node:http";
import { randomUUID } from "node:crypto";
// Real auth + permission middleware. Only the permission catalogue is isolated;
// no bypass is included in application code.
vi.mock("../permissions", () => ({ hasPermission: (role: string, key: string) =>
  role === "admin" && key === "sidebar:/admin/booking-engine" }));
import { pool } from "../db";
import { registerPublicBookingRoutes } from "../routes/publicBooking";
import { BOOKING_ENGINE_SCHEMA_SQL } from "../bookingEngineSchema";
import { editCalendar } from "../rates/calendarService";
import { storage } from "../db-storage";
import { rateCalendarSchemaSql } from "../rates/calendarSchema";
const socket = process.env.BOOKING_ENGINE_ISOLATED_SOCKET;
if (process.env.BOOKING_ENGINE_ISOLATED_TEST !== "1" || !socket?.startsWith("/tmp/booking-engine-isolated.") ||
    process.env.DATABASE_URL !== `postgresql://runner@localhost:55461/booking_engine_synthetic?host=${socket}`)
  throw Error("Run only with bash script/test-booking-engine-isolated.sh (never an operational database)");
const typeId = randomUUID(), roomId = randomUUID(), planId = randomUUID(), otherPlan = randomUUID();
let server: Server, base: string, lastCode: string;
const path = `/api/admin/room-types/${typeId}`;
const stay = { checkIn: "2091-01-02", checkOut: "2091-01-04", adults: 2 };
const config = { ratePlanId: planId, discountPercent: 10, publicDescription: "Synthetic review",
  amenities: ["WiFi"], photos: [], sortOrder: 0, showInBooking: true };
const post = (route: string, body: unknown, method = "POST", role?: string) => fetch(base + route, {
  method, headers: { "content-type": "application/json", ...(role ? { "x-role": role } : {}) }, body: JSON.stringify(body),
});
const availability = async () => {
  const r = await fetch(base + "/api/public/booking/availability?" + new URLSearchParams({ ...stay, adults: "2" }));
  expect(r.status).toBe(200);
  return (await r.json()).results;
};
beforeAll(async () => {
  await pool.query(BOOKING_ENGINE_SCHEMA_SQL);
  await pool.query(BOOKING_ENGINE_SCHEMA_SQL); // Idempotence.
  await pool.query(rateCalendarSchemaSql);
  await pool.query("TRUNCATE rooms,reservations,guests,rate_plans,room_types,groups,group_room_blocks,group_reservation_links,maintenance_blocks,audit_logs,booking_engine_sales CASCADE");
  await pool.query(BOOKING_ENGINE_SCHEMA_SQL);
  await pool.query("UPDATE booking_engine_sales SET enabled=true WHERE singleton=true");
  await pool.query("INSERT INTO room_types(id,code,name,base_occupancy,max_occupancy,show_in_booking) VALUES($1,'SYN','Synthetic room',2,2,true)", [typeId]);
  await pool.query("INSERT INTO rooms(id,room_number,room_type_id,floor,status) VALUES($1,'SYN-1',$2,1,'available')", [roomId, typeId]);
  await pool.query("INSERT INTO rate_plans(id,name,room_type_id,base_rate,rate_2pax,currency) VALUES($1,'Rack',$2,100000,120000,'ARS'),($3,'Cheaper internal plan',$2,1,1,'ARS')", [planId, typeId, otherPlan]);
  const app = express();
  app.use(express.json({ limit: "1mb" }));
  app.use((req: any, _res, next) => { req.user = { id: "synthetic-reviewer", role: req.headers["x-role"] }; req.isAuthenticated = () => !!req.headers["x-role"]; next(); });
  registerPublicBookingRoutes(app);
  await pool.query("INSERT INTO booking_engine_configs(room_type_id,rate_plan_id,discount_percent) VALUES($1,$2,10)", [typeId, planId]);
  server = app.listen(0, "127.0.0.1");
  await new Promise<void>(resolve => server.once("listening", resolve));
  base = `http://127.0.0.1:${(server.address() as any).port}`;
});
afterAll(async () => {
  if (server) { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
  await pool.end();
});
it("confirms the same occupancy quoted to a family with one child", async () => {
  await pool.query("UPDATE room_types SET max_occupancy=3 WHERE id=$1", [typeId]);
  await pool.query("UPDATE rate_plans SET rate_3pax=150000 WHERE id=$1", [planId]);
  try {
    const response = await fetch(base + "/api/public/booking/availability?" + new URLSearchParams({ ...stay, adults: "2", children: "1" }));
    const quoted = (await response.json()).results[0];
    expect(quoted.totalPrice).toBe(270000);
    const confirmed = await post("/api/public/booking/confirm", { ...stay, children: 1, childrenAges: [8],
      roomTypeId: typeId, ratePlanId: planId, expectedTotalAmount: quoted.totalPrice,
      firstName: "Synthetic", lastName: "Family", email: "family@example.invalid" });
    console.log("REVIEW family", { quoted: quoted.totalPrice, status: confirmed.status, body: await confirmed.json() });
    expect(confirmed.status).toBe(200);
    const saved = (await pool.query("SELECT number_of_guests,notes,total_room_amount FROM reservations")).rows[0];
    expect(saved.number_of_guests).toBe(3);
    expect(saved.total_room_amount).toBe("270000.00");
    expect(saved.notes).toContain("edades: 8");
  } finally {
    await pool.query("DELETE FROM reservations; DELETE FROM guests;");
    await pool.query("UPDATE room_types SET max_occupancy=2 WHERE id=$1", [typeId]);
    await pool.query("UPDATE rate_plans SET rate_3pax=null WHERE id=$1", [planId]);
  }
});

it("preserves a confirmed group's last usable room during dated maintenance", async () => {
  const otherRoom = randomUUID(), group = randomUUID();
  await pool.query("INSERT INTO rooms(id,room_number,room_type_id,floor,status) VALUES($1,'SYN-MAINT',$2,1,'available')", [otherRoom, typeId]);
  await pool.query("INSERT INTO maintenance_blocks(room_id,block_from,block_to,blocked_by) VALUES($1,$2,$3,'Synthetic')", [otherRoom, stay.checkIn, stay.checkOut]);
  await pool.query("INSERT INTO groups(id,group_code,name,check_in_date,check_out_date,status,created_at) VALUES($1,'REVIEW-G','Synthetic commitment',$2,$3,'confirmed',now())", [group, stay.checkIn, stay.checkOut]);
  await pool.query("INSERT INTO group_room_blocks(group_id,room_type_id,quantity) VALUES($1,$2,1)", [group, typeId]);
  try {
    const offered = await availability();
    expect(offered).toEqual([]);
    const confirmed = await post("/api/public/booking/confirm", { ...stay, roomTypeId: typeId, ratePlanId: planId,
      expectedTotalAmount: 216000, firstName: "Synthetic", lastName: "Inventory", email: "inventory@example.invalid" });
    console.log("REVIEW group plus maintenance", { offeredCategories: offered.length, status: confirmed.status, body: await confirmed.json() });
    expect(confirmed.status).toBe(409);
  } finally {
    await pool.query("DELETE FROM reservations; DELETE FROM guests; DELETE FROM maintenance_blocks;");
    await pool.query("DELETE FROM group_room_blocks WHERE group_id=$1", [group]);
    await pool.query("DELETE FROM groups WHERE id=$1", [group]);
    await pool.query("DELETE FROM rooms WHERE id=$1", [otherRoom]);
  }
});

it("booking and a calendar edit on a different night do not deadlock", async () => {
  const request = { changes: [{ ratePlanIds: [planId], dateFrom: "2091-01-10", dateTo: "2091-01-10", values: { rate: "130000" } }] };
  const preview = await editCalendar(pool, request, null);
  let locked!: () => void, proceed!: () => void;
  const hasPlanLock = new Promise<void>(resolve => { locked = resolve; });
  const canContinue = new Promise<void>(resolve => { proceed = resolve; });
  const instrumentedPool = { connect: async () => {
    const c = await pool.connect();
    return { release: () => c.release(), query: async (query: string, params?: any[]) => {
      const result = await c.query(query, params);
      if (query.includes("ORDER BY id FOR UPDATE")) { locked(); await canContinue; }
      return result;
    } };
  } };
  const editing = editCalendar(instrumentedPool as any, request, null, preview.previewToken)
    .then(() => ({ success: true, code: null as string | null }), error => ({ success: false, code: error.code }));
  await hasPlanLock;
  const confirming = post("/api/public/booking/confirm", { ...stay, roomTypeId: typeId, ratePlanId: planId,
    expectedTotalAmount: 216000, firstName: "Synthetic", lastName: "Concurrency", email: "concurrency@example.invalid" });
  try {
    let waiting = false;
    for (let i = 0; i < 100; i++) {
      const rows = await pool.query("SELECT 1 FROM pg_stat_activity WHERE wait_event_type='Lock' AND query LIKE '%FOR SHARE OF c,p%'");
      if (rows.rows.length) { waiting = true; break; }
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    expect(waiting).toBe(true);
    proceed();
    const response = await confirming;
    const calendar = await editing;
    console.log("REVIEW calendar concurrency", { bookingStatus: response.status, calendar, body: await response.json() });
    expect(calendar).toEqual({ success: true, code: null });
    expect(response.status).toBe(200);
  } finally {
    proceed();
    await Promise.all([editing, confirming]);
    await pool.query("DELETE FROM reservations; DELETE FROM guests; DELETE FROM rate_calendar_entries;");
  }
});
it("a confirmation does not block edits on an unrelated OTA plan", async () => {
  let locked!: () => void, proceed!: () => void;
  const hasPlanLock = new Promise<void>(resolve => { locked = resolve; });
  const canContinue = new Promise<void>(resolve => { proceed = resolve; });
  const original = storage.createReservation.bind(storage);
  const spy = vi.spyOn(storage, "createReservation").mockImplementation(async (data, callback) => {
    locked(); await canContinue; return original(data, callback);
  });
  const confirming = post("/api/public/booking/confirm", { ...stay, roomTypeId: typeId, ratePlanId: planId,
    expectedTotalAmount: 216000, firstName: "Synthetic", lastName: "Unrelated", email: "unrelated@example.invalid" });
  try {
    await hasPlanLock;
    const request = { changes: [{ ratePlanIds: [otherPlan], dateFrom: stay.checkIn, dateTo: stay.checkIn, values: { rate: "12" } }] };
    const preview = await editCalendar(pool, request, null);
    const edited = await editCalendar(pool, request, null, preview.previewToken);
    expect(edited.changedCells).toBe(1);
    proceed();
    expect((await confirming).status).toBe(200);
  } finally {
    proceed(); await confirming; spy.mockRestore();
    await pool.query("DELETE FROM reservations; DELETE FROM guests; DELETE FROM rate_calendar_entries;");
  }
});
