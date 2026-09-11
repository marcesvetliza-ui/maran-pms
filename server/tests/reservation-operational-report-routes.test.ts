import express from "express";
import type { Server } from "node:http";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  execute: vi.fn(),
  select: vi.fn(),
}));

vi.mock("../auth", () => ({
  requireAuth: (_req: any, _res: any, next: () => void) => next(),
  requireRole: () => (_req: any, _res: any, next: () => void) => next(),
  hashPassword: vi.fn(),
}));
vi.mock("../audit", () => ({ audit: vi.fn() }));
vi.mock("../migrate", () => ({ assertFinancialSchemaReady: vi.fn() }));
vi.mock("../db-storage", () => ({
  storage: new Proxy({}, { get: () => vi.fn() }),
  getArgentinaToday: () => "2026-09-11",
}));
vi.mock("../db", () => ({
  db: {
    execute: mocks.execute,
    select: mocks.select,
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    transaction: vi.fn(),
  },
}));

const accommodationOnly = {
  id: "reservation-accommodation-only",
  code: "RES-ALOJ",
  guest: "Ana Alojamiento",
  room: "101",
  room_type: "Doble",
  check_in: "2026-09-10",
  check_out: "2026-09-12",
  nights: 2,
  pax: 1,
  status: "checked_in",
  total_room_amount: "1000.00",
  final_rate_per_night: "500.00",
};

const settled = {
  id: "reservation-settled",
  code: "RES-SALDADA",
  guest: "Beto Saldado",
  room: "102",
  room_type: "Doble",
  check_in: "2026-09-10",
  check_out: "2026-09-12",
  nights: 2,
  pax: 2,
  status: "confirmed",
  total_room_amount: "500.00",
  final_rate_per_night: "250.00",
};

function reportRows() {
  return [accommodationOnly, settled];
}

function guestDebtRows() {
  return reportRows().map((row, index) => ({
    guest_id: `guest-${index + 1}`,
    guest_name: row.guest,
    document_number: `DOC-${index + 1}`,
    document_type: "DNI",
    reservation_id: row.id,
    reservation_code: row.code,
    check_in_date: row.check_in,
    check_out_date: row.check_out,
    status: row.status,
    room_number: row.room,
    total_room_amount: row.total_room_amount,
    final_rate_per_night: row.final_rate_per_night,
    nights: row.nights,
  }));
}

function configureBulkFinancialReads() {
  let selectCall = 0;
  mocks.select.mockImplementation(() => ({
    from: () => ({
      where: async () => {
        selectCall += 1;
        if (selectCall % 2 === 1) return [];
        return [{
          reservationId: settled.id,
          amount: "500.00",
          status: "active",
        }];
      },
    }),
  }));
}

async function withServer<T>(run: (baseUrl: string) => Promise<T>): Promise<T> {
  const { registerRoutes } = await import("../routes");
  const app = express();
  app.use(express.json());
  const server: Server = await new Promise((resolve) => {
    const instance = app.listen(0, "127.0.0.1", () => resolve(instance));
  });
  await registerRoutes(server, app);
  const address = server.address();
  try {
    return await run(`http://127.0.0.1:${typeof address === "object" && address ? address.port : 0}`);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
  }
}

describe("operational accommodation report endpoints", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    configureBulkFinancialReads();
  });

  it("keeps accommodation in all reports, filters settled debt, and loads finances in bulk", async () => {
    mocks.execute
      .mockResolvedValueOnce({ rows: reportRows() })
      .mockResolvedValueOnce({ rows: reportRows() })
      .mockResolvedValueOnce({ rows: reportRows() })
      .mockResolvedValueOnce({ rows: guestDebtRows() });

    await withServer(async (baseUrl) => {
      const missingDates = await fetch(`${baseUrl}/api/reports/arrivals-departures`);
      expect(missingDates.status).toBe(400);
      expect(await missingDates.json()).toEqual({ error: "from y to son requeridos" });

      const arrivalsDepartures = await fetch(
        `${baseUrl}/api/reports/arrivals-departures?from=2026-09-10&to=2026-09-12`,
      );
      expect(arrivalsDepartures.status).toBe(200);
      expect(await arrivalsDepartures.json()).toEqual({
        arrivals: [
          expect.objectContaining({ code: "RES-ALOJ", total: 1000, paid: 0, balance: 1000 }),
          expect.objectContaining({ code: "RES-SALDADA", total: 500, paid: 500, balance: 0 }),
        ],
        departures: [
          expect.objectContaining({ code: "RES-ALOJ", total: 1000, paid: 0, balance: 1000 }),
          expect.objectContaining({ code: "RES-SALDADA", total: 500, paid: 500, balance: 0 }),
        ],
      });

      const pendingBalances = await fetch(`${baseUrl}/api/reports/pending-balances`);
      expect(pendingBalances.status).toBe(200);
      expect(await pendingBalances.json()).toEqual([
        expect.objectContaining({ code: "RES-ALOJ", total: 1000, paid: 0, balance: 1000 }),
      ]);

      const guestDebt = await fetch(`${baseUrl}/api/reports/guest-debt`);
      expect(guestDebt.status).toBe(200);
      expect(await guestDebt.json()).toEqual([
        expect.objectContaining({
          guestName: "Ana Alojamiento",
          totalAlojamiento: 1000,
          totalExtras: 0,
          totalPagado: 0,
          totalDeuda: 1000,
          reservations: [
            expect.objectContaining({
              reservationCode: "RES-ALOJ",
              alojamiento: 1000,
              extras: 0,
              pagado: 0,
              saldo: 1000,
            }),
          ],
        }),
      ]);
    });

    expect(mocks.execute).toHaveBeenCalledTimes(4);
    expect(mocks.select).toHaveBeenCalledTimes(6);
  });

  it("consolidates multiple active stays for the same guest with extras and partial payments", async () => {
    const firstStay = {
      ...accommodationOnly,
      guest_id: "guest-shared",
      guest_name: "Carla Compartida",
      document_number: "DOC-CARLA",
      document_type: "DNI",
      reservation_id: "reservation-shared-first",
      reservation_code: "RES-CARLA-1",
      room_number: "201",
    };
    const secondStay = {
      ...settled,
      guest_id: "guest-shared",
      guest_name: "Carla Compartida",
      document_number: "DOC-CARLA",
      document_type: "DNI",
      reservation_id: "reservation-shared-second",
      reservation_code: "RES-CARLA-2",
      room_number: "202",
      total_room_amount: "600.00",
      status: "confirmed",
    };

    mocks.execute.mockResolvedValueOnce({ rows: [firstStay, secondStay] });
    mocks.select
      .mockImplementationOnce(() => ({
        from: () => ({
          where: async () => [
            { reservationId: firstStay.reservation_id, amount: "200.00", status: "active" },
            { reservationId: secondStay.reservation_id, amount: "150.00", status: "active" },
          ],
        }),
      }))
      .mockImplementationOnce(() => ({
        from: () => ({
          where: async () => [
            { reservationId: firstStay.reservation_id, amount: "300.00", status: "active" },
            { reservationId: secondStay.reservation_id, amount: "250.00", status: "active" },
          ],
        }),
      }));

    await withServer(async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/reports/guest-debt`);

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual([{
        guestId: "guest-shared",
        guestName: "Carla Compartida",
        documentNumber: "DOC-CARLA",
        documentType: "DNI",
        totalAlojamiento: 1600,
        totalExtras: 350,
        totalPagado: 550,
        totalDeuda: 1400,
        reservations: [
          expect.objectContaining({
            reservationId: firstStay.reservation_id,
            reservationCode: "RES-CARLA-1",
            alojamiento: 1000,
            extras: 200,
            pagado: 300,
            saldo: 900,
          }),
          expect.objectContaining({
            reservationId: secondStay.reservation_id,
            reservationCode: "RES-CARLA-2",
            alojamiento: 600,
            extras: 150,
            pagado: 250,
            saldo: 500,
          }),
        ],
      }]);
    });

    expect(mocks.execute).toHaveBeenCalledTimes(1);
    expect(mocks.select).toHaveBeenCalledTimes(2);
  });
});
