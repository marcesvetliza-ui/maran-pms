import express from "express";
import * as http from "node:http";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// Never infer permission to modify a database from ambient DATABASE_URL.
const testUrl = process.env.RESERVATION_FLOW_TEST_DATABASE_URL;
if (testUrl) {
  const parsed = new URL(testUrl);
  if (parsed.hostname !== "127.0.0.1"
      || !parsed.pathname.startsWith("/reservation_flow_test")
      || process.env.DATABASE_URL !== testUrl) {
    throw new Error("Operational flow tests require their explicitly opted-in, disposable local database.");
  }
}
const runIsolated = testUrl ? describe : describe.skip;
let testPool: pg.Pool;
let server: http.Server | undefined;
let baseUrl = "";
let cookie = "";
const username = `flow-${randomUUID()}`;
const password = randomUUID(); // Synthetic, only used in this disposable test.
const realFetch = globalThis.fetch;

async function api(method: string, path: string, body?: unknown) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(cookie ? { Cookie: cookie } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const setCookie = response.headers.get("set-cookie");
  if (setCookie) cookie = setCookie.split(";")[0];
  return { status: response.status, body: await response.json() };
}

runIsolated("Reservation circuit in disposable PostgreSQL, through real authenticated API", () => {
  beforeAll(async () => {
    vi.stubEnv("SESSION_SECRET", randomUUID());
    vi.stubEnv("AI_INTEGRATIONS_OPENAI_API_KEY", "unused-isolated-test");
    vi.stubEnv("AI_INTEGRATIONS_OPENAI_BASE_URL", "http://127.0.0.1:1");
    vi.stubEnv("OPENAI_API_KEY", "unused-isolated-test");
    vi.spyOn(globalThis, "fetch").mockImplementation((input, init) => {
      const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
      if (url.hostname !== "127.0.0.1") throw new Error("External fetch is prohibited in isolated financial tests.");
      return realFetch(input, init);
    });
    testPool = new pg.Pool({ connectionString: testUrl, max: 3 });
    // Only the disposable database's empty session table is removed, to prove
    // setupAuth itself supports the first login without manual provisioning.
    expect((await testPool.query("SELECT count(*) FROM sessions")).rows[0].count).toBe("0");
    await testPool.query("DROP TABLE sessions");
    const { setupAuth, hashPassword } = await import("../auth");
    await testPool.query(
      `INSERT INTO system_users (id, username, password, email, full_name, role, is_active, created_at)
       VALUES ($1, $2, $3, 'flow@example.invalid', 'Isolated validation', 'admin', 'true', NOW())`,
      [randomUUID(), username, await hashPassword(password)],
    );
    const { verifyFinancialSchema } = await import("../migrate");
    expect((await verifyFinancialSchema()).ready).toBe(true);
    const app = express();
    app.use(express.json());
    setupAuth(app);
    server = http.createServer(app);
    const { registerRoutes } = await import("../routes");
    await registerRoutes(server, app);
    app.use((error: any, _req: any, res: any, _next: any) => {
      res.status(error.statusCode ?? error.status ?? 500).json({ error: error.message });
    });
    await new Promise<void>((resolve) => server!.listen(0, "127.0.0.1", resolve));
    baseUrl = `http://127.0.0.1:${(server.address() as import("node:net").AddressInfo).port}`;
  }, 60_000);

  afterAll(async () => {
    if (server) {
      server.closeAllConnections();
      await new Promise<void>((resolve) => server!.close(() => resolve()));
    }
    await testPool?.end();
    const { pool } = await import("../db");
    await pool.end();
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("first login creates sessions; concurrent bootstrap preserves the saved session", async () => {
    expect((await api("GET", "/api/auth/me")).status).toBe(401);
    const login = await api("POST", "/api/auth/login", { username, password });
    expect(login.status).toBe(200);
    expect((await api("GET", "/api/auth/me")).body.username).toBe(username);
    const before = Number((await testPool.query("SELECT count(*) FROM sessions")).rows[0].count);
    expect(before).toBeGreaterThan(0);
    const { ensureSessionStoreSchema } = await import("../sessionStoreSchema");
    await Promise.all(Array.from({ length: 4 }, () => ensureSessionStoreSchema(testPool)));
    expect(Number((await testPool.query("SELECT count(*) FROM sessions")).rows[0].count)).toBe(before);
    expect((await testPool.query("SELECT to_regclass('sessions_expire_idx') IS NOT NULL AS present")).rows[0].present).toBe(true);
    expect((await api("GET", "/api/auth/me")).status).toBe(200);
  });

  it("voids the mistaken $5,000 once; cash void plus transfer leaves both balances zero", async () => {
    const guestId = randomUUID();
    const typeId = randomUUID();
    const roomId = randomUUID();
    const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Argentina/Buenos_Aires" });
    const nextDate = new Date(`${today}T12:00:00-03:00`);
    nextDate.setUTCDate(nextDate.getUTCDate() + 1);
    const tomorrow = nextDate.toISOString().slice(0, 10);
    await testPool.query("INSERT INTO guests (id, first_name, last_name) VALUES ($1, 'Isolated', 'Guest')", [guestId]);
    await testPool.query("INSERT INTO room_types (id, code, name) VALUES ($1, $2, 'Isolated room type')", [typeId, `flow-${typeId}`]);
    await testPool.query("INSERT INTO rooms (id, room_number, room_type_id, status) VALUES ($1, $2, $3, 'available')",
      [roomId, `flow-${roomId}`, typeId]);
    const init = await api("POST", "/api/cash/init-shifts");
    expect(init.status).toBe(200);
    const { storage } = await import("../db-storage");
    const shift = await storage.getCurrentShift("reception");
    expect(shift?.area).toBe("recepcion");
    expect((await api("POST", "/api/cash/shifts/open", { area: "reception" })).status).toBe(400);
    const created = await api("POST", "/api/reservations", {
      guestId, roomTypeId: typeId, roomId, checkInDate: today, checkOutDate: tomorrow,
      finalRatePerNight: "100000.00", totalRoomAmount: "100000.00", numberOfGuests: 1,
      status: "confirmed", source: "directo",
    });
    expect(created.status, JSON.stringify(created.body)).toBe(201);
    const reservationId = created.body.id;
    expect((await api("POST", `/api/reservations/${reservationId}/check-in`, {})).status).toBe(200);
    expect((await api("POST", "/api/charges", {
      reservationId, amount: "20000.00", description: "Isolated consumption", category: "restaurant", date: today,
    })).status).toBe(201);
    const wrongCharge = await api("POST", "/api/charges", {
      reservationId, amount: "5000.00", description: "Mistaken manual extra", category: "otros", date: today,
    });
    expect(wrongCharge.status).toBe(201);
    const voidPath = `/api/charges/${wrongCharge.body.id}/anular`;
    expect((await api("PATCH", voidPath, { motivoAnulacion: "Entered in error" })).status).toBe(200);
    expect((await api("PATCH", voidPath, { motivoAnulacion: "Retry" })).status).toBe(400);
    const generalFolio = async () => (await testPool.query(
      "SELECT total_charges::text, total_payments::text, balance::text FROM folios WHERE entity_type = 'reservation' AND entity_id = $1",
      [reservationId],
    )).rows[0];
    expect(await generalFolio()).toMatchObject({ total_charges: "120000.00", balance: "120000.00" });
    const cash = await api("POST", "/api/payments", { reservationId, amount: "120000.00", method: "efectivo", date: today });
    expect(cash.status, JSON.stringify(cash.body)).toBe(201);
    expect(await generalFolio()).toMatchObject({ balance: "0.00" });
    expect((await testPool.query("SELECT shift_id FROM cash_movements WHERE payment_id = $1", [cash.body.id])).rows[0].shift_id).toBe(shift!.id);
    expect((await api("PATCH", `/api/payments/${cash.body.id}/anular`, { motivoAnulacion: "Replace with transfer" })).status).toBe(200);
    expect(await generalFolio()).toMatchObject({ balance: "120000.00" });
    const transfer = await api("POST", "/api/payments", { reservationId, amount: "120000.00", method: "transferencia", date: today });
    expect(transfer.status, JSON.stringify(transfer.body)).toBe(201);
    expect(await generalFolio()).toMatchObject({ total_charges: "120000.00", balance: "0.00" });
    const checkout = await api("POST", `/api/reservations/${reservationId}/check-out`, {});
    expect(checkout.status, JSON.stringify(checkout.body)).toBe(200);
    expect((await storage.getReservation(reservationId))?.status).toBe("checked_out");
    expect((await storage.getRoom(roomId))?.status).toBe("dirty");
    expect(await generalFolio()).toMatchObject({ balance: "0.00" });
    const operationalFolio = await api("GET", `/api/reservations/${reservationId}/folio`);
    expect(operationalFolio.status).toBe(200);
    expect(Number(operationalFolio.body.balance)).toBe(0);
    const closing = await api("POST", `/api/cash/shifts/${shift!.id}/close`, {
      closedBy: username, efectivoContado: 0, enviarAAdministracion: false,
    });
    expect(closing.status, JSON.stringify(closing.body)).toBe(200);
    expect((await storage.getCashShifts("reception", "closed")).some(s => s.id === shift!.id)).toBe(true);
    const summary = (await testPool.query("SELECT * FROM cash_closing_summaries WHERE shift_id = $1", [shift!.id])).rows[0];
    expect(Number(summary.total_cash)).toBe(0);
    expect(Number(summary.total_transfer)).toBe(120000);
    expect(Number(summary.total_general)).toBe(120000);
  }, 30_000);
});