import express from "express";
import http from "node:http";
import { randomUUID } from "node:crypto";
import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { db } from "../db";
import { storage } from "../db-storage";
import {
  guests,
  roomTypes,
  rooms,
  reservations,
  accountMovements,
} from "@shared/schema";
import { eq, inArray } from "drizzle-orm";

const prefix = `inactive-search-${randomUUID()}`;
const inactiveId = `${prefix}-inactive`,
  activeId = `${prefix}-active`;
const groupId = `${prefix}-group`,
  reservationId = `${prefix}-reservation`,
  movementId = `${prefix}-movement`;
const oldIds = Array.from({ length: 25 }, (_, i) => `${prefix}-old-${i}`);
const allIds = [...oldIds, inactiveId, activeId, groupId];
let server: http.Server, base: string;
const suite = process.env.DATABASE_URL ? describe : describe.skip;
async function get(path: string) {
  const response = await fetch(base + path);
  expect(response.status).toBe(200);
  return response.json();
}

suite("Inactive guests: selection searches and historical references", () => {
  beforeAll(async () => {
    if (
      process.env.NODE_ENV === "production" ||
      !["localhost", "127.0.0.1"].includes(
        new URL(process.env.DATABASE_URL!).hostname,
      )
    )
      throw new Error("Disposable local database required");
    await db.insert(guests).values([
      ...oldIds.map((id) => ({
        id,
        firstName: "Anterior",
        lastName: prefix,
        active: false,
      })),
      {
        id: inactiveId,
        firstName: "Anterior",
        lastName: prefix,
        active: false,
        documentNumber: `${prefix}-dni`,
        email: `${prefix}@example.invalid`,
        phone: `${prefix}-phone`,
        cuilCuit: `${prefix}-cuit`,
      },
      { id: activeId, firstName: "Actual", lastName: prefix, active: true },
      {
        id: groupId,
        firstName: "Grupo",
        lastName: prefix,
        active: true,
        codigo: `GROUP-${prefix}`,
      },
    ]);
    await db
      .insert(roomTypes)
      .values({ id: prefix, code: prefix, name: "Prueba" });
    await db
      .insert(rooms)
      .values({ id: prefix, roomNumber: prefix, roomTypeId: prefix });
    await db.insert(reservations).values({
      id: reservationId,
      reservationCode: reservationId,
      createdAt: new Date(),
      guestId: activeId,
      roomId: prefix,
      roomTypeId: prefix,
      checkInDate: "2025-04-01",
      checkOutDate: "2025-04-02",
      nights: 1,
      status: "checked_out",
    });
    await db.insert(accountMovements).values({
      id: movementId,
      entityType: "guest",
      entityId: activeId,
      date: "2025-04-02",
      description: "Cargo histórico de prueba",
      amount: "125.00",
      type: "cargo",
    });
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      req.user = { id: prefix, username: "synthetic", role: "admin" } as any;
      req.isAuthenticated = () => true;
      next();
    });
    (await import("../routes/guests")).registerGuestsRoutes(app);
    (await import("../routes/spa")).registerSpaRoutes(app);
    server = http.createServer(app);
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve),
    );
    base = `http://127.0.0.1:${(server.address() as any).port}`;
  });
  afterAll(async () => {
    if (server)
      await new Promise<void>((resolve) => server.close(() => resolve()));
    await db
      .delete(accountMovements)
      .where(eq(accountMovements.id, movementId));
    await db.delete(reservations).where(eq(reservations.id, reservationId));
    await db.delete(rooms).where(eq(rooms.id, prefix));
    await db.delete(roomTypes).where(eq(roomTypes.id, prefix));
    await db.delete(guests).where(inArray(guests.id, allIds));
  });
  it("filters inactive guests before the result limit and continues hiding group placeholders", async () => {
    const result = await get(
      `/api/guests/search?q=${encodeURIComponent(prefix)}`,
    );
    expect(result.map((g: any) => g.id)).toEqual([activeId]);
    expect(
      (await storage.searchGuests(`${prefix} Actual`)).map((g) => g.id),
    ).toEqual([activeId]);
  });
  it.each([
    `${prefix}-dni`,
    `${prefix}@example.invalid`,
    `${prefix}-phone`,
    `${prefix}-cuit`,
    `${prefix} Anterior`,
  ])("does not offer an inactive guest by %s", async (query) => {
    expect(
      await get(`/api/guests/search?q=${encodeURIComponent(query)}`),
    ).toEqual([]);
  });
  it("also filters the SPA client search while keeping the full reference list", async () => {
    const result = await get(
      `/api/spa/clients?search=${encodeURIComponent(prefix)}`,
    );
    expect(result.map((g: any) => g.id)).toEqual([activeId]);
    const all = await get("/api/spa/clients");
    expect(all.some((g: any) => g.id === inactiveId)).toBe(true);
  });
  it("deactivation removes future search results without changing previous stays or account balances", async () => {
    const statisticsBefore = await get(
      "/api/reports/indec?from=2025-04-01&to=2025-04-03",
    );
    const response = await fetch(`${base}/api/guests/${activeId}/deactivate`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    expect(response.status).toBe(200);
    expect(await storage.searchGuests(prefix)).toEqual([]);
    expect((await get(`/api/guests/${activeId}`)).active).toBe(false);
    expect((await storage.getGuests()).some((g) => g.id === activeId)).toBe(
      true,
    );
    expect((await storage.getReservation(reservationId))?.guest?.id).toBe(
      activeId,
    );
    const account = await get(`/api/guests/${activeId}/account`);
    expect(Number(account.balance)).toBe(125);
    expect(account.movements.some((m: any) => m.id === movementId)).toBe(true);
    expect(
      await get("/api/reports/indec?from=2025-04-01&to=2025-04-03"),
    ).toEqual(statisticsBefore);
  });
});
