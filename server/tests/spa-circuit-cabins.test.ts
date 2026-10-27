import express from "express";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Server } from "node:http";

const state = vi.hoisted(() => ({
  cabin: {
    id: "massage-room",
    name: "Gabinete Agua",
    isActive: "true",
    resourceType: null as string | null,
  },
  saved: [] as any[],
  occupied: [] as Array<{ start_time: string; end_time: string }>,
  selections: [] as any[][],
}));
vi.mock("../db-storage", () => ({
  storage: {},
  getArgentinaToday: () => "2026-10-27",
}));
vi.mock("../db", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: async () => state.selections.shift() || [state.cabin],
      }),
    }),
    execute: async () => ({ rows: state.occupied }),
    transaction: async (callback: any) =>
      callback({
        select: () => ({
          from: () => ({
            where: async () => [{ id: "circuit", isCircuit: true }],
          }),
        }),
        delete: () => ({ where: async () => {} }),
        insert: () => ({
          values: (values: any[]) => ({
            returning: async () => {
              state.saved = values;
              return values;
            },
          }),
        }),
      }),
  },
  pool: { query: vi.fn(), connect: vi.fn() },
}));
vi.mock("../auth", () => ({
  requireAuth: (_req: any, _res: any, next: any) => next(),
  requirePermission: () => (_req: any, _res: any, next: any) => next(),
}));
vi.mock("../permissions", () => ({ hasPermission: () => true }));
const { registerSpaRoutes } = await import("../routes/spa");
let server: Server;
let origin: string;
beforeEach(async () => {
  state.cabin = {
    id: "massage-room",
    name: "Gabinete Agua",
    isActive: "true",
    resourceType: null,
  };
  state.saved = [];
  state.occupied = [];
  state.selections = [];
  const app = express();
  app.use(express.json());
  registerSpaRoutes(app);
  server = await new Promise<Server>((resolve) => {
    const instance = app.listen(0, "127.0.0.1", () => resolve(instance));
  });
  origin = `http://127.0.0.1:${(server.address() as any).port}`;
});
afterEach(async () => {
  server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
});
const save = (resources: unknown[]) =>
  fetch(`${origin}/api/spa/treatments/circuit/resources`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ resources }),
  });
describe("Ordinary active cabins in SPA circuits", () => {
  it("saves multiple ordinary cabin resources without requiring a special resourceType", async () => {
    const response = await save([
      { defaultCabinId: "massage-room", durationMinutes: 60 },
      { defaultCabinId: "massage-room", durationMinutes: 45 },
    ]);
    expect(response.status).toBe(200);
    expect(state.saved).toEqual([
      {
        treatmentId: "circuit",
        defaultCabinId: "massage-room",
        resourceTreatmentId: null,
        durationMinutes: 60,
        sortOrder: 0,
      },
      {
        treatmentId: "circuit",
        defaultCabinId: "massage-room",
        resourceTreatmentId: null,
        durationMinutes: 45,
        sortOrder: 1,
      },
    ]);
  });
  it("still rejects inactive or missing cabins", async () => {
    state.cabin.isActive = "false";
    expect(
      (await save([{ defaultCabinId: "massage-room", durationMinutes: 60 }]))
        .status,
    ).toBe(400);
    state.selections = [[]];
    expect(
      (await save([{ defaultCabinId: "missing", durationMinutes: 60 }])).status,
    ).toBe(400);
    expect(state.saved).toEqual([]);
  });
  it("calculates availability for ordinary cabins and excludes occupied intervals", async () => {
    state.occupied = [{ start_time: "09:00", end_time: "10:00" }];
    const response = await fetch(
      `${origin}/api/spa/resource-availability?date=2026-10-28&cabinId=massage-room&durationMinutes=60`,
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.slots).toContain("08:00");
    expect(body.slots).toContain("10:00");
    expect(body.slots).not.toContain("08:30");
    expect(body.slots).not.toContain("09:00");
    expect(body.slots).not.toContain("09:30");
  });
  it("does not offer availability for inactive cabins", async () => {
    state.cabin.isActive = "false";
    expect(
      (
        await fetch(
          `${origin}/api/spa/resource-availability?date=2026-10-28&cabinId=massage-room&durationMinutes=60`,
        )
      ).status,
    ).toBe(400);
  });
});
