import { describe, expect, it } from "vitest";
import {
  compareBeds,
  preparationIsCurrent,
  taskDuration,
  durationLabel,
  type BedPreparation,
} from "./housekeepingPlanning";
describe("Housekeeping planning evidence", () => {
  it("compares explicit bed equivalents only", () => {
    expect(compareBeds("MAT", "DBL", null)).toBe("same");
    expect(compareBeds("MAT", "TWN", null)).toBe("different");
    expect(compareBeds("TWIN", "TWN", null)).toBe("same");
    expect(compareBeds("MAT", "TPL", null)).toBe("review");
    expect(compareBeds("MAT", "DBL", "Cuna y almohada extra")).toBe("review");
    expect(compareBeds("MAT", null, null)).toBe("unspecified");
    expect(compareBeds("CUSTOM", "CUSTOM", null)).toBe("same");
    expect(compareBeds("CUSTOM", "OTHER", null)).toBe("review");
    expect(compareBeds("CUSTOM", "CUSTOM", "Revisar cuna")).toBe("review");
  });
  it("requires room, request and physical revision to remain unchanged", () => {
    const p: BedPreparation = {
      roomId: "room",
      bedConfig: "MAT",
      bedRevision: 2,
      bedTypeId: "dbl",
      bedTypeNotes: null,
      confirmedBy: "actor",
      confirmedAt: "2026-10-21T10:00:00Z",
    };
    expect(preparationIsCurrent(p, "room", "MAT", "dbl", null, 2)).toBe(true);
    expect(preparationIsCurrent(p, "other", "MAT", "dbl", null, 2)).toBe(false);
    expect(
      preparationIsCurrent(p, "room", "MAT", "dbl", "Nuevo pedido", 2),
    ).toBe(false);
    expect(preparationIsCurrent(p, "room", "MAT", "dbl", null, 4)).toBe(false);
  });
  it("measures actual time across midnight without treating an estimate as completion", () => {
    expect(taskDuration("2026-10-22T02:55:00Z", "2026-10-22T03:05:12Z")).toBe(
      612,
    );
    expect(durationLabel(612)).toBe("10 min 12 s");
    expect(
      taskDuration(
        "2026-10-22T02:55:00Z",
        null,
        Date.parse("2026-10-22T03:05:12Z"),
      ),
    ).toBe(612);
    expect(taskDuration(null, null)).toBe(null);
    expect(taskDuration("invalid", null)).toBe(null);
    expect(taskDuration("2026-10-22", "2026-10-21")).toBe(null);
  });
});
