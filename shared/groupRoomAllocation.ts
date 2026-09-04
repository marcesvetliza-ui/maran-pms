/**
 * Cent-exact automatic allocation for a group payment.  This is deliberately
 * separate from directed distributionDetail: callers must validate a directed
 * operator instruction independently rather than silently rewriting it.
 */
export type GroupRoomAllocationMode = "equal" | "proportional";

export type GroupRoomAllocationEntry = {
  id: string;
  /** Remaining room balance, in major currency units. */
  balance: number;
};

export type GroupRoomAllocationResult = {
  allocations: Record<string, number>;
  allocatedCents: number;
  unallocatedCents: number;
  mode: GroupRoomAllocationMode;
};

const toCents = (value: unknown) => Math.max(0, Math.round((Number(value) || 0) * 100));

export function resolveAutomaticGroupRoomAllocationMode(
  requestedMode: unknown,
  hasPriorNonFiscalAdvances = false,
): GroupRoomAllocationMode {
  // A prior non-fiscal advance has already made room balances unequal.  New
  // automatic collection must follow those remaining balances, never reset to
  // an equal split merely because the dialog still says "equal".
  if (hasPriorNonFiscalAdvances) return "proportional";
  return requestedMode === "proportional" ? "proportional" : "equal";
}

export function allocateBalanceCappedGroupRooms(
  requestedTotal: number,
  entries: GroupRoomAllocationEntry[],
  requestedMode: unknown,
  hasPriorNonFiscalAdvances = false,
): GroupRoomAllocationResult {
  const mode = resolveAutomaticGroupRoomAllocationMode(requestedMode, hasPriorNonFiscalAdvances);
  const rooms = entries
    .map(({ id, balance }) => ({ id, capacity: toCents(balance) }))
    .filter((room) => room.id && room.capacity > 0)
    .sort((a, b) => a.id.localeCompare(b.id));
  const requestedCents = toCents(requestedTotal);
  const capacityCents = rooms.reduce((sum, room) => sum + room.capacity, 0);
  const targetCents = Math.min(requestedCents, capacityCents);
  const assigned = new Map(rooms.map((room) => [room.id, 0]));

  if (mode === "proportional" && targetCents > 0 && capacityCents > 0) {
    const shares = rooms.map((room) => {
      const numerator = targetCents * room.capacity;
      return {
        ...room,
        cents: Math.floor(numerator / capacityCents),
        remainder: numerator % capacityCents,
      };
    });
    let remaining = targetCents - shares.reduce((sum, share) => sum + share.cents, 0);
    for (const share of [...shares].sort((a, b) => b.remainder - a.remainder || a.id.localeCompare(b.id))) {
      if (remaining <= 0) break;
      share.cents++;
      remaining--;
    }
    for (const share of shares) assigned.set(share.id, share.cents);
  } else {
    // Water-fill equal shares. Rooms that cannot receive their equal share cap
    // out, then the remaining cents are divided across the still-open rooms.
    let remaining = targetCents;
    let open = rooms.map((room) => ({ ...room }));
    while (remaining > 0 && open.length > 0) {
      const base = Math.floor(remaining / open.length);
      const extra = remaining % open.length;
      let applied = 0;
      const next: typeof open = [];
      for (const [index, room] of open.entries()) {
        const current = assigned.get(room.id) || 0;
        const desired = base + (index < extra ? 1 : 0);
        const grant = Math.min(desired, room.capacity - current);
        assigned.set(room.id, current + grant);
        applied += grant;
        if (current + grant < room.capacity) next.push(room);
      }
      if (applied <= 0) break;
      remaining -= applied;
      open = next;
    }
  }

  const allocatedCents = [...assigned.values()].reduce((sum, amount) => sum + amount, 0);
  return {
    allocations: Object.fromEntries(rooms.map((room) => [room.id, (assigned.get(room.id) || 0) / 100])),
    allocatedCents,
    unallocatedCents: requestedCents - allocatedCents,
    mode,
  };
}