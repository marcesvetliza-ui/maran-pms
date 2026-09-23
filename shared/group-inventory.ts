/**
 * Pure group inventory accounting.  This module deliberately has no database
 * dependency so the exact same accounting can be used by HTTP validation and
 * focused unit tests.
 */
export const GROUP_BLOCK_WARNING_CODE = "GROUP_BLOCK_WARNING" as const;
export const GROUP_BLOCK_SHORTAGE_CODE = "GROUP_BLOCK_SHORTAGE" as const;

export type GroupInventoryStatus = "tentative" | "blocked" | "confirmed" | "inhouse";

export type GroupInventoryWarning = {
  code: typeof GROUP_BLOCK_WARNING_CODE;
  roomTypeId: string;
  date: string;
  groupId: string;
  groupName?: string;
  requested: number;
  blockQuantity: number;
  availableOperational: number;
  canOverride: true;
};

export type GroupInventoryConflict = {
  code: typeof GROUP_BLOCK_SHORTAGE_CODE | typeof GROUP_BLOCK_WARNING_CODE;
  canOverride: boolean;
  warnings: GroupInventoryWarning[];
  date?: string;
  roomTypeId?: string;
  roomTypeName?: string;
  hardDemand?: number;
  operationalInventory?: number;
};

export type InventoryGroup = {
  id: string;
  name?: string;
  status: string;
  checkInDate: string;
  checkOutDate: string;
};

export type InventoryBlock = {
  groupId: string;
  roomTypeId: string;
  quantity: number;
  blockCheckInDate?: string | null;
  blockCheckOutDate?: string | null;
};

export type InventoryReservation = {
  id: string;
  roomTypeId: string;
  checkInDate: string;
  checkOutDate: string;
  status: string;
  groupId?: string | null;
};

export type GroupInventoryInput = {
  roomTypeId: string;
  checkIn: string;
  checkOut: string;
  operationalInventory: number;
  groups: InventoryGroup[];
  blocks: InventoryBlock[];
  reservations: InventoryReservation[];
  excludeReservationId?: string;
  contextGroupId?: string;
  /** Number of new units being evaluated (0 validates existing commitments). */
  candidateUnits?: number;
};

const IGNORED_RESERVATION_STATUSES = new Set(["cancelled", "checked_out", "no_show"]);
const HARD_GROUP_STATUSES = new Set(["confirmed", "inhouse"]);
const SOFT_GROUP_STATUSES = new Set(["tentative", "blocked"]);

function nights(from: string, to: string): string[] {
  const result: string[] = [];
  const cursor = new Date(`${from}T00:00:00Z`);
  const end = new Date(`${to}T00:00:00Z`);
  while (cursor < end) {
    result.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return result;
}

function overlaps(from: string, to: string, otherFrom: string, otherTo: string): boolean {
  return otherFrom < to && otherTo > from;
}

function blockDates(block: InventoryBlock, group?: InventoryGroup): [string, string] {
  return [
    block.blockCheckInDate || group?.checkInDate || "",
    block.blockCheckOutDate || group?.checkOutDate || "",
  ];
}

/**
 * Evaluates one prospective room-type reservation for every night in its
 * half-open stay interval.  Active linked reservations consume their group's
 * block first; only the unconsumed remainder of a block is added to demand.
 */
export function evaluateGroupInventory(input: GroupInventoryInput): GroupInventoryConflict | null {
  const groupById = new Map(input.groups.map(group => [group.id, group]));
  const relevantBlocks = input.blocks
    .filter(block => block.roomTypeId === input.roomTypeId)
    .map(block => ({ block, group: groupById.get(block.groupId) }))
    .filter(({ block, group }) => {
      if (!group || (!HARD_GROUP_STATUSES.has(group.status) && !SOFT_GROUP_STATUSES.has(group.status))) return false;
      const [from, to] = blockDates(block, group);
      return !!from && !!to && overlaps(input.checkIn, input.checkOut, from, to);
    });
  const active = input.reservations.filter(reservation =>
    reservation.id !== input.excludeReservationId &&
    reservation.roomTypeId === input.roomTypeId &&
    !IGNORED_RESERVATION_STATUSES.has(reservation.status) &&
    overlaps(input.checkIn, input.checkOut, reservation.checkInDate, reservation.checkOutDate),
  );
  const warningRows: GroupInventoryWarning[] = [];
  const dateList = nights(input.checkIn, input.checkOut);

  for (const date of dateList) {
    const blocks = relevantBlocks.filter(({ block, group }) => {
      const [from, to] = blockDates(block, group);
      return from <= date && date < to;
    });
    const candidateUnits = Math.max(0, input.candidateUnits ?? 1);
    const candidateInBlock = input.contextGroupId && blocks.some(({ block }) => block.groupId === input.contextGroupId);
    const normalDemand = active.filter(reservation => {
      if (!(reservation.checkInDate <= date && date < reservation.checkOutDate)) return false;
      const linkedBlock = reservation.groupId
        ? blocks.find(({ block }) => block.groupId === reservation.groupId)
        : undefined;
      return !linkedBlock;
    }).length + (candidateInBlock ? 0 : candidateUnits);

    let hardDemand = normalDemand;
    const softRows: Array<{
      block: InventoryBlock;
      group: InventoryGroup;
      remaining: number;
    }> = [];
    for (const { block, group } of blocks) {
      const linkedCount = active.filter(reservation =>
        reservation.groupId === block.groupId &&
        reservation.checkInDate <= date && date < reservation.checkOutDate,
      ).length;
      const isCandidateInBlock = input.contextGroupId === block.groupId;
      const effectiveLinkedCount = linkedCount + (isCandidateInBlock ? candidateUnits : 0);
      if (HARD_GROUP_STATUSES.has(group!.status)) {
        hardDemand += Math.max(block.quantity, effectiveLinkedCount);
      } else if (SOFT_GROUP_STATUSES.has(group!.status)) {
        hardDemand += effectiveLinkedCount;
        const remaining = Math.max(block.quantity - effectiveLinkedCount, 0);
        if (remaining > 0) softRows.push({ block, group: group!, remaining });
      }
    }
    if (hardDemand > input.operationalInventory) {
      return {
        code: GROUP_BLOCK_SHORTAGE_CODE,
        canOverride: false,
        warnings: warningRows,
        date,
        roomTypeId: input.roomTypeId,
        hardDemand,
        operationalInventory: input.operationalInventory,
      };
    }
    const totalSoftRemaining = softRows.reduce((sum, row) => sum + row.remaining, 0);
    if (hardDemand + totalSoftRemaining > input.operationalInventory) {
      for (const { block, group, remaining } of softRows) {
        warningRows.push({
          code: GROUP_BLOCK_WARNING_CODE,
          roomTypeId: input.roomTypeId,
          date,
          groupId: block.groupId,
          groupName: group.name,
          requested: remaining,
          blockQuantity: block.quantity,
          availableOperational: input.operationalInventory,
          canOverride: true,
        });
      }
    }
  }
  return warningRows.length ? {
    code: GROUP_BLOCK_WARNING_CODE,
    canOverride: true,
    warnings: warningRows,
  } : null;
}