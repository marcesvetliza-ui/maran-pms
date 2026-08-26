import express from "express";
import * as http from "node:http";
import { beforeEach, describe, expect, it, vi } from "vitest";

const GROUP_ID = "group-retention-001";
const COMPANY_ID = "company-retention-001";
const ROOM_A = "reservation-room-a";
const ROOM_B = "reservation-room-b";

type ReservationRow = {
  id: string;
  reservation_code: string | null;
  accommodation: string;
  room_number: string | null;
  guest_name: string;
  extras: string;
  paid: string;
};

let reservationRows: ReservationRow[] = [];

const state = {
  groupPayment: null as Record<string, any> | null,
  payments: [] as Record<string, any>[],
  nextId: 0,
};

function nextId(prefix: string) {
  state.nextId += 1;
  return `${prefix}-${state.nextId}`;
}

function makeTransaction() {
  let executeCount = 0;
  return {
    execute: async () => {
      executeCount += 1;
      if (executeCount === 1) {
        // Group row lock.
        return { rows: [{ id: GROUP_ID }] };
      }
      // Reservation balances for the room allocations under payment.
      return { rows: reservationRows };
    },
    insert: (_table: unknown) => ({
      values: (value: Record<string, any>) => ({
        returning: async () => {
          if ("groupId" in value && "destination" in value) {
            const groupPayment = { id: nextId("group-payment"), ...value };
            state.groupPayment = groupPayment;
            return [groupPayment];
          }
          if ("reservationId" in value && "method" in value) {
            const payment = { id: nextId("payment"), ...value };
            state.payments.push(payment);
            return [payment];
          }
          return [{ id: nextId("row"), ...value }];
        },
      }),
    }),
  };
}

const fakeDb = {
  transaction: async (callback: (tx: ReturnType<typeof makeTransaction>) => Promise<unknown>) => {
    return callback(makeTransaction());
  },
};

vi.mock("../db", () => ({
  db: fakeDb,
  pool: { query: vi.fn() },
}));

vi.mock("../db-storage", async () => {
  const actual = await vi.importActual<typeof import("../db-storage")>("../db-storage");
  const storage = new actual.DatabaseStorage();
  // The two route-level validation tests below only need the route to get
  // past its initial `storage.getGroup` existence check before reaching the
  // retention validation — they never touch the real reservations table.
  (storage as any).getGroup = vi.fn().mockResolvedValue({
    id: GROUP_ID,
    name: "Grupo Test",
    reservations: [],
  });
  return {
    ...actual,
    storage,
  };
});

vi.mock("../auth", () => ({
  requireAuth: (_req: any, _res: any, next: () => void) => next(),
}));

vi.mock("../audit", () => ({ audit: vi.fn() }));

async function startApp() {
  const { registerGroupsRoutes } = await import("../routes/groups");
  const app = express();
  app.use(express.json());
  registerGroupsRoutes(app);

  return new Promise<{ baseUrl: string; close: () => void }>((resolve) => {
    const server = http.createServer(app);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address() as { port: number };
      resolve({
        baseUrl: `http://127.0.0.1:${port}`,
        close: () => server.close(),
      });
    });
  });
}

function room(id: string, accommodationCents: number, roomNumber: string): ReservationRow {
  return {
    id,
    reservation_code: id,
    accommodation: (accommodationCents / 100).toFixed(2),
    room_number: roomNumber,
    guest_name: "Huésped de prueba",
    extras: "0",
    paid: "0",
  };
}

describe("group payment retentions settle the debt they claim to cover", () => {
  beforeEach(() => {
    state.groupPayment = null;
    state.payments = [];
    state.nextId = 0;
    reservationRows = [];
  });

  it("applies the gross (cash + retención) amount to a single room's balance, not just the cash received", async () => {
    reservationRows = [room(ROOM_A, 10000, "101")]; // $100.00 balance

    const { storage } = await import("../db-storage");
    const recorded = await storage.recordGroupPayment({
      groupId: GROUP_ID,
      destination: "group_distribution",
      paymentRows: [
        { method: "transferencia", amount: "90.00", retention: { tipo: "iibb", monto: 10 } },
      ],
      date: "2026-08-26",
      reference: "Pago grupal con retención",
      distribution: "equal",
      distributionDetail: { [ROOM_A]: 100 },
    });

    // The group payment header must reflect the full $100 settled, not the
    // $90 that actually moved as cash — otherwise the group balance would
    // still show $10 outstanding after a fully-settled payment.
    expect(recorded.groupPayment.amount).toBe("100.00");
    expect(recorded.reservationPayments).toHaveLength(1);
    const payment = recorded.reservationPayments[0];
    expect(payment.amount).toBe("100.00");
    expect(payment.reservationId).toBe(ROOM_A);
    const notes = JSON.parse(payment.notes as string);
    expect(notes.retencion).toEqual({ tipo: "iibb", monto: 10, neto: 90 });
  });

  it("splits a row's retention proportionally when its gross amount is distributed across multiple rooms", async () => {
    // Room A owes $75, room B owes $25 — a $90 transfer + $10 retención
    // ($100 gross) should split 75/25 gross, so the $10 retención also
    // splits 75/25 ($7.50 / $2.50).
    reservationRows = [room(ROOM_A, 7500, "101"), room(ROOM_B, 2500, "102")];

    const { storage } = await import("../db-storage");
    const recorded = await storage.recordGroupPayment({
      groupId: GROUP_ID,
      destination: "group_distribution",
      paymentRows: [
        { method: "transferencia", amount: "90.00", retention: { tipo: "ganancias", monto: 10 } },
      ],
      date: "2026-08-26",
      reference: "Pago grupal con retención — cierre total",
      distribution: "proportional",
      distributionDetail: { [ROOM_A]: 75, [ROOM_B]: 25 },
    });

    expect(recorded.groupPayment.amount).toBe("100.00");
    const byRoom = new Map(recorded.reservationPayments.map((p) => [p.reservationId, p]));

    const roomAPayment = byRoom.get(ROOM_A)!;
    expect(roomAPayment.amount).toBe("75.00");
    const roomANotes = JSON.parse(roomAPayment.notes as string);
    expect(roomANotes.retencion.monto).toBeCloseTo(7.5, 2);
    expect(roomANotes.retencion.neto).toBeCloseTo(67.5, 2);

    const roomBPayment = byRoom.get(ROOM_B)!;
    expect(roomBPayment.amount).toBe("25.00");
    const roomBNotes = JSON.parse(roomBPayment.notes as string);
    expect(roomBNotes.retencion.monto).toBeCloseTo(2.5, 2);
    expect(roomBNotes.retencion.neto).toBeCloseTo(22.5, 2);

    // Exact close-out: the two rooms' gross shares must add up to exactly
    // the $100 total, with no cent lost or invented by rounding.
    const totalApplied = recorded.reservationPayments.reduce((sum, p) => sum + parseFloat(p.amount), 0);
    expect(totalApplied).toBeCloseTo(100, 2);
  });

  it("rejects a retención attached to a cuenta_corriente row instead of silently dropping it", async () => {
    const app = await startApp();
    try {
      const response = await fetch(`${app.baseUrl}/api/groups/${GROUP_ID}/payment`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          paymentRows: [
            { method: "cuenta_corriente", amount: "100.00", retention: { tipo: "iibb", monto: 10 } },
          ],
          billingEntityType: "company",
          billingEntityId: COMPANY_ID,
        }),
      });
      expect(response.status).toBe(400);
      const body = await response.json() as any;
      expect(body.error).toMatch(/cuenta corriente/i);
    } finally {
      app.close();
    }
  });

  it("rejects a malformed retención payload (bad tipo / non-positive monto) server-side", async () => {
    const app = await startApp();
    try {
      const badTipo = await fetch(`${app.baseUrl}/api/groups/${GROUP_ID}/payment`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          paymentRows: [{ method: "transferencia", amount: "90.00", retention: { tipo: "vat", monto: 10 } }],
        }),
      });
      expect(badTipo.status).toBe(400);

      const badMonto = await fetch(`${app.baseUrl}/api/groups/${GROUP_ID}/payment`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          paymentRows: [{ method: "transferencia", amount: "90.00", retention: { tipo: "iibb", monto: -5 } }],
        }),
      });
      expect(badMonto.status).toBe(400);
    } finally {
      app.close();
    }
  });
});
