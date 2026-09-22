import { describe, expect, it } from "vitest";
import type { ReservationWithDetails } from "@shared/schema";
import { compareReservationsByRoom } from "./reservations";

function reservation(roomNumber: string | null, checkInDate = "2026-09-22") {
  return {
    room: roomNumber ? { roomNumber } : undefined,
    checkInDate,
  } as ReservationWithDetails;
}

describe("orden de habitaciones en Reservas", () => {
  it("ordena numéricamente en forma ascendente", () => {
    const rows = [reservation("702"), reservation("205"), reservation("1001"), reservation("206")];

    expect(rows.sort(compareReservationsByRoom).map((row) => row.room?.roomNumber))
      .toEqual(["205", "206", "702", "1001"]);
  });

  it("deja las reservas sin habitación al final", () => {
    const rows = [reservation(null), reservation("303"), reservation("205")];

    expect(rows.sort(compareReservationsByRoom).map((row) => row.room?.roomNumber ?? null))
      .toEqual(["205", "303", null]);
  });
});
