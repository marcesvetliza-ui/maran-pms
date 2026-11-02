import { describe, expect, it } from "vitest";
import { compareReservationsForList, resolveReservationSortMode, type ReservationSortMode } from "./reservation-list-order";

const row = (id: string, room: string, createdAt: string | null, checkInDate = "2026-11-05") => ({
  id, room: { roomNumber: room }, createdAt, checkInDate,
  guest: { firstName: id, lastName: id },
});
const order = (mode: ReservationSortMode, rows: ReturnType<typeof row>[]) =>
  [...rows].sort((a, b) => compareReservationsForList(mode, a, b)).map(r => r.id);

describe("reservation list order", () => {
  it.each(["room", "checkin", "guest", "created"] as const)(
    "forces newest-first in the creation view even if the previous order was %s", selected => {
      const mode = resolveReservationSortMode("created", selected);
      expect(mode).toBe("created");
      expect(order(mode, [
        row("old", "101", "2026-11-01T23:59:00-03:00"),
        row("earlier-today", "102", "2026-11-02T09:00:00-03:00"),
        row("latest", "502", "2026-11-02T15:30:00-03:00"),
      ])).toEqual(["latest", "earlier-today", "old"]);
    },
  );
  it.each(["today", "range", "all", "upcoming", "anuladas"])(
    "preserves the selected order outside creation mode (%s)", dateMode => {
      for (const mode of ["room", "checkin", "guest", "created"] as const) {
        expect(resolveReservationSortMode(dateMode, mode)).toBe(mode);
      }
    },
  );
  it("compares actual instants with timezone offsets, not just date labels", () => {
    expect(order("created", [
      row("older", "101", "2026-11-02T02:00:00Z"),
      row("newer", "502", "2026-11-01T23:30:00-03:00"),
    ])).toEqual(["newer", "older"]);
  });
  it("places missing/invalid creation dates last and breaks equal timestamps by room", () => {
    expect(order("created", [
      row("unknown", "101", null),
      row("invalid", "102", "not-a-date"),
      row("second", "502", "2026-11-02T10:00:00Z"),
      row("first", "202", "2026-11-02T10:00:00Z"),
    ])).toEqual(["first", "second", "unknown", "invalid"]);
  });
  it("keeps numeric room, check-in and guest orders working", () => {
    const rows = [row("Zulu", "10", null, "2026-11-03"), row("Alfa", "2", null, "2026-11-04")];
    expect(order("room", rows)).toEqual(["Alfa", "Zulu"]);
    expect(order("checkin", rows)).toEqual(["Zulu", "Alfa"]);
    expect(order("guest", rows)).toEqual(["Alfa", "Zulu"]);
  });
});
