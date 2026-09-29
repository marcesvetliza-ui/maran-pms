import express from "express";
import type { Server } from "node:http";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  reservation: {} as any,
  groupLinks: [] as any[],
  extraCap: 0,
  extraDirectPaid: 0,
  extraGroupFunds: 0,
  groupLodging: 100,
  extraConfig: "accommodation",
  authenticated: true,
}));

const storage = {
  getReservation: vi.fn(async () => state.reservation),
  getChargesTotal: vi.fn(async () => 0),
  getPaymentsTotal: vi.fn(async () => 0),
  getPayments: vi.fn(async () => []),
  updateReservation: vi.fn(async (_id: string, patch: any) => ({ ...state.reservation, ...patch })),
  updateRoom: vi.fn(async () => undefined),
  createCheckoutCleaningTask: vi.fn(async () => undefined),
  createReservationPaymentWithLedger: vi.fn(async ({ payment }: any) => {
    if (payment.notes?.includes("[personal_extras]")) {
      state.extraDirectPaid += Number(payment.amount) || 0;
    }
    return { id: "payment-test", ...payment };
  }),
  getCompany: vi.fn(),
  getAgency: vi.fn(),
  getGuest: vi.fn(),
};

const audit = vi.hoisted(() => vi.fn());

vi.mock("../db-storage", () => ({ storage, getArgentinaToday: () => "2026-09-11" }));
vi.mock("../db", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: async () => state.groupLinks,
      }),
    }),
    execute: async () => ({
      rows: [{
        extras: state.extraCap,
        direct_paid: state.extraDirectPaid,
        group_funds: state.extraGroupFunds,
        group_lodging: state.groupLodging,
        config: state.extraConfig,
      }],
    }),
    insert: vi.fn(),
    update: vi.fn(),
    transaction: vi.fn(),
  },
  pool: {
    connect: async () => ({
      query: async () => ({ rows: [] }),
      release: vi.fn(),
    }),
  },
}));
vi.mock("../auth", () => ({
  requireAuth: (req: any, res: any, next: () => void) => {
    if (!state.authenticated) return res.status(401).json({ error: "No autenticado" });
    req.user = { id: "operator-1", username: "operator-test" };
    next();
  },
}));
vi.mock("../audit", () => ({ audit }));
vi.mock("../billing/invoiceService", () => ({
  emitirFactura: vi.fn(),
  buildComprobanteAsociado: (doc: any) => ({
    tipo: String(doc?.tipo_comprobante ?? doc?.tipoComprobante ?? ""),
    puntoVenta: Number(doc?.punto_venta ?? doc?.puntoVenta ?? 0),
    numero: Number(doc?.numero ?? 0),
    fecha: String(doc?.fecha_emision ?? doc?.fechaEmision ?? "").replace(/-/g, ""),
  }),
}));
vi.mock("../billing/invoicePdf", () => ({ generarResumenCuentaPDF: vi.fn() }));
vi.mock("../billing/billingConfig", () => ({ getBillingConfig: vi.fn() }));
vi.mock("../email-service", () => ({ sendCheckoutEmail: vi.fn(async () => undefined), sendConfirmationEmail: vi.fn() }));
vi.mock("../utils/assetPath", () => ({ assetPath: (value: string) => value }));
vi.mock("../migrate", () => ({ assertFinancialSchemaReady: vi.fn() }));

const { calculateGroupPersonalExtrasCap, registerReservationsRoutes } = await import("../routes/reservations");

async function withServer<T>(run: (baseUrl: string) => Promise<T>): Promise<T> {
  const app = express();
  app.use(express.json());
  registerReservationsRoutes(app);
  const server: Server = await new Promise((resolve) => {
    const instance = app.listen(0, "127.0.0.1", () => resolve(instance));
  });
  const address = server.address();
  try {
    return await run(`http://127.0.0.1:${typeof address === "object" && address ? address.port : 0}`);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
  }
}

async function post(baseUrl: string, path: string, body: unknown) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: response.status, body: await response.json() as any };
}

beforeEach(() => {
  vi.clearAllMocks();
  const today = new Date().toLocaleDateString("en-CA", {
    timeZone: "America/Argentina/Buenos_Aires",
  });
  state.reservation = {
    id: "reservation-policy-test",
    reservationCode: "RES-POLICY",
    roomId: "room-policy",
    room: { roomNumber: "101" },
    guestId: "guest-policy",
    guest: { firstName: "Test", lastName: "Guest" },
    status: "checked_in",
    checkOutDate: today,
    totalRoomAmount: "100",
    finalRatePerNight: "100",
    nights: 1,
  };
  state.groupLinks = [{ id: "link-policy", groupId: "group-policy", reservationId: state.reservation.id }];
  state.extraCap = 25;
  state.extraDirectPaid = 0;
  state.extraGroupFunds = 0;
  state.groupLodging = 100;
  state.extraConfig = "accommodation";
  state.authenticated = true;
  storage.getChargesTotal.mockResolvedValue(0);
  storage.getPaymentsTotal.mockResolvedValue(0);
});

describe("approved group departure and direct payment policy", () => {
  it("calculates extras caps from direct receipts and group funding above aggregate lodging without prorating", () => {
    expect(calculateGroupPersonalExtrasCap({
      config: "accommodation",
      extras: 60,
      directPaid: 10,
      groupFunds: 150,
      groupLodging: 200,
    })).toBe(50);
    // A partial group-room allocation is already in directPaid; master
    // receipts below aggregate lodging do not get assigned to this room.
    expect(calculateGroupPersonalExtrasCap({
      config: "accommodation",
      extras: 60,
      directPaid: 15,
      groupFunds: 50,
      groupLodging: 200,
    })).toBe(45);
    // Group receipts of 230 across two rooms with 200 total lodging have
    // 30 of excess funding; do not invent a per-room master-folio allocation.
    expect(calculateGroupPersonalExtrasCap({
      config: "accommodation",
      extras: 40,
      directPaid: 5,
      groupFunds: 230,
      groupLodging: 200,
    })).toBe(5);
    expect(calculateGroupPersonalExtrasCap({
      config: "all",
      extras: 60,
      directPaid: 0,
      groupFunds: 0,
      groupLodging: 200,
    })).toBe(0);
  });

  it("allows explicit group departure with debt, without CC debt or payment, and audits the operator and balance", async () => {
    storage.getChargesTotal.mockResolvedValue(15);

    await withServer(async (baseUrl) => {
      const result = await post(baseUrl, `/api/reservations/${state.reservation.id}/check-out`, {
        groupDeparture: true,
        reason: "Autorizado por responsable de grupo",
      });

      expect(result.status).toBe(200);
      expect(storage.updateReservation).toHaveBeenCalledWith(state.reservation.id, expect.objectContaining({ status: "checked_out" }));
      expect(storage.updateRoom).toHaveBeenCalledWith("room-policy", { status: "dirty" });
      expect(storage.createCheckoutCleaningTask).toHaveBeenCalledWith("room-policy");
      expect(storage.getPayments).not.toHaveBeenCalled();
      expect(storage.createReservationPaymentWithLedger).not.toHaveBeenCalled();
      expect(audit).toHaveBeenCalledWith(
        expect.anything(),
        "update",
        "reservations",
        expect.stringContaining("Motivo: Autorizado por responsable de grupo"),
        expect.objectContaining({
          entityId: state.reservation.id,
          details: {
            unresolvedBalance: 115,
            groupDeparture: true,
            reason: "Autorizado por responsable de grupo",
          },
        }),
      );
    });
  });

  it("rejects groupDeparture on an unlinked reservation and keeps ordinary balance blocking", async () => {
    state.groupLinks = [];
    await withServer(async (baseUrl) => {
      const invalidOverride = await post(baseUrl, `/api/reservations/${state.reservation.id}/check-out`, { groupDeparture: true });
      expect(invalidOverride.status).toBe(400);
      expect(storage.updateReservation).not.toHaveBeenCalled();

      state.groupLinks = [{ id: "link-policy", groupId: "group-policy", reservationId: state.reservation.id }];
      const ordinary = await post(baseUrl, `/api/reservations/${state.reservation.id}/check-out`, {});
      expect(ordinary.status).toBe(400);
      expect(ordinary.body.error).toBe("Saldo pendiente");
      expect(storage.updateReservation).not.toHaveBeenCalled();

      const forced = await post(baseUrl, `/api/reservations/${state.reservation.id}/check-out`, { forceCheckout: true });
      expect(forced.status).toBe(400);
      expect(storage.createReservationPaymentWithLedger).not.toHaveBeenCalled();
    });
  });

  it("requires authentication for checkout and overdue bulk checkout", async () => {
    state.authenticated = false;
    await withServer(async (baseUrl) => {
      const checkout = await post(baseUrl, `/api/reservations/${state.reservation.id}/check-out`, { groupDeparture: true });
      const overdue = await post(baseUrl, "/api/reservations/bulk-checkout-overdue", { force: true });
      expect(checkout.status).toBe(401);
      expect(overdue.status).toBe(401);
    });
  });

  it("blocks ordinary reservation payments and supports capped extras only in accommodation-only groups", async () => {
    await withServer(async (baseUrl) => {
      const unmarked = await post(baseUrl, "/api/payments", {
        reservationId: state.reservation.id,
        amount: "10",
        method: "efectivo",
      });
      expect(unmarked.status).toBe(409);
      expect(unmarked.body.code).toBe("GROUP_PAYMENT_REQUIRED");

      const overCap = await post(baseUrl, "/api/payments", {
        reservationId: state.reservation.id,
        amount: "25.01",
        method: "efectivo",
        paymentPurpose: "personal_extras",
      });
      expect(overCap.status).toBe(409);
      expect(overCap.body).toMatchObject({ code: "GROUP_PERSONAL_EXTRAS_CAP", cap: 25 });
      expect(storage.createReservationPaymentWithLedger).not.toHaveBeenCalled();

      const accepted = await post(baseUrl, "/api/payments", {
        reservationId: state.reservation.id,
        amount: "25",
        method: "efectivo",
        paymentPurpose: "personal_extras",
      });
      expect(accepted.status).toBe(201);
      expect(storage.createReservationPaymentWithLedger).toHaveBeenCalledWith(expect.objectContaining({
        payment: expect.objectContaining({ notes: "[personal_extras]" }),
        accountSettlement: undefined,
      }));

      const repeated = await post(baseUrl, "/api/payments", {
        reservationId: state.reservation.id,
        amount: "0.01",
        method: "efectivo",
        paymentPurpose: "personal_extras",
      });
      expect(repeated.status).toBe(409);
      expect(repeated.body.code).toBe("GROUP_PERSONAL_EXTRAS_CAP");

      state.extraConfig = "all";
      const allFolio = await post(baseUrl, "/api/payments", {
        reservationId: state.reservation.id,
        amount: "1",
        method: "efectivo",
        paymentPurpose: "personal_extras",
      });
      expect(allFolio.status).toBe(409);
      expect(allFolio.body.code).toBe("GROUP_PERSONAL_EXTRAS_DISABLED");

      state.extraConfig = "accommodation";
      state.extraGroupFunds = 125;
      const uncertainMasterFunding = await post(baseUrl, "/api/payments", {
        reservationId: state.reservation.id,
        amount: "1",
        method: "efectivo",
        paymentPurpose: "personal_extras",
      });
      expect(uncertainMasterFunding.status).toBe(409);
      expect(uncertainMasterFunding.body.code).toBe("GROUP_PERSONAL_EXTRAS_FUNDING_UNCERTAIN");
    });
  });
});