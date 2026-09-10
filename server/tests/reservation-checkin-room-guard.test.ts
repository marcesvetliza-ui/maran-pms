import express from "express";
import type { Server } from "node:http";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  reservation: {} as any,
  room: {} as any,
}));

const storage = {
  getReservation: vi.fn(async () => state.reservation),
  getRoom: vi.fn(async () => state.room),
  getReservations: vi.fn(async () => []),
  updateReservation: vi.fn(async (_id: string, patch: any) => {
    state.reservation = { ...state.reservation, ...patch };
    return state.reservation;
  }),
  updateRoom: vi.fn(async (_id: string, patch: any) => {
    state.room = { ...state.room, ...patch };
    return state.room;
  }),
  addFolioCharge: vi.fn(),
};

vi.mock("../db-storage", () => ({
  storage,
  getArgentinaToday: () => "2026-09-10",
}));
vi.mock("../db", () => ({
  db: {
    insert: vi.fn(() => ({ values: vi.fn(() => Promise.resolve()) })),
    update: vi.fn(() => ({ set: vi.fn(() => ({ where: vi.fn(() => Promise.resolve()) })) })),
    execute: vi.fn(),
    select: vi.fn(),
    transaction: vi.fn(),
  },
  pool: { query: vi.fn(), connect: vi.fn() },
}));
vi.mock("../auth", () => ({
  requireAuth: (req: any, res: any, next: () => void) => {
    if (req.headers["x-test-auth"] === "authenticated") {
      req.user = { id: "user-1", username: "recepcion", role: "staff" };
      return next();
    }
    return res.status(401).json({ error: "No autenticado" });
  },
}));
vi.mock("../billing/invoiceService", () => ({ emitirFactura: vi.fn() }));
vi.mock("../billing/invoicePdf", () => ({ generarResumenCuentaPDF: vi.fn() }));
vi.mock("../billing/billingConfig", () => ({ getBillingConfig: vi.fn() }));
vi.mock("../audit", () => ({ audit: vi.fn() }));
vi.mock("../email-service", () => ({ sendCheckoutEmail: vi.fn(), sendConfirmationEmail: vi.fn() }));
vi.mock("../utils/assetPath", () => ({ assetPath: (value: string) => value }));

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

async function checkIn(baseUrl: string, authenticated = true) {
  const response = await fetch(`${baseUrl}/api/reservations/reservation-1/check-in`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(authenticated ? { "x-test-auth": "authenticated" } : {}),
    },
    body: JSON.stringify({}),
  });
  return { status: response.status, body: await response.json() as any };
}

beforeEach(() => {
  vi.clearAllMocks();
  state.reservation = {
    id: "reservation-1",
    reservationCode: "RES-1",
    roomId: "room-1",
    checkInDate: "2026-09-10",
    nights: 1,
    totalRoomAmount: "0",
    earlyCheckInCharge: "0",
    lateCheckOutCharge: "0",
    guestId: null,
  };
  state.room = {
    id: "room-1",
    roomNumber: "REUB",
    status: "clean",
    isVirtual: true,
    isActive: true,
  };
});

describe("POST /api/reservations/:id/check-in room guard", () => {
  it("requires authentication before processing check-in", async () => {
    await withServer(async (baseUrl) => {
      const result = await checkIn(baseUrl, false);
      expect(result.status).toBe(401);
      expect(storage.getReservation).not.toHaveBeenCalled();
    });
  });

  it.each([
    ["REUB", { roomNumber: "REUB", isVirtual: false }],
    ["a virtual room", { roomNumber: "TEMP", isVirtual: true }],
  ])("rejects check-in while assigned to %s", async (_label, roomPatch) => {
    state.room = { ...state.room, ...roomPatch };
    await withServer(async (baseUrl) => {
      const result = await checkIn(baseUrl);
      expect(result.status).toBe(400);
      expect(result.body.code).toBe("CHECK_IN_REQUIRES_REAL_ROOM");
      expect(result.body.error).toMatch(/habitación real/i);
      expect(storage.updateReservation).not.toHaveBeenCalled();
      expect(storage.updateRoom).not.toHaveBeenCalled();
    });
  });

  it("allows check-in after moving the reservation to a real room", async () => {
    state.room = { ...state.room, roomNumber: "101", isVirtual: false };
    await withServer(async (baseUrl) => {
      const result = await checkIn(baseUrl);
      expect(result.status).toBe(200);
      expect(result.body).toEqual({ success: true });
      expect(storage.updateReservation).toHaveBeenCalledWith("reservation-1", { status: "checked_in" });
      expect(storage.updateRoom).toHaveBeenCalledWith("room-1", { status: "occupied" });
    });
  });
});