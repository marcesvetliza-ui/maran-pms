import { describe, expect, it } from "vitest";
import {
  BED_CONFIG_OPTIONS,
  bedConfigLabels,
  getBedConfigLabel,
  getPlanningStatusForDate,
  isPlanningRoomOccupied,
} from "./planning-utils";

describe("Planning room filters by reference date", () => {
  const dayIndexMap = {
    "2026-09-10": 0,
    "2026-09-11": 1,
    "2026-09-12": 2,
  };
  const occupancy = ["available", "booked", "checked_in"] as const;

  it("reads only the status for the selected date", () => {
    expect(getPlanningStatusForDate(occupancy, dayIndexMap, "2026-09-10")).toBe("available");
    expect(getPlanningStatusForDate(occupancy, dayIndexMap, "2026-09-11")).toBe("booked");
  });

  it("returns undefined when the date is outside the loaded range", () => {
    expect(getPlanningStatusForDate(occupancy, dayIndexMap, "2026-09-20")).toBeUndefined();
  });

  it("distinguishes occupied and operationally empty statuses", () => {
    expect(isPlanningRoomOccupied("checked_in")).toBe(true);
    expect(isPlanningRoomOccupied("booked")).toBe(true);
    expect(isPlanningRoomOccupied("available")).toBe(false);
    expect(isPlanningRoomOccupied("dirty")).toBe(false);
    expect(isPlanningRoomOccupied(undefined)).toBe(false);
  });
});

describe("Shared bed configuration catalog", () => {
  it("keeps the persisted codes and one canonical label per code", () => {
    expect(BED_CONFIG_OPTIONS).toEqual([
      { value: "MAT", label: "Matrimonial" },
      { value: "TWIN", label: "Twin (2 camas)" },
      { value: "MAT_CC", label: "Matrimonial + Cama cucheta" },
      { value: "TWIN_CC", label: "Twin + Cama cucheta" },
      { value: "MAT_EXTRA", label: "Matrimonial + Extra" },
      { value: "MAT_CC_EXTRA", label: "Matrimonial + Cama cucheta + Extra" },
    ]);
    expect(
      BED_CONFIG_OPTIONS.every(({ value, label }) => bedConfigLabels[value] === label),
    ).toBe(true);
  });

  it("preserves unknown legacy values when displaying them", () => {
    expect(getBedConfigLabel("LEGACY")).toBe("LEGACY");
  });

  it("renders a persisted reservation code with the catalog label", () => {
    const persistedBedTypeNotes = "MAT_CC";

    expect(getBedConfigLabel(persistedBedTypeNotes)).toBe(
      bedConfigLabels.MAT_CC,
    );
  });
});