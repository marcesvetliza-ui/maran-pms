import express from "express";
import type { Server } from "node:http";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  reservation: {} as any,
}));

const storage = {
  generateReservationCode: vi.fn(() => "RES-ZERO"),
  checkOverbooking: vi.fn(async () => false),
  createReservation: vi.fn(async (data: any) => ({ id: "reservation-zero", ...data })),
  getReservation: vi.fn(async () => state.reservation),
  updateReservation: vi.fn(async (_id: string, patch: any) => {
    state.reservation = { ...state.reservation, ...patch };
    return state.reservation;
  }),
  getRoom: vi.fn(),
  createCharge: vi.fn(),
};

vi.mock("../db-storage", () => ({
  storage,
  getArgentinaToday: () => "2026-09-11",
}));
vi.mock("../db", () => ({
  db: {
    insert: vi.fn(() => ({ values: vi.fn(() => Promise.resolve()) })),
    update: vi.fn(() => ({ set: vi.fn(() => ({ where: vi.fn(() => Promise.resolve()) })) })),
    execute: vi.fn(async () => ({ rows: [] })),
    select: vi.fn(),
    transaction: vi.fn(),
  },
  pool: { query: vi.fn(), connect: vi.fn() },
}));
vi.mock("../auth", () => ({ requireAuth: (_req: any, _res: any, next: () => void) => next() }));
vi.mock("../billing/invoiceService", () => ({ emitirFactura: vi.fn() }));
vi.mock("../billing/invoicePdf", () => ({ generarResumenCuentaPDF: vi.fn() }));
vi.mock("../billing/billingConfig", () => ({ getBillingConfig: vi.fn() }));
vi.mock("../audit", () => ({ audit: vi.fn() }));
vi.mock("../email-service", () => ({ sendCheckoutEmail: vi.fn(), sendConfirmationEmail: vi.fn() }));
vi.mock("../utils/assetPath", () => ({ assetPath: (value: string) => value }));
vi.mock("../migrate", () => ({ assertFinancialSchemaReady: vi.fn() }));

const { registerReservationsRoutes } = await import("../routes/reservations");

async function withServer(run: (baseUrl: string) => Promise<void>) {
  const app = express();
  app.use(express.json());
  registerReservationsRoutes(app);
  const server = await new Promise<Server>((resolve) => {
    const instance = app.listen(0, "127.0.0.1", () => resolve(instance));
  });
  const address = server.address();
  const baseUrl = `http://127.0.0.1:${typeof address === "object" && address ? address.port : 0}`;
  try {
    await run(baseUrl);
  } finally {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
}

async function request(baseUrl: string, method: "POST" | "PATCH", body: Record<string, unknown>) {
  const url = method === "POST"
    ? `${baseUrl}/api/reservations`
    : `${baseUrl}/api/reservations/reservation-zero`;
  const response = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: response.status, body: await response.json() as any };
}

const baseReservation = {
  id: "reservation-zero",
  reservationCode: "RES-ZERO",
  guestId: "guest-1",
  roomId: "room-1",
  roomTypeId: "room-type-1",
  checkInDate: "2030-01-01",
  checkOutDate: "2030-01-02",
  nights: 1,
  finalRatePerNight: "1000",
  totalRoomAmount: "1000",
  status: "confirmed",
  notes: "Observación",
  specialRateReason: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  state.reservation = { ...baseReservation };
});

describe("reservation zero-rate API guard", () => {
  it("rejects POST and PATCH with a zero rate but no reason before writing", async () => {
    await withServer(async (baseUrl) => {
      const post = await request(baseUrl, "POST", {
        ...baseReservation,
        id: undefined,
        finalRatePerNight: "0",
        totalRoomAmount: "0",
        specialRateReason: "",
        status: "pending",
      });
      expect(post.status).toBe(400);
      expect(post.body.error).toMatch(/motivo/i);
      expect(storage.createReservation).not.toHaveBeenCalled();

      const patch = await request(baseUrl, "PATCH", {
        finalRatePerNight: "0",
        totalRoomAmount: "0",
      });
      expect(patch.status).toBe(400);
      expect(patch.body.error).toMatch(/motivo/i);
      expect(storage.updateReservation).not.toHaveBeenCalled();
    });
  });

  it("persists a trimmed reason and one visible tag for POST and PATCH", async () => {
    await withServer(async (baseUrl) => {
      const post = await request(baseUrl, "POST", {
        ...baseReservation,
        id: undefined,
        finalRatePerNight: "0",
        totalRoomAmount: "0",
        specialRateReason: "  Cortesía gerencia  ",
        notes: "[Tarifa $0: Anterior] Observación",
        status: "pending",
      });
      expect(post.status).toBe(201);
      expect(storage.createReservation).toHaveBeenCalledWith(expect.objectContaining({
        specialRateReason: "Cortesía gerencia",
        notes: "[Tarifa $0: Cortesía gerencia] Observación",
      }));

      const patch = await request(baseUrl, "PATCH", {
        finalRatePerNight: "0",
        totalRoomAmount: "0",
        specialRateReason: " Canje comercial ",
      });
      expect(patch.status).toBe(200);
      expect(storage.updateReservation).toHaveBeenCalledWith(
        "reservation-zero",
        expect.objectContaining({
          specialRateReason: "Canje comercial",
          notes: "[Tarifa $0: Canje comercial] Observación",
        }),
      );
    });
  });

  it("rejects explicit null rate and explicit null reason before updating", async () => {
    await withServer(async (baseUrl) => {
      const nullRate = await request(baseUrl, "PATCH", { finalRatePerNight: null });
      expect(nullRate.status).toBe(400);
      expect(storage.updateReservation).not.toHaveBeenCalled();

      state.reservation = { ...baseReservation, finalRatePerNight: "0", specialRateReason: "Viejo motivo" };
      const nullReason = await request(baseUrl, "PATCH", { specialRateReason: null });
      expect(nullReason.status).toBe(400);
      expect(storage.updateReservation).not.toHaveBeenCalled();
    });
  });

  it("validates a reason-only patch against the persisted effective rate", async () => {
    await withServer(async (baseUrl) => {
      state.reservation = { ...baseReservation, finalRatePerNight: "0", specialRateReason: null };
      const missing = await request(baseUrl, "PATCH", { notes: "sin motivo" });
      expect(missing.status).toBe(400);
      expect(storage.updateReservation).not.toHaveBeenCalled();

      const valid = await request(baseUrl, "PATCH", { specialRateReason: " Cortesía " });
      expect(valid.status).toBe(200);
      expect(storage.updateReservation).toHaveBeenCalled();
    });
  });
});