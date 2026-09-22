import { describe, expect, it } from "vitest";
import type { ReservationWithDetails } from "@shared/schema";
import { compareReservationsByRoom, compareReservationsForList } from "./reservations";

function reservation(
  roomNumber: string | null,
  checkInDate = "2026-09-22",
  guestName = "",
  createdAt = "2026-09-20T12:00:00Z",
) {
  const [lastName = "", firstName = ""] = guestName.split(",");
  return {
    room: roomNumber ? { roomNumber } : undefined,
    checkInDate,
    guest: { lastName, firstName },
    createdAt,
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

  it("permite ordenar por fecha de ingreso", () => {
    const rows = [
      reservation("205", "2026-09-24"),
      reservation("702", "2026-09-22"),
      reservation("303", "2026-09-23"),
    ];

    expect(rows.sort((a, b) => compareReservationsForList("checkin", a, b)).map((row) => row.checkInDate))
      .toEqual(["2026-09-22", "2026-09-23", "2026-09-24"]);
  });

  it("permite ordenar alfabéticamente por apellido y nombre", () => {
    const rows = [
      reservation("205", "2026-09-22", "Soto,Guillermo"),
      reservation("702", "2026-09-22", "Abuaf,Maximiliano"),
      reservation("303", "2026-09-22", "Rodríguez,Victoria"),
    ];

    expect(rows.sort((a, b) => compareReservationsForList("guest", a, b)).map((row) => row.guest?.lastName))
      .toEqual(["Abuaf", "Rodríguez", "Soto"]);
  });

  it("permite ordenar por fecha de creación con la más reciente primero", () => {
    const rows = [
      reservation("205", "2026-09-22", "", "2026-09-19T12:00:00Z"),
      reservation("702", "2026-09-22", "", "2026-09-21T12:00:00Z"),
      reservation("303", "2026-09-22", "", "2026-09-20T12:00:00Z"),
    ];

    expect(rows.sort((a, b) => compareReservationsForList("created", a, b)).map((row) => row.room?.roomNumber))
      .toEqual(["702", "303", "205"]);
  });
});
