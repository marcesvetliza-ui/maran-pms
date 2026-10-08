import type { HousekeepingPreparation } from "@shared/schema";
export function preparationMoveWarning(
  preparation: HousekeepingPreparation | null,
  roomId: string | null,
  target: string | undefined,
  ack: unknown,
) {
  if (
    !target ||
    target === roomId ||
    !preparation ||
    preparation.state !== "prepared" ||
    preparation.roomId !== roomId ||
    ack === preparation.markedAt
  )
    return null;
  return {
    code: "HOUSEKEEPING_PREPARATION_WARNING",
    canOverride: true,
    error: `Housekeeping pidió no mover esta asignación. La preparación especial de esta habitación puede no estar en la nueva. ${preparation.note || ""}`,
    preparationVersion: preparation.markedAt,
  };
}
