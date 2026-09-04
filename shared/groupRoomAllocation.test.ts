import { describe, expect, it } from "vitest";
import {
  allocateBalanceCappedGroupRooms,
  resolveAutomaticGroupRoomAllocationMode,
} from "./groupRoomAllocation";

describe("balance-capped group room allocation", () => {
  it("splits equal mode deterministically, including remainder cents", () => {
    expect(allocateBalanceCappedGroupRooms(100.01, [
      { id: "room-c", balance: 100 },
      { id: "room-a", balance: 100 },
      { id: "room-b", balance: 100 },
    ], "equal")).toMatchObject({
      allocations: { "room-a": 33.34, "room-b": 33.34, "room-c": 33.33 },
      allocatedCents: 10001,
      unallocatedCents: 0,
      mode: "equal",
    });
  });

  it("uses remaining balances as proportional weights", () => {
    expect(allocateBalanceCappedGroupRooms(60, [
      { id: "room-a", balance: 10 },
      { id: "room-b", balance: 20 },
      { id: "room-c", balance: 30 },
    ], "proportional").allocations).toEqual({
      "room-a": 10,
      "room-b": 20,
      "room-c": 30,
    });
  });

  it("caps equal allocation at each room balance and allocates all available capacity", () => {
    expect(allocateBalanceCappedGroupRooms(250, [
      { id: "room-a", balance: 10 },
      { id: "room-b", balance: 100 },
      { id: "room-c", balance: 100 },
    ], "equal")).toMatchObject({
      allocations: { "room-a": 10, "room-b": 100, "room-c": 100 },
      allocatedCents: 21000,
      unallocatedCents: 4000,
    });
  });

  it("forces proportional automatic allocation after a non-fiscal advance", () => {
    const result = allocateBalanceCappedGroupRooms(300, [
      { id: "room-a", balance: 60 },
      { id: "room-b", balance: 120 },
      { id: "room-c", balance: 120 },
    ], "equal", true);
    expect(resolveAutomaticGroupRoomAllocationMode("equal", true)).toBe("proportional");
    expect(result).toMatchObject({
      mode: "proportional",
      allocations: { "room-a": 60, "room-b": 120, "room-c": 120 },
    });
  });
});