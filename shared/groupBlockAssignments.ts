export type AssignmentBlock = {
  id: string;
  roomTypeId: string;
  quantity: number;
  blockCheckInDate?: string | null;
  blockCheckOutDate?: string | null;
};
export type AssignmentReservation = {
  id: string;
  roomTypeId: string;
  roomId?: string | null;
  status: string;
  checkInDate: string;
  checkOutDate: string;
  guestId?: string | null;
  guest?: { codigo?: string | null } | null;
  room?: { isVirtual?: boolean | null; roomNumber?: string } | null;
};
export type AssignmentGroup = {
  id: string;
  checkInDate: string;
  checkOutDate: string;
  blocks: AssignmentBlock[];
  reservations: AssignmentReservation[];
  reservationBlockIds?: Record<string, string | null>;
  conflictingReservationBlockIds?: string[];
};
export function groupBlockDates(
  group: Pick<AssignmentGroup, "checkInDate" | "checkOutDate">,
  block: AssignmentBlock,
) {
  return {
    checkInDate: block.blockCheckInDate || group.checkInDate,
    checkOutDate: block.blockCheckOutDate || group.checkOutDate,
  };
}
export function compatibleGroupBlocks(
  group: AssignmentGroup,
  reservation: AssignmentReservation,
  preferExact = true,
) {
  const matches = group.blocks.filter((block) => {
    const dates = groupBlockDates(group, block);
    return (
      block.roomTypeId === reservation.roomTypeId &&
      dates.checkInDate <= reservation.checkInDate &&
      dates.checkOutDate >= reservation.checkOutDate
    );
  });
  const exact = matches.filter((block) => {
    const dates = groupBlockDates(group, block);
    return (
      dates.checkInDate === reservation.checkInDate &&
      dates.checkOutDate === reservation.checkOutDate
    );
  });
  return preferExact && exact.length ? exact : matches;
}
export const hasGroupPassenger = (
  groupId: string,
  reservation: AssignmentReservation,
) => !!reservation.guestId && reservation.guest?.codigo !== `GROUP-${groupId}`;

/** Contractual category and stay dates define legacy candidates. Array order,
 * current room category, rates and other blocks' occupancy never prove a link. */
export function summarizeGroupBlocks(group: AssignmentGroup) {
  const byBlock = Object.fromEntries(
    group.blocks.map((block) => [
      block.id,
      {
        block,
        ...groupBlockDates(group, block),
        reservations: [] as AssignmentReservation[],
        pendingRooms: block.quantity,
        pendingGuests: 0,
        departed: 0,
        reviewReservationIds: [] as string[],
      },
    ]),
  );
  const unresolved: Array<{
    reservation: AssignmentReservation;
    candidateBlockIds: string[];
    reason: "ambiguous" | "incompatible" | "missing";
  }> = [];
  const seen = new Set<string>();
  for (const reservation of group.reservations) {
    if (
      seen.has(reservation.id) ||
      ["cancelled", "no_show"].includes(reservation.status)
    )
      continue;
    seen.add(reservation.id);
    const candidates = compatibleGroupBlocks(group, reservation);
    const explicit = group.reservationBlockIds?.[reservation.id];
    const conflict = group.conflictingReservationBlockIds?.includes(
      reservation.id,
    );
    const selected =
      !conflict &&
      (explicit
        ? compatibleGroupBlocks(group, reservation, false).find(
            (b) => b.id === explicit,
          )
        : candidates.length === 1
          ? candidates[0]
          : undefined);
    if (selected) byBlock[selected.id].reservations.push(reservation);
    else {
      unresolved.push({
        reservation,
        candidateBlockIds: candidates.map((b) => b.id),
        reason:
          conflict || (!explicit && candidates.length > 1)
            ? "ambiguous"
            : explicit
              ? "incompatible"
              : "missing",
      });
      for (const block of candidates)
        byBlock[block.id].reviewReservationIds.push(reservation.id);
      if (
        explicit &&
        byBlock[explicit] &&
        !candidates.some((b) => b.id === explicit)
      )
        byBlock[explicit].reviewReservationIds.push(reservation.id);
    }
  }
  for (const item of Object.values(byBlock)) {
    item.departed = item.reservations.filter(
      (r) => r.status === "checked_out",
    ).length;
    item.pendingRooms = Math.max(
      0,
      item.block.quantity -
        item.reservations.filter(
          (r) => r.status === "checked_out" || (r.roomId && !r.room?.isVirtual),
        ).length,
    );
    item.pendingGuests = item.reservations.filter(
      (r) => r.status !== "checked_out" && !hasGroupPassenger(group.id, r),
    ).length;
  }
  return { byBlock, unresolved };
}
