import { describe, expect, it } from "vitest";
import { hasCanonicalRoomType, isOperationalInventoryRoom, isRoomAvailableForInterval } from "@shared/room-availability";

describe("room availability for group blocks", () => {
  const room = { id: "room-101", roomTypeId: "type-standard", roomNumber: "101", status: "occupied" };

  it("matches a block to rooms only through persisted roomTypeId", () => {
    expect(hasCanonicalRoomType(room, "type-standard")).toBe(true);
    expect(hasCanonicalRoomType(room, "type-suite")).toBe(false);
  });

  it("uses stay-date overlap rather than the current occupied status", () => {
    const base = {
      room,
      checkIn: "2026-10-10",
      checkOut: "2026-10-12",
      maintenanceBlocks: [],
    };
    expect(isRoomAvailableForInterval({
      ...base,
      reservations: [{ id: "past", roomId: room.id, status: "confirmed", checkInDate: "2026-10-01", checkOutDate: "2026-10-03" }],
    })).toBe(true);
    expect(isRoomAvailableForInterval({
      ...base,
      reservations: [{ id: "overlap", roomId: room.id, status: "confirmed", checkInDate: "2026-10-11", checkOutDate: "2026-10-13" }],
    })).toBe(false);
    expect(isRoomAvailableForInterval({
      ...base,
      reservations: [{ id: "checkout", roomId: room.id, status: "confirmed", checkInDate: "2026-10-08", checkOutDate: "2026-10-10" }],
    })).toBe(true);
  });

  it("excludes REUB and every virtual room from operational inventory metrics", () => {
    expect(isOperationalInventoryRoom({ roomNumber: "101", isVirtual: false, isActive: true })).toBe(true);
    expect(isOperationalInventoryRoom({ roomNumber: "REUB", isVirtual: false, isActive: true })).toBe(false);
    expect(isOperationalInventoryRoom({ roomNumber: "TEMP", isVirtual: true, isActive: true })).toBe(false);
    expect(isOperationalInventoryRoom({ roomNumber: "102", isVirtual: false, isActive: false })).toBe(false);
  });
});
