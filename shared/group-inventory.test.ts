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
  it("adds overlapping blocks of one group without multiplying linked reservations", () => {
    const input = {
      ...base,
      blocks: [
        { ...base.blocks[0], quantity: 25 },
        { ...base.blocks[0], quantity: 3 },
      ],
      reservations: Array.from({ length: 25 }, (_, i) => ({
        id: `linked-${i}`, groupId: "g", roomTypeId: "std",
        checkInDate: "2026-10-10", checkOutDate: "2026-10-12", status: "confirmed",
      })),
      candidateUnits: 0,
    };
    expect(evaluateGroupInventory({ ...input, operationalInventory: 28 })).toBeNull();
    expect(evaluateGroupInventory({ ...input, operationalInventory: 27 })).toMatchObject({
      code: "GROUP_BLOCK_SHORTAGE", hardDemand: 28,
    });
    const soft = { ...input, groups: [{ ...base.groups[0], status: "blocked" }] };
    expect(evaluateGroupInventory({ ...soft, operationalInventory: 28 })).toBeNull();
    const warning = evaluateGroupInventory({ ...soft, operationalInventory: 27 });
    expect(warning).toMatchObject({ code: "GROUP_BLOCK_WARNING" });
    expect(warning?.warnings).toHaveLength(2);
    expect(warning?.warnings[0]).toMatchObject({ blockQuantity: 28, requested: 3 });
  });
  it("counts a new linked reservation only once across blocks", () => {
    const input = {
      ...base,
      blocks: [{ ...base.blocks[0], quantity: 1 }, { ...base.blocks[0], quantity: 1 }],
      reservations: [{ id: "r", groupId: "g", roomTypeId: "std", checkInDate: "2026-10-10", checkOutDate: "2026-10-12", status: "confirmed" }],
      contextGroupId: "g",
    };
    expect(evaluateGroupInventory({ ...input, operationalInventory: 2 })).toBeNull();
    expect(evaluateGroupInventory({ ...input, operationalInventory: 1 })).toMatchObject({
      code: "GROUP_BLOCK_SHORTAGE", hardDemand: 2,
    });
  });
  it("applies each block only on its own nights", () => {
    const input = {
      ...base, checkOut: "2026-10-13", candidateUnits: 0,
      blocks: [
        { ...base.blocks[0], quantity: 2, blockCheckInDate: "2026-10-10", blockCheckOutDate: "2026-10-11" },
        { ...base.blocks[0], quantity: 1, blockCheckInDate: "2026-10-11", blockCheckOutDate: "2026-10-13" },
      ],
      reservations: [{ id: "r", groupId: "g", roomTypeId: "std", checkInDate: "2026-10-10", checkOutDate: "2026-10-11", status: "confirmed" }],
    };
    expect(evaluateGroupInventory({ ...input, operationalInventory: 2 })).toBeNull();
    expect(evaluateGroupInventory({ ...input, operationalInventory: 1 })).toMatchObject({
      code: "GROUP_BLOCK_SHORTAGE", date: "2026-10-10", hardDemand: 2,
    });
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