/**
 * Regression coverage for DatabaseStorage.assignRoomToGroup.
 *
 * An explicit guestId reuses the selected guest. Omitting it remains the
 * explicit "create a new guest" path used by a new rooming-list row.
 */

import { describe, expect, it, vi, beforeEach } from "vitest";

let mockDbSelectRows: any[][] = [];

vi.mock("../db", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => Promise.resolve(mockDbSelectRows.shift() || []),
      }),
    }),
  },
  pool: { query: vi.fn() },
}));

const GROUP_ID = "group-storage-assignment-001";
const ROOM_ID = "room-storage-101";
const EXISTING_GUEST_ID = "guest-existing-002";

function makeStorage() {
  return import("../db-storage").then(({ DatabaseStorage }) => {
    const storage = new DatabaseStorage() as any;
    storage.getGroupBlocks = vi.fn().mockResolvedValue([]);
    storage.checkOverbooking = vi.fn().mockResolvedValue(false);
    storage.getGuest = vi.fn().mockResolvedValue({
      id: EXISTING_GUEST_ID,
      firstName: "Lucía",
      lastName: "Gómez",
      codigo: "GUEST-002",
    });
    storage.createGuest = vi.fn().mockResolvedValue({
      id: "guest-created-001",
      firstName: "Nuevo",
      lastName: "Pasajero",
    });
    storage.createReservation = vi.fn().mockImplementation(async (data: any) => ({
      id: "reservation-created-001",
      ...data,
    }));
    storage.createGroupReservationLink = vi.fn().mockResolvedValue(undefined);
    return storage;
  });
}

describe("DatabaseStorage.assignRoomToGroup guest selection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDbSelectRows = [
      [{
        id: GROUP_ID,
        groupCode: "GS001",
        name: "Grupo storage",
        checkInDate: "2026-09-01",
        checkOutDate: "2026-09-03",
      }],
      [{ id: ROOM_ID, roomTypeId: "room-type-001", roomNumber: "101" }],
    ];
  });

  it("uses an existing guestId without creating a duplicate guest", async () => {
    const storage = await makeStorage();

    const reservation = await storage.assignRoomToGroup(
      GROUP_ID,
      ROOM_ID,
      "Lucía",
      "Gómez",
      { guestId: EXISTING_GUEST_ID },
    );

    expect(reservation.guestId).toBe(EXISTING_GUEST_ID);
    expect(storage.getGuest).toHaveBeenCalledWith(EXISTING_GUEST_ID);
    expect(storage.createGuest).not.toHaveBeenCalled();
    expect(storage.createReservation).toHaveBeenCalledWith(
      expect.objectContaining({ guestId: EXISTING_GUEST_ID }),
    );
  });

  it("creates a separate guest when guestId is explicitly omitted", async () => {
    const storage = await makeStorage();

    const reservation = await storage.assignRoomToGroup(
      GROUP_ID,
      ROOM_ID,
      "Nuevo",
      "Pasajero",
    );

    expect(reservation.guestId).toBe("guest-created-001");
    expect(storage.createGuest).toHaveBeenCalledWith({
      firstName: "Nuevo",
      lastName: "Pasajero",
    });
    expect(storage.getGuest).not.toHaveBeenCalled();
    expect(storage.createReservation).toHaveBeenCalledWith(
      expect.objectContaining({ guestId: "guest-created-001" }),
    );
  });
});