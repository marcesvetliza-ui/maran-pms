import { describe, expect, it } from "vitest";
import {
  buildPendingOperationalReservationRows,
  calculateReservationOperationalSummaries,
  projectReservationOperationalReportRows,
} from "../reservation-operational-balances";

function charge(
  reservationId: string,
  amount: string,
  status = "active",
  description = "Consumo",
  category = "otros",
) {
  return { reservationId, amount, status, description, category } as any;
}

function payment(reservationId: string, amount: string, status = "active") {
  return { reservationId, amount, status } as any;
}

describe("reservation operational balances for listings", () => {
  it("includes accommodation and keeps reservations separated in one bulk projection", () => {
    const summaries = calculateReservationOperationalSummaries(
      [
        { id: "r1", totalRoomAmount: "1000", finalRatePerNight: "999", nights: 3 },
        { id: "r2", totalRoomAmount: null, finalRatePerNight: "400", nights: 2 },
      ],
      [charge("r1", "100"), charge("r2", "50")],
      [payment("r1", "300"), payment("r2", "850")],
    );

    expect(summaries.get("r1")).toMatchObject({
      operationalServices: 1100,
      activeHistoricalSettlements: 300,
      operationalFolioBalance: 800,
    });
    expect(summaries.get("r2")).toMatchObject({
      operationalServices: 850,
      activeHistoricalSettlements: 850,
      operationalFolioBalance: 0,
    });
  });

  it("ignores annulled rows and credit-note audit adjustments", () => {
    const summaries = calculateReservationOperationalSummaries(
      [{ id: "r1", totalRoomAmount: "1000", nights: 1 }],
      [
        charge("r1", "100"),
        charge("r1", "900", "anulado"),
        charge("r1", "-400", "active", "Ajuste por NC NCB 0001-00000001 [nc:1:accommodation]", "adjustment"),
      ],
      [payment("r1", "250"), payment("r1", "700", "anulado")],
    );

    expect(summaries.get("r1")).toMatchObject({
      operationalServices: 1100,
      activeHistoricalSettlements: 250,
      operationalFolioBalance: 850,
    });
  });

  it("shows only current debt on the operational dashboard, ordered by amount", () => {
    const reservations = [
      { id: "settled", totalRoomAmount: "500" },
      { id: "small", totalRoomAmount: "500" },
      { id: "large", totalRoomAmount: "500" },
    ];
    const rows = buildPendingOperationalReservationRows(
      reservations,
      new Map([
        ["settled", 0],
        ["small", 25],
        ["large", 300],
      ]),
    );

    expect(rows.map(row => [row.id, row.balance])).toEqual([
      ["large", 300],
      ["small", 25],
    ]);
  });

  it("projects accommodation debt into reports and removes settled pending rows", () => {
    const reservations = [
      { id: "accommodation-only", code: "R-1", totalRoomAmount: "1000" },
      { id: "settled", code: "R-2", totalRoomAmount: "500" },
    ];
    const summaries = calculateReservationOperationalSummaries(
      reservations,
      [],
      [payment("settled", "500")],
    );

    expect(projectReservationOperationalReportRows(reservations, summaries)).toEqual([
      expect.objectContaining({ code: "R-1", total: 1000, paid: 0, balance: 1000 }),
      expect.objectContaining({ code: "R-2", total: 500, paid: 500, balance: 0 }),
    ]);
    expect(projectReservationOperationalReportRows(reservations, summaries, true)).toEqual([
      expect.objectContaining({ code: "R-1", balance: 1000 }),
    ]);
  });
});