import { describe, it, expect } from "vitest";
import {
  summarizeGroupBlocks,
  compatibleGroupBlocks,
  type AssignmentGroup,
} from "./groupBlockAssignments";
const stay = (
  id: string,
  from = "2026-01-01",
  to = "2026-01-02",
  extra: any = {},
) => ({
  id,
  roomId: id + "-room",
  roomTypeId: "premium",
  checkInDate: from,
  checkOutDate: to,
  status: "confirmed",
  guestId: id + "-guest",
  ...extra,
});
const group = (extra: any = {}): AssignmentGroup => ({
  id: "fixture-group",
  checkInDate: "2026-01-01",
  checkOutDate: "2026-01-03",
  blocks: [
    {
      id: "z-first-date",
      roomTypeId: "premium",
      quantity: 2,
      blockCheckInDate: "2026-01-01",
      blockCheckOutDate: "2026-01-02",
    },
    {
      id: "a-second-date",
      roomTypeId: "premium",
      quantity: 1,
      blockCheckInDate: "2026-01-02",
      blockCheckOutDate: "2026-01-03",
    },
    {
      id: "executive",
      roomTypeId: "executive",
      quantity: 1,
      blockCheckInDate: "2026-01-02",
      blockCheckOutDate: "2026-01-03",
    },
  ],
  reservations: [
    stay("second", "2026-01-02", "2026-01-03"),
    stay("first"),
    stay("other", "2026-01-02", "2026-01-03", { roomTypeId: "executive" }),
  ],
  ...extra,
});
describe("group block assignment identity", () => {
  it("identifies the missing unit in its date-specific block independently of array/id order", () => {
    const s = summarizeGroupBlocks(group());
    expect(s.unresolved).toHaveLength(0);
    expect(s.byBlock["z-first-date"].reservations.map((r) => r.id)).toEqual([
      "first",
    ]);
    expect(s.byBlock["z-first-date"].pendingRooms).toBe(1);
    expect(s.byBlock["a-second-date"].reservations.map((r) => r.id)).toEqual([
      "second",
    ]);
    expect(s.byBlock.executive.pendingRooms).toBe(0);
    const g = group();
    g.blocks.reverse();
    g.reservations.reverse();
    expect(summarizeGroupBlocks(g).byBlock["z-first-date"].pendingRooms).toBe(
      1,
    );
  });
  it("does not invent a distribution between identical legacy blocks", () => {
    const g = group({
      blocks: [
        { id: "one", roomTypeId: "premium", quantity: 1 },
        { id: "two", roomTypeId: "premium", quantity: 1 },
      ],
      reservations: [stay("a"), stay("b")],
    });
    const s = summarizeGroupBlocks(g);
    expect(s.unresolved).toHaveLength(2);
    expect(s.byBlock.one.reservations).toHaveLength(0);
    expect(s.byBlock.two.reviewReservationIds).toHaveLength(2);
    g.reservationBlockIds = { a: "one", b: "two" };
    expect(summarizeGroupBlocks(g).unresolved).toHaveLength(0);
  });
  it("keeps a completed stay fulfilled instead of showing another vacancy", () => {
    const g = group({
      reservations: [
        stay("done", "2026-01-01", "2026-01-02", { status: "checked_out" }),
        stay("active"),
      ],
    });
    const s = summarizeGroupBlocks(g);
    expect(s.byBlock["z-first-date"]).toMatchObject({
      pendingRooms: 0,
      departed: 1,
    });
  });
  it("distinguishes a physical room without a passenger from a room still to assign", () => {
    const g = group({
      reservations: [
        stay("placeholder", "2026-01-01", "2026-01-02", {
          guest: { codigo: "GROUP-fixture-group" },
        }),
      ],
    });
    expect(summarizeGroupBlocks(g).byBlock["z-first-date"]).toMatchObject({
      pendingRooms: 1,
      pendingGuests: 1,
    });
  });
  it("ignores cancelled/no-show rows and deduplicates old links", () => {
    const r = stay("same");
    const g = group({
      reservations: [
        r,
        r,
        stay("cancelled", "2026-01-01", "2026-01-02", { status: "cancelled" }),
        stay("no-show", "2026-01-01", "2026-01-02", { status: "no_show" }),
      ],
    });
    expect(
      summarizeGroupBlocks(g).byBlock["z-first-date"].reservations,
    ).toHaveLength(1);
  });
  it("flags a persistent association whose category or dates no longer match", () => {
    const g = group({ reservationBlockIds: { first: "a-second-date" } });
    const s = summarizeGroupBlocks(g);
    expect(s.unresolved.find((r) => r.reservation.id === "first")?.reason).toBe(
      "incompatible",
    );
    expect(s.byBlock["a-second-date"].reviewReservationIds).toContain("first");
  });
  it("respects an explicit longer block even when another block has exact dates", () => {
    const g = group({
      blocks: [
        { id: "long", roomTypeId: "premium", quantity: 1 },
        {
          id: "exact",
          roomTypeId: "premium",
          quantity: 1,
          blockCheckOutDate: "2026-01-02",
        },
      ],
      reservations: [stay("a")],
      reservationBlockIds: { a: "long" },
    });
    expect(
      compatibleGroupBlocks(g, g.reservations[0]).map((b) => b.id),
    ).toEqual(["exact"]);
    expect(summarizeGroupBlocks(g).byBlock.long.reservations).toHaveLength(1);
  });
  it("keeps duplicate conflicting metadata visible for review", () => {
    const g = group({ conflictingReservationBlockIds: ["first"] });
    expect(
      summarizeGroupBlocks(g).unresolved.find(
        (v) => v.reservation.id === "first",
      ),
    ).toBeDefined();
  });
});
