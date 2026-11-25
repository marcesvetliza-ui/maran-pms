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
import { BOOKING_ENGINE_SCHEMA_SQL, ensureBookingEngineSchema } from "../bookingEngineSchema";
import { rateCalendarSchemaSql } from "../rates/calendarSchema";
import { ensureChannexAriSchema } from "../channex/ariSchema";
import { buildAriValues } from "../channex/ari";
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
  await ensureBookingEngineSchema();
  await ensureBookingEngineSchema(); // Same additive startup hook, idempotent.
  await pool.query(rateCalendarSchemaSql);
  // The script owns this fresh synthetic database; files never share fixtures.
  await pool.query("TRUNCATE rooms,reservations,guests,rate_plans,room_types,groups,group_room_blocks,group_reservation_links,maintenance_blocks,audit_logs,booking_engine_sales CASCADE");
  await pool.query(BOOKING_ENGINE_SCHEMA_SQL);
  await pool.query("INSERT INTO room_types(id,code,name,base_occupancy,max_occupancy,show_in_booking) VALUES($1,'SYN','Synthetic room',2,2,true)", [typeId]);
  await pool.query("INSERT INTO rooms(id,room_number,room_type_id,floor,status) VALUES($1,'SYN-1',$2,1,'available')", [roomId, typeId]);
  await pool.query("INSERT INTO rate_plans(id,name,room_type_id,base_rate,rate_2pax,currency) VALUES($1,'Rack',$2,100000,120000,'ARS'),($3,'Cheaper internal plan',$2,1,1,'ARS')", [planId, typeId, otherPlan]);
  const app = express();
  app.use(express.json({ limit: "1mb" }));
  app.use((req: any, _res, next) => { req.user = { id: "synthetic-reviewer", role: req.headers["x-role"] }; req.isAuthenticated = () => !!req.headers["x-role"]; next(); });
  registerPublicBookingRoutes(app);
  server = app.listen(0, "127.0.0.1");
  await new Promise<void>(resolve => server.once("listening", resolve));
  base = `http://127.0.0.1:${(server.address() as any).port}`;
});
afterAll(async () => {
  if (server) { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
  await pool.end();
});
it("keeps sales disabled by default, even after configuration or repeated migration", async () => {
  expect((await pool.query("SELECT enabled FROM booking_engine_sales")).rows[0].enabled).toBe(false);
  expect((await post(path + "/booking-config", config, "PATCH", "admin")).status).toBe(200);
  expect((await post(path + "/booking-config", { ...config, salesEnabled: true }, "PATCH", "admin")).status).toBe(400);
  await pool.query(BOOKING_ENGINE_SCHEMA_SQL);
  const request = { ...stay, roomTypeId: typeId, ratePlanId: planId, expectedTotalAmount: 216000,
    firstName: "Synthetic", lastName: "Disabled", email: "disabled@example.invalid" };
  for (const response of [await fetch(base + "/api/public/booking/availability?" + new URLSearchParams({ ...stay, adults: "2" })),
    await post("/api/public/booking/confirm", request)]) {
    expect(response.status).toBe(503);
    expect((await response.json()).code).toBe("BOOKING_SALES_DISABLED");
  }
  expect((await pool.query("SELECT count(*)::int AS n FROM guests")).rows[0].n).toBe(0);
  expect((await pool.query("SELECT count(*)::int AS n FROM reservations")).rows[0].n).toBe(0);
  const admin = await fetch(base + "/api/admin/booking-engine/config", { headers: { "x-role": "admin" } });
  expect((await admin.json()).salesEnabled).toBe(false);
  await pool.query("DELETE FROM booking_engine_sales");
  expect((await post("/api/public/booking/confirm", request)).status).toBe(503);
  await pool.query(BOOKING_ENGINE_SCHEMA_SQL);
  await pool.query("DELETE FROM booking_engine_configs");
});
it("does not automatically expose any of the existing plans", async () => {
  // Synthetic fixture only. No production API or UI can activate public sales.
  await pool.query("UPDATE booking_engine_sales SET enabled=true WHERE singleton=true");
  await pool.query(BOOKING_ENGINE_SCHEMA_SQL);
  expect((await pool.query("SELECT enabled FROM booking_engine_sales")).rows[0].enabled).toBe(true);
  expect(await availability()).toEqual([]);
  expect((await post(path + "/booking-config", config, "PATCH", "admin")).status).toBe(200);
  const result = await availability();
  expect(result).toHaveLength(1);
  expect(result[0]).toMatchObject({ ratePlanId: planId, totalPrice: 216000 });
  expect((await pool.query("SELECT rate_2pax FROM rate_plans WHERE id=$1", [planId])).rows[0].rate_2pax).toBe("120000.00");
});
it("inherits stop-sell, arrival/departure closures, minimum/maximum and validity from the same calendar", async () => {
  for (const [day, field, value] of [
    [stay.checkIn, "stop_sell", true], ["2091-01-03", "stop_sell", true],
    [stay.checkIn, "closed_to_arrival", true], [stay.checkOut, "closed_to_departure", true],
    [stay.checkIn, "min_stay_arrival", 3], ["2091-01-03", "min_stay_through", 3],
    [stay.checkIn, "max_stay", 1],
  ] as const) {
    await pool.query(`INSERT INTO rate_calendar_entries(rate_plan_id,stay_date,${field}) VALUES($1,$2,$3)`, [planId, day, value]);
    expect(await availability(), field).toEqual([]);
    await pool.query("DELETE FROM rate_calendar_entries");
  }
  await pool.query("UPDATE rate_plans SET valid_to='2091-01-02' WHERE id=$1", [planId]);
  expect(await availability()).toEqual([]);
  await pool.query("UPDATE rate_plans SET valid_to=null WHERE id=$1", [planId]);
});
it("respects dated maintenance, inactive and virtual rooms", async () => {
  await pool.query("INSERT INTO maintenance_blocks(room_id,block_from,block_to,blocked_by) VALUES($1,'2091-01-01','2091-01-02','Synthetic')", [roomId]);
  expect(await availability()).toEqual([]);
  await pool.query("DELETE FROM maintenance_blocks");
  for (const field of ["is_active=false", "is_virtual=true"]) {
    await pool.query(`UPDATE rooms SET ${field} WHERE id=$1`, [roomId]);
    expect(await availability()).toEqual([]);
    await pool.query("UPDATE rooms SET is_active=true,is_virtual=false WHERE id=$1", [roomId]);
  }
});
it("does not override confirmed or tentative group commitments", async () => {
  const group = randomUUID();
  await pool.query("INSERT INTO groups(id,group_code,name,check_in_date,check_out_date,status,created_at) VALUES($1,'SYN-G','Synthetic group',$2,$3,'confirmed',now())", [group, stay.checkIn, stay.checkOut]);
  await pool.query("INSERT INTO group_room_blocks(group_id,room_type_id,quantity) VALUES($1,$2,1)", [group, typeId]);
  for (const status of ["confirmed", "inhouse", "tentative", "blocked"]) {
    await pool.query("UPDATE groups SET status=$1 WHERE id=$2", [status, group]);
    expect(await availability(), status).toEqual([]);
  }
  await pool.query("DELETE FROM group_room_blocks WHERE group_id=$1", [group]);
  await pool.query("DELETE FROM groups WHERE id=$1", [group]);
  expect(await availability()).toHaveLength(1);
});
it("stores bounded photos durably and does not expose unlinked drafts or removed photos", async () => {
  // Valid synthetic 1x1 white JPEG, never a hotel/guest image.
  const jpeg = Buffer.from("/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAMCAgICAgMCAgIDAwMDBAYEBAQEBAgGBgUGCQgKCgkICQkKDA8MCgsOCwkJDRENDg8QEBEQCgwSExIQEw8QEBD/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AVN//2Q==", "base64");
  const response = await post(path + "/booking-photos", { imageData: `data:image/jpeg;base64,${jpeg.toString("base64")}` }, "POST", "admin");
  expect(response.status).toBe(201);
  const { url } = await response.json();
  expect((await fetch(base + url)).status).toBe(404);
  expect((await post(path + "/booking-config", { ...config, photos: [url] }, "PATCH", "admin")).status).toBe(200);
  const image = await fetch(base + url);
  expect(image.status).toBe(200);
  expect(image.headers.get("content-type")).toContain("image/jpeg");
  expect(image.headers.get("x-content-type-options")).toBe("nosniff");
  expect(Buffer.from(await image.arrayBuffer())).toEqual(jpeg);
  expect((await post(path + "/booking-config", config, "PATCH", "admin")).status).toBe(200);
  expect((await fetch(base + url)).status).toBe(404);
});
it("online configuration and quoting preserve OTA plans, restrictions, mappings, activation and outbox", async () => {
  await ensureChannexAriSchema(pool);
  const connectionId = randomUUID();
  await pool.query("INSERT INTO channex_connections(id,label,channex_property_id,base_url,is_active,created_at) VALUES($1,'Synthetic OTA','synthetic-property','https://staging.channex.io/api/v1',true,now())", [connectionId]);
  await pool.query("INSERT INTO channex_room_type_mappings(connection_id,channex_room_type_id,channex_room_type_title,room_type_id,created_at) VALUES($1,'synthetic-type','Synthetic',$2,now())", [connectionId, typeId]);
  await pool.query("INSERT INTO channex_rate_plan_mappings(connection_id,channex_room_type_id,channex_rate_plan_id,channex_rate_plan_title,rate_plan_id,created_at) VALUES($1,'synthetic-type','synthetic-plan','Synthetic',$2,now())", [connectionId, planId]);
  await pool.query("INSERT INTO channex_ari_settings(connection_id,enabled,capture_started_at,floor,currency) VALUES($1,true,now(),1,'ARS')", [connectionId]);
  const connection = { id: connectionId, channex_property_id: "synthetic-property", floor: 1, currency: "ARS", room_ids: [roomId] };
  const event = { id: "synthetic", kind: "restrictions" as const, date_from: stay.checkIn, date_to: stay.checkOut,
    room_type_id: typeId, rate_plan_id: planId, attempts: 0, reason: "rate_calendar:synthetic" };
  const snapshot = async () => {
    const result: Record<string, any> = {};
    for (const table of ["rate_plans", "rate_calendar_entries", "channex_connections", "channex_room_type_mappings",
      "channex_rate_plan_mappings", "channex_ari_settings", "channex_ari_outbox"])
      result[table] = (await pool.query(`SELECT * FROM ${table} ORDER BY 1`)).rows;
    result.otaValues = await buildAriValues(pool as any, connection, [event], new Date().toISOString().slice(0, 10));
    return result;
  };
  const before = await snapshot();
  expect(before.otaValues.length).toBeGreaterThan(0);
  expect((await post(path + "/booking-config", { ...config, discountPercent: 25 }, "PATCH", "admin")).status).toBe(200);
  expect((await availability())[0].totalPrice).toBe(180000);
  // Direct confirmation requests while paused must also leave OTA data untouched.
  await pool.query("UPDATE booking_engine_sales SET enabled=false");
  expect((await post("/api/public/booking/confirm", { ...stay, roomTypeId: typeId, ratePlanId: planId,
    expectedTotalAmount: 180000, firstName: "Synthetic", lastName: "Paused", email: "paused@example.invalid" })).status).toBe(503);
  expect(await snapshot()).toEqual(before);
  await pool.query("UPDATE booking_engine_sales SET enabled=true");
  expect((await post(path + "/booking-config", config, "PATCH", "admin")).status).toBe(200);
});
it("rolls guest and reservation creation back together if persistence fails", async () => {
  await pool.query(`CREATE FUNCTION synthetic_reject_booking() RETURNS trigger LANGUAGE plpgsql AS
    $$ BEGIN RAISE EXCEPTION 'Synthetic insert failure'; END $$;
    CREATE TRIGGER synthetic_reject_booking BEFORE INSERT ON reservations
    FOR EACH ROW EXECUTE FUNCTION synthetic_reject_booking();`);
  try {
    const response = await post("/api/public/booking/confirm", {
      ...stay, roomTypeId: typeId, ratePlanId: planId, expectedTotalAmount: 216000,
      firstName: "Synthetic", lastName: "Rollback", email: "rollback@example.invalid",
    });
    expect(response.status).toBe(500);
    expect(Number((await pool.query("SELECT count(*) FROM guests")).rows[0].count)).toBe(0);
    expect(Number((await pool.query("SELECT count(*) FROM reservations")).rows[0].count)).toBe(0);
  } finally {
    await pool.query("DROP TRIGGER synthetic_reject_booking ON reservations; DROP FUNCTION synthetic_reject_booking();");
  }
});
it("confirms exact nightly prices once and rejects sold out and stale/foreign plans before guest writes", async () => {
  await pool.query("INSERT INTO rate_calendar_entries(rate_plan_id,stay_date,occupancy_rates) VALUES($1,'2091-01-03','{\"2\":\"150000.01\"}')", [planId]);
  expect((await availability())[0]).toMatchObject({ totalPrice: 243000.01, variableNightlyRates: true });
  const body = { ...stay, roomTypeId: typeId, ratePlanId: planId, expectedTotalAmount: 243000.01,
    firstName: "Synthetic", lastName: "Review", email: "booking-test@example.invalid" };
  for (const patch of [{ expectedTotalAmount: 1 }, { ratePlanId: otherPlan }])
    expect((await post("/api/public/booking/confirm", { ...body, ...patch })).status).toBe(409);
  expect(Number((await pool.query("SELECT count(*) FROM guests")).rows[0].count)).toBe(0);
  const competing = await Promise.all([
    post("/api/public/booking/confirm", body),
    post("/api/public/booking/confirm", { ...body, email: "competing@example.invalid" }),
  ]);
  expect(competing.map(r => r.status).sort()).toEqual([200, 409]);
  const response = competing.find(r => r.status === 200)!;
  const json = await response.json();
  expect(response.status, JSON.stringify(json)).toBe(200);
  lastCode = json.reservationCode;
  const saved = (await pool.query("SELECT * FROM reservations WHERE reservation_code=$1", [lastCode])).rows[0];
  expect(saved.total_room_amount).toBe("243000.01");
  expect(saved.nightly_pricing).toEqual([
    { date: stay.checkIn, rateCents: 12000000, discountCents: 1200000 },
    { date: "2091-01-03", rateCents: 15000001, discountCents: 1500000 },
  ]);
  const audit = (await pool.query("SELECT details FROM audit_logs WHERE entity_id=$1 AND action='create'", [saved.id])).rows[0];
  expect(JSON.parse(audit.details).after.nightlyPricing).toEqual(saved.nightly_pricing);
  expect((await post("/api/public/booking/confirm", body)).status).toBe(409);
  expect(Number((await pool.query("SELECT count(*) FROM reservations")).rows[0].count)).toBe(1);
  expect(await availability()).toEqual([]);
});
