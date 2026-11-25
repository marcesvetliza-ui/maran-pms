import { expect, it } from "vitest";
import { evaluateGroupInventory } from "@shared/group-inventory";
const shared = {
  checkIn: "2095-02-02",
  checkOut: "2095-02-04",
  operationalInventory: 1,
  groups: [
    {
      id: "g",
      status: "confirmed",
      checkInDate: "2095-02-02",
      checkOutDate: "2095-02-04",
    },
  ],
  blocks: [{ groupId: "g", roomTypeId: "executive", quantity: 1 }],
  reservations: [
    {
      id: "r",
      roomId: "premium1",
      roomTypeId: "executive",
      physicalRoomTypeId: "premium",
      groupId: "g",
      checkInDate: "2095-02-02",
      checkOutDate: "2095-02-04",
      status: "checked_in",
    },
  ],
};
it("a room-only group upgrade fulfills its contracted block and releases its original physical category", () => {
  expect(
    evaluateGroupInventory({ ...shared, roomTypeId: "executive" }),
  ).toBeNull();
});
it("the same upgrade consumes capacity in its physical destination category", () => {
  expect(
    evaluateGroupInventory({ ...shared, roomTypeId: "premium" }),
  ).toMatchObject({ code: "GROUP_BLOCK_SHORTAGE" });
});
it("keeps unassigned units of the original group committed", () => {
  expect(
    evaluateGroupInventory({
      ...shared,
      roomTypeId: "executive",
      blocks: [{ groupId: "g", roomTypeId: "executive", quantity: 2 }],
    }),
  ).toMatchObject({
    code: "GROUP_BLOCK_WARNING",
    canOverride: true,
    hardDemand: 2,
    unassignedConfirmedGroupUnits: 1,
  });
});
