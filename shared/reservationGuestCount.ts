// Preserve a larger booked party when not all companions have been identified.
// Once the entire party is named, additions/removals can adjust it exactly.
export function guestCountAfterCompanionChange(booked: number, before: number, after: number): number {
  const previousKnown = before + 1;
  const nextKnown = after + 1;
  return booked <= previousKnown ? nextKnown : Math.max(booked, nextKnown);
}
