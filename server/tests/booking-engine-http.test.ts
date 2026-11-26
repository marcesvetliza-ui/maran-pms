import express from "express";
import type { Server } from "node:http";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
const mocks = vi.hoisted(() => ({
  execute: vi.fn(), select: vi.fn(), update: vi.fn(), quote: vi.fn(), available: vi.fn(),
  create: vi.fn(), future: vi.fn(), insert: vi.fn(),
  sales: vi.fn(),
}));
vi.mock("../db", () => ({ db: { execute: mocks.execute, select: mocks.select, update: mocks.update, insert: mocks.insert },
  pool: {}, withDatabaseTransaction: (run: any) => run(), withReadOnlyDatabaseTransaction: (run: any) => run(), withRepeatableReadDatabaseTransaction: (run: any) => run() }));
vi.mock("../permissions", () => ({ hasPermission: (role: string, permission: string) =>
  ["admin", "comercial", "reception"].includes(role) && permission === "sidebar:/admin/booking-engine" }));
vi.mock("../db-storage", () => ({ storage: { createReservation: mocks.create, generateReservationCode: () => "WEB-test" } }));
vi.mock("../bookingEngineService", () => ({ loadBookingQuote: mocks.quote, bookingAvailableRooms: mocks.available, assertFutureStay: mocks.future }));
vi.mock("../inventoryMutationLock", () => ({ withLodgingInventoryMutationLock: (run: any) => run() }));
vi.mock("../bookingEngineSales", () => ({ assertBookingSalesEnabled: mocks.sales, bookingSalesEnabled: async () => true }));
vi.mock("../nightlyPricingGuard", () => ({ withInitialNightlyQuote: (_lines: any, run: any) => run() }));
import { registerPublicBookingRoutes } from "../routes/publicBooking";
import { BookingRuleError } from "@shared/booking-engine";
let server: Server;
const dialect = new PgDialect();
let base: string;
const config = { ratePlanId: "rack", discountPercent: 10, publicDescription: null, amenities: null,
  photos: null, sortOrder: 0, showInBooking: true };
const confirmation = { checkIn: "2027-01-02", checkOut: "2027-01-04", adults: 2, roomTypeId: "double",
  ratePlanId: "rack", expectedTotalAmount: 180000, firstName: "Test", lastName: "Synthetic", email: "synthetic@example.invalid" };
beforeEach(async () => {
  vi.clearAllMocks();
  mocks.sales.mockResolvedValue(undefined);
  mocks.execute.mockResolvedValue({ rows: [] });
  mocks.quote.mockResolvedValue({ plan: { id: "rack" }, nights: 2, pricePerNight: 90000, totalAmount: 180000,
    discountPercent: 10, nightlyPricing: [{ date: "2027-01-02", rateCents: 10000000, discountCents: 1000000 }] });
  mocks.available.mockResolvedValue([{ id: "room", roomTypeId: "double" }]);
  const existing = { id: "existing-guest", firstName: "Original", lastName: "Unchanged" };
  mocks.select.mockImplementation(() => ({ from: () => ({ where: async () => [existing] }) }));
  mocks.create.mockResolvedValue({ reservationCode: "WEB-test" });
  const app = express();
  app.use(express.json());
  app.use((req: any, _res, next) => {
    req.user = { id: "user", role: req.headers["x-role"] };
    req.isAuthenticated = () => Boolean(req.headers["x-role"]);
    next();
  });
  registerPublicBookingRoutes(app);
  server = app.listen(0, "127.0.0.1");
  await new Promise<void>(resolve => server.once("listening", resolve));
  base = `http://127.0.0.1:${(server.address() as any).port}`;
});
afterEach(async () => { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); });
const send = (path: string, body: unknown, role?: string, method = "POST") => fetch(base + path, {
  method, headers: { "content-type": "application/json", ...(role ? { "x-role": role } : {}) }, body: JSON.stringify(body),
});

