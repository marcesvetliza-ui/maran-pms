import { describe, expect, it } from "vitest";
import { evaluateGroupInventory } from "./group-inventory";

const base = {
  roomTypeId: "std", checkIn: "2026-10-10", checkOut: "2026-10-12",
  operationalInventory: 3,
  groups: [{ id: "g", status: "confirmed", checkInDate: "2026-10-10", checkOutDate: "2026-10-12" }],
  blocks: [{ groupId: "g", roomTypeId: "std", quantity: 2 }],
  reservations: [],
};

describe("group inventory accounting", () => {
  it("commits confirmed blocks per night", () => {
    expect(evaluateGroupInventory({ ...base, operationalInventory: 3 })).toBeNull();
    expect(evaluateGroupInventory({ ...base, operationalInventory: 2 })).toMatchObject({ code: "GROUP_BLOCK_SHORTAGE", canOverride: false });
  });
  it("does not double count linked reservations", () => {
    expect(evaluateGroupInventory({
      ...base, operationalInventory: 2, contextGroupId: "g",
      reservations: [{ id: "r", groupId: "g", roomTypeId: "std", checkInDate: "2026-10-10", checkOutDate: "2026-10-12", status: "confirmed" }],
    })).toBeNull();
  });
  it("returns an overridable warning for a soft block invaded by demand", () => {
    expect(evaluateGroupInventory({
      ...base, operationalInventory: 2,
      groups: [{ ...base.groups[0], status: "tentative" }],
      blocks: [{ ...base.blocks[0], quantity: 2 }],
      reservations: [{ id: "r", roomTypeId: "std", checkInDate: "2026-10-10", checkOutDate: "2026-10-12", status: "confirmed" }],
    })).toMatchObject({ code: "GROUP_BLOCK_WARNING", canOverride: true });
  });
  it("accumulates multiple tentative blocks before warning", () => {
    expect(evaluateGroupInventory({
      ...base, operationalInventory: 4,
      groups: [
        { ...base.groups[0], id: "g1", status: "tentative" },
        { ...base.groups[0], id: "g2", status: "blocked" },
      ],
      blocks: [
        { ...base.blocks[0], groupId: "g1", quantity: 2 },
        { ...base.blocks[0], groupId: "g2", quantity: 2 },
      ],
    })).toMatchObject({ code: "GROUP_BLOCK_WARNING", canOverride: true });
  });
  it("counts linked reservations outside block dates as normal demand", () => {
    expect(evaluateGroupInventory({
      ...base, operationalInventory: 3,
      reservations: [{ id: "r", groupId: "g", roomTypeId: "std", checkInDate: "2026-10-09", checkOutDate: "2026-10-10", status: "confirmed" }],
    })).toBeNull();
  });
});