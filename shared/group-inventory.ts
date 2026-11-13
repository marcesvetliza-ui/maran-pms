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
  unassignedConfirmedGroupUnits?: number;
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
  roomId?: string;
  roomTypeId: string;
  checkInDate: string;
  checkOutDate: string;
  status: string;
  checkedOutAt?: Date | string | null;
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
  /** Set only after checking a concrete operational room for overlap. */
  hasSpecificRoom?: boolean;
  override?: boolean;
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

const departureDayFormat = new Intl.DateTimeFormat('en-CA', {timeZone:'America/Argentina/Buenos_Aires',year:'numeric',month:'2-digit',day:'2-digit'});
function departureDay(reservation: InventoryReservation): string {
  const stamp=reservation.checkedOutAt;
  if(!stamp)return reservation.checkOutDate;
  // The PostgreSQL timestamp column stores UTC without an offset.
  const date=stamp instanceof Date?stamp:new Date(/(?:Z|[+-]\d\d:\d\d)$/i.test(stamp)?stamp:stamp+'Z');
  return Number.isNaN(date.getTime())?reservation.checkOutDate:departureDayFormat.format(date);
}

/** A completed room assignment is fulfilled, not an unassigned arrival.
 * Keep real unassigned units, never use cancelled/no-show records as releases,
 * and never credit an old stay against an unrelated later block.
 */
function releasedGroupUnits(completedStays:Array<{reservation:InventoryReservation;releasedOn:string}>,groupId:string,date:string,blocks:Array<{from:string;to:string;quantity:number}>,active:InventoryReservation[]) {
  const occupied=new Set(active.filter(r=>r.groupId===groupId&&r.checkInDate<=date&&date<r.checkOutDate).map(r=>r.roomId||r.id));
  const completed=new Map<string,InventoryReservation>();
  for(const {reservation:r,releasedOn} of completedStays){
    if(r.groupId!==groupId||r.checkInDate>date||releasedOn>date)continue;
    const key=r.roomId||r.id;
    if(!occupied.has(key))completed.set(key,r);
  }
  const slots=blocks.map(block=>({...block,remaining:block.quantity}));
  // Cap each release by a block that the original stay actually consumed.
  // Most constrained assignments first; ambiguous allocations stay conservative.
  const eligible=[...completed.values()].map(r=>({r,matches:slots.filter(s=>overlaps(r.checkInDate,r.checkOutDate,s.from,s.to))})).sort((a,b)=>a.matches.length-b.matches.length);
  let released=0;
  for(const item of eligible){const slot=item.matches.find(s=>s.remaining>0);if(slot){slot.remaining--;released++;}}
  return released;
}

/**
 * Evaluates one prospective room-type reservation for every night in its
 * half-open stay interval.  Active linked reservations consume their group's
 * block first; completed assignments release their units from their actual
 * departure day. Only a genuinely unassigned remainder is added to demand.
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
  const relevantGroupIds=new Set(relevantBlocks.map(({block})=>block.groupId));
  const completedStays=input.reservations.filter(r=>r.status==='checked_out'
    &&r.id!==input.excludeReservationId&&r.roomTypeId===input.roomTypeId
    &&!!r.groupId&&relevantGroupIds.has(r.groupId))
    .map(reservation=>({reservation,releasedOn:departureDay(reservation)}));
  const active = input.reservations.filter(reservation =>
    reservation.id !== input.excludeReservationId &&
    reservation.roomTypeId === input.roomTypeId &&
    !IGNORED_RESERVATION_STATUSES.has(reservation.status) &&
    overlaps(input.checkIn, input.checkOut, reservation.checkInDate, reservation.checkOutDate),
  );
  const warningRows: GroupInventoryWarning[] = [];
  let categoryWarning: GroupInventoryConflict | null = null;
  const dateList = nights(input.checkIn, input.checkOut);

  for (const date of dateList) {
    const blocks = relevantBlocks.filter(({ block, group }) => {
      const [from, to] = blockDates(block, group);
      return from <= date && date < to;
    });
    // Blocks of the same type and group add their quantities, while linked
    // reservations consume their combined commitment only once.
    const blocksByGroup = new Map<string, { group: InventoryGroup; quantity: number; intervals:Array<{from:string;to:string;quantity:number}> }>();
    for (const { block, group } of blocks) {
      const previous = blocksByGroup.get(block.groupId);
      blocksByGroup.set(block.groupId, {
        group: group!,
        quantity: (previous?.quantity ?? 0) + block.quantity,
        intervals:[...(previous?.intervals||[]),{from:blockDates(block,group)[0],to:blockDates(block,group)[1],quantity:block.quantity}],
      });
    }
    const candidateUnits = Math.max(0, input.candidateUnits ?? 1);
    const candidateInBlock = !!input.contextGroupId && blocksByGroup.has(input.contextGroupId);
    const normalDemand = active.filter(reservation => {
      if (!(reservation.checkInDate <= date && date < reservation.checkOutDate)) return false;
      return !reservation.groupId || !blocksByGroup.has(reservation.groupId);
    }).length + (candidateInBlock ? 0 : candidateUnits);

    let hardDemand = normalDemand;
    let unassignedHardCommitment = 0;
    const softRows: Array<{
      group: InventoryGroup;
      quantity: number;
      remaining: number;
    }> = [];
    for (const [groupId, { group, quantity, intervals }] of blocksByGroup) {
      const linkedCount = active.filter(reservation =>
        reservation.groupId === groupId &&
        reservation.checkInDate <= date && date < reservation.checkOutDate,
      ).length;
      const isCandidateInBlock = input.contextGroupId === groupId;
      const effectiveLinkedCount = linkedCount + (isCandidateInBlock ? candidateUnits : 0);
      const remainingCommitment=Math.max(0,quantity-releasedGroupUnits(completedStays,groupId,date,intervals,active));
      if (HARD_GROUP_STATUSES.has(group.status)) {
        hardDemand += Math.max(remainingCommitment, effectiveLinkedCount);
        unassignedHardCommitment += Math.max(remainingCommitment - effectiveLinkedCount, 0);
      } else if (SOFT_GROUP_STATUSES.has(group.status)) {
        hardDemand += effectiveLinkedCount;
        const remaining = Math.max(remainingCommitment - effectiveLinkedCount, 0);
        if (remaining > 0) softRows.push({ group, quantity, remaining });
      }
    }
    if (hardDemand > input.operationalInventory) {
      const overridable = input.hasSpecificRoom === true && unassignedHardCommitment === 0;
      const conflict: GroupInventoryConflict = {
        code: overridable ? GROUP_BLOCK_WARNING_CODE : GROUP_BLOCK_SHORTAGE_CODE,
        canOverride: overridable,
        warnings: [],
        date,
        roomTypeId: input.roomTypeId,
        hardDemand,
        operationalInventory: input.operationalInventory,
        unassignedConfirmedGroupUnits: unassignedHardCommitment,
      };
      if (!overridable) return conflict;
      if (!input.override && !categoryWarning) categoryWarning = conflict;
      // Keep checking all later nights: acceptance never bypasses hard groups.
    }
    const totalSoftRemaining = softRows.reduce((sum, row) => sum + row.remaining, 0);
    if (hardDemand + totalSoftRemaining > input.operationalInventory) {
      for (const { group, quantity, remaining } of softRows) {
        warningRows.push({
          code: GROUP_BLOCK_WARNING_CODE,
          roomTypeId: input.roomTypeId,
          date,
          groupId: group.id,
          groupName: group.name,
          requested: remaining,
          blockQuantity: quantity,
          availableOperational: input.operationalInventory,
          canOverride: true,
        });
      }
    }
  }
  if (categoryWarning) return categoryWarning;
  return warningRows.length && !input.override ? {
    code: GROUP_BLOCK_WARNING_CODE,
    canOverride: true,
    warnings: warningRows,
  } : null;
}