it("protects configuration and uploads with real authentication and permission middleware", async () => {
  for (const role of [undefined, "housekeeping"]) {
    expect((await fetch(base + "/api/admin/booking-engine/config", { headers: role ? { "x-role": role } : {} })).status).toBe(role ? 403 : 401);
    expect((await send("/api/admin/room-types/double/booking-config", config, role, "PATCH")).status).toBe(role ? 403 : 401);
    expect((await send("/api/admin/room-types/double/booking-photos", { imageData: "invalid" }, role)).status).toBe(role ? 403 : 401);
  }
  expect(mocks.execute).not.toHaveBeenCalled();
});
it("rejects invalid discounts and image content before database writes", async () => {
  expect((await send("/api/admin/room-types/double/booking-config", { ...config, discountPercent: 100 }, "admin", "PATCH")).status).toBe(400);
  expect((await send("/api/admin/room-types/double/booking-photos", { imageData: "data:image/jpeg;base64,PHN2Zz4=" }, "admin")).status).toBe(400);
  expect(mocks.execute).not.toHaveBeenCalled();
});
it("does not accept a plan from another category", async () => {
  mocks.execute.mockImplementation(async (query: any) => ({
    rows: dialect.sqlToQuery(query).sql.includes("FROM room_types") ? [{ id: "double" }] : [],
  }));
  expect((await send("/api/admin/room-types/double/booking-config", config, "admin", "PATCH")).status).toBe(400);
  expect(mocks.update).not.toHaveBeenCalled();
});
it.each([{ ratePlanId: "other-plan" }, { expectedTotalAmount: 1 }])("rejects a manipulated or stale confirmation %j", async patch => {
  const response = await send("/api/public/booking/confirm", { ...confirmation, ...patch });
  expect(response.status).toBe(409);
  expect(mocks.select).not.toHaveBeenCalled();
  expect(mocks.create).not.toHaveBeenCalled();
});
it("rechecks calendar restrictions at confirmation, before creating a guest or reservation", async () => {
  mocks.quote.mockRejectedValue(new BookingRuleError("Cierre de ventas"));
  expect((await send("/api/public/booking/confirm", confirmation)).status).toBe(409);
  expect(mocks.select).not.toHaveBeenCalled();
  expect(mocks.create).not.toHaveBeenCalled();
});
it("rejects sold-out dates without creating or modifying guests", async () => {
  mocks.available.mockResolvedValue([]);
  expect((await send("/api/public/booking/confirm", confirmation)).status).toBe(409);
  expect(mocks.select).not.toHaveBeenCalled();
  expect(mocks.create).not.toHaveBeenCalled();
});
it("confirms with the server quote and never overwrites an existing guest", async () => {
  const response = await send("/api/public/booking/confirm", confirmation);
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({ success: true, totalAmount: 180000 });
  expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({
    ratePlanId: "rack", totalRoomAmount: "180000.00", finalRatePerNight: "90000.00",
    guestId: "existing-guest", discountType: "percent", discountValue: "10",
  }));
  expect(mocks.update).not.toHaveBeenCalled();
});
it.each([{ checkOut: confirmation.checkIn }, { checkIn: "2027-02-30" }, { adults: 1.5 }, { expectedTotalAmount: undefined }])(
  "rejects invalid confirmation data %j", async patch => {
    expect((await send("/api/public/booking/confirm", { ...confirmation, ...patch })).status).toBe(400);
    expect(mocks.quote).not.toHaveBeenCalled();
    expect(mocks.create).not.toHaveBeenCalled();
  });
it('returns a retryable availability conflict when the confirmation snapshot becomes stale',async()=>{
 mocks.quote.mockRejectedValue(Object.assign(new Error('synthetic serialization'),{code:'40001'}));
 const response=await send('/api/public/booking/confirm',confirmation);expect(response.status).toBe(409);
 expect((await response.json()).error).toContain('Volvé a consultar');expect(mocks.create).not.toHaveBeenCalled();
});
it('requires authentication and motor configuration permission for changing its OTA reference',async()=>{
 for(const role of [undefined,'housekeeping'])expect((await send('/api/admin/booking-engine/ota-source',{connectionId:null},role,'PATCH')).status).toBe(role?403:401);
 expect(mocks.execute).not.toHaveBeenCalled();
 expect((await send('/api/admin/booking-engine/ota-source',{connectionId:null,salesEnabled:true},'admin','PATCH')).status).toBe(400);
 expect(mocks.execute).not.toHaveBeenCalled();
});
