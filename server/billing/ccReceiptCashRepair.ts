import { createHash } from "node:crypto";
import type { PoolClient, QueryResultRow } from "pg";
import { getCashShiftAreaVariants } from "../cashArea";
import { pool } from "../db";

type ReceiptRow = QueryResultRow & {
  id: string;
  entity_type: string;
  entity_id: string;
  type: string;
  amount: string;
  retentions: unknown;
  reservation_id: string | null;
  payment_id: string | null;
  group_payment_id: string | null;
  voided: boolean;
  reversal_movement_id: string | null;
  reversal_of_movement_id: string | null;
  created_at: Date | string;
  receipt_number: string | null;
};

type CashRow = QueryResultRow & {
  id: string;
  shift_id: string | null;
  area: string;
  source_type: string;
  source_id: string | null;
  payment_method: string;
  amount: string;
  movement_type: string;
  payment_id: string | null;
  anulado: boolean;
};

type ShiftRow = QueryResultRow & {
  id: string;
  area: string;
  shift_number: number;
  opened_at: Date | string;
  closed_at: Date | string | null;
  status: string;
};

export type CashShiftRepairPreview = {
  receiptId: string;
  receiptNumber: string | null;
  grossAmount: string;
  cashAmount: string;
  retentionAmount: string;
  movementCount: number;
  fromShifts: Array<{
    id: string;
    area: string;
    shiftNumber: number;
    openedAt: string;
    status: string;
  }>;
  targetShift: {
    id: string;
    area: string;
    shiftNumber: number;
    openedAt: string;
    status: string;
  } | null;
  canRepair: boolean;
  status: "needs_repair" | "already_correct" | "blocked";
  message: string;
  previewToken: string | null;
};

export class CashShiftRepairError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly preview?: CashShiftRepairPreview,
  ) {
    super(message);
  }
}

function dateIso(value: Date | string | null): string | null {
  if (value === null) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toISOString();
}

function cents(value: unknown): number | null {
  const raw = String(value ?? "");
  const match = /^(-?)(\d+)(?:\.(\d{1,2}))?$/.exec(raw);
  if (!match) return null;
  const whole = Number(match[2]);
  const fraction = Number((match[3] || "").padEnd(2, "0"));
  const result = whole * 100 + fraction;
  return Number.isSafeInteger(result) ? (match[1] ? -result : result) : null;
}

function money(amountCents: number): string {
  return `${amountCents < 0 ? "-" : ""}${Math.floor(Math.abs(amountCents) / 100)}.${String(Math.abs(amountCents) % 100).padStart(2, "0")}`;
}

function hasValue(value: unknown): boolean {
  return value !== null && value !== undefined && String(value).trim() !== "";
}

function equivalentAreas(left: string, right: string): boolean {
  const leftVariants = new Set(getCashShiftAreaVariants(left));
  return getCashShiftAreaVariants(right).some((variant) => leftVariants.has(variant));
}

function publicShift(shift: ShiftRow) {
  return {
    id: shift.id,
    area: shift.area,
    shiftNumber: Number(shift.shift_number),
    openedAt: dateIso(shift.opened_at)!,
    status: shift.status,
  };
}

function sha256Evidence(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

async function loadReceipt(client: PoolClient, receiptId: string, lock: boolean): Promise<ReceiptRow | null> {
  const result = await client.query<ReceiptRow>(
    `SELECT * FROM account_movements WHERE id = $1${lock ? " FOR UPDATE" : ""}`,
    [receiptId],
  );
  return result.rows[0] ?? null;
}

async function loadCashRows(client: PoolClient, receiptId: string, lock: boolean): Promise<CashRow[]> {
  const result = await client.query<CashRow>(
    `SELECT * FROM cash_movements
     WHERE source_id = $1
     ORDER BY id${lock ? " FOR UPDATE" : ""}`,
    [receiptId],
  );
  return result.rows;
}

async function loadShifts(client: PoolClient, ids: string[], areas: string[], lock: boolean): Promise<ShiftRow[]> {
  if (ids.length === 0 && areas.length === 0) return [];
  const result = await client.query<ShiftRow>(
    `SELECT id, area, shift_number, opened_at, closed_at, status
     FROM cash_shifts
     WHERE id = ANY($1::varchar[])
        OR (area = ANY($2::text[]) AND status = 'open')
     ORDER BY id${lock ? " FOR UPDATE" : ""}`,
    [ids, areas],
  );
  return result.rows;
}

function receiptBlockReason(receipt: ReceiptRow, grossCents: number): string | null {
  if (!["company", "agency", "guest"].includes(receipt.entity_type) || receipt.type !== "pago") {
    return "Solo se pueden reparar recibos directos de Cuenta Corriente de empresa, agencia o huésped.";
  }
  if (
    receipt.voided ||
    hasValue(receipt.voided_at) ||
    hasValue(receipt.voided_by) ||
    hasValue(receipt.void_reason) ||
    hasValue(receipt.reversal_movement_id) ||
    hasValue(receipt.reversal_of_movement_id)
  ) {
    return "El recibo está anulado o vinculado a una reversión.";
  }
  if (
    hasValue(receipt.reservation_id) ||
    hasValue(receipt.payment_id) ||
    hasValue(receipt.group_payment_id)
  ) {
    return "El recibo tiene vínculos con una reserva, pago o pago grupal y no es un recibo directo.";
  }
  if (grossCents <= 0 || cents(receipt.amount)! >= 0) return "El importe del recibo no es un pago negativo válido.";
  return null;
}

function retentionAmounts(receipt: ReceiptRow): number | null {
  if (receipt.retentions === null || receipt.retentions === undefined) return 0;
  let rows: unknown = receipt.retentions;
  if (typeof rows === "string") {
    try {
      rows = JSON.parse(rows);
    } catch {
      return null;
    }
  }
  if (!Array.isArray(rows)) return null;
  let total = 0;
  for (const row of rows) {
    if (!row || typeof row !== "object" || !("monto" in row)) return null;
    const amount = cents((row as { monto: unknown }).monto);
    if (amount === null || amount < 0) return null;
    total += amount;
  }
  return total;
}

function createPreview(
  receipt: ReceiptRow,
  cashRows: CashRow[],
  shifts: ShiftRow[],
): CashShiftRepairPreview {
  const grossCentsValue = cents(receipt.amount);
  const grossCents = grossCentsValue === null ? 0 : Math.abs(grossCentsValue);
  const shiftById = new Map(shifts.map((shift) => [shift.id, shift]));
  const uniqueSourceShiftIds = Array.from(new Set(cashRows.map((row) => row.shift_id).filter((id): id is string => Boolean(id))));
  const fromShifts = uniqueSourceShiftIds
    .map((id) => shiftById.get(id))
    .filter((shift): shift is ShiftRow => Boolean(shift))
    .map(publicShift)
    .sort((left, right) => left.id.localeCompare(right.id));

  const incomeCents: number[] = [];
  const informationalCents: number[] = [];
  let reason = receiptBlockReason(receipt, grossCents);
  for (const row of cashRows) {
    const amountCents = cents(row.amount);
    if (amountCents === null) continue;
    if (row.movement_type === "income") incomeCents.push(amountCents);
    if (row.movement_type === "informational") informationalCents.push(amountCents);
  }

  if (!reason && cashRows.length === 0) reason = "No hay movimientos de Caja vinculados que se puedan reasignar.";
  if (!reason && cashRows.some((row) => row.source_type !== "recibo_cta_cte")) {
    reason = "Hay movimientos con el mismo identificador pero un origen de Caja diferente.";
  }
  if (!reason && cashRows.some((row) =>
    row.anulado ||
    hasValue(row.motivo_anulacion) ||
    hasValue(row.anulado_por) ||
    hasValue(row.anulado_at)
  )) reason = "El conjunto de movimientos contiene filas anuladas.";
  if (!reason && cashRows.some((row) => hasValue(row.payment_id))) {
    reason = "El conjunto de Caja incluye movimientos vinculados a pagos externos.";
  }
  if (!reason && cashRows.some((row) => !row.shift_id)) {
    reason = "Falta el turno de origen de uno o más movimientos.";
  }
  if (!reason && cashRows.some((row) => {
    const amountCents = cents(row.amount);
    return amountCents === null || amountCents <= 0 ||
      !["income", "informational"].includes(row.movement_type);
  })) {
    reason = "El conjunto de Caja tiene importes inválidos o movimientos que no son ingresos/retenciones informativas.";
  }
  if (!reason) {
    if (incomeCents.reduce((sum, amount) => sum + amount, 0) + informationalCents.reduce((sum, amount) => sum + amount, 0) !== grossCents) {
      reason = "Los movimientos vinculados no suman exactamente el importe contable del recibo.";
    }
  }

  const rowAreas = Array.from(new Set(cashRows.map((row) => row.area)));
  if (!reason && rowAreas.some((area) => !equivalentAreas(rowAreas[0], area))) {
    reason = "Los movimientos están repartidos entre áreas de Caja diferentes.";
  }
  const sourceShifts = uniqueSourceShiftIds.map((id) => shiftById.get(id)).filter((shift): shift is ShiftRow => Boolean(shift));
  if (!reason && sourceShifts.length !== uniqueSourceShiftIds.length) {
    reason = "No se encontró uno o más turnos de origen.";
  }
  if (!reason && cashRows.some((row) => {
    const sourceShift = row.shift_id ? shiftById.get(row.shift_id) : undefined;
    return !sourceShift || !equivalentAreas(row.area, sourceShift.area);
  })) {
    reason = "El área de uno o más movimientos no coincide con la de su turno de origen.";
  }
  if (!reason && sourceShifts.some((shift) => shift.status !== "open")) {
    reason = "No se puede reparar porque uno o más turnos de origen están cerrados.";
  }

  const areaVariants = rowAreas.length && rowAreas.every((area) => equivalentAreas(rowAreas[0], area))
    ? getCashShiftAreaVariants(rowAreas[0])
    : [];
  const openCandidates = shifts
    .filter((shift) => areaVariants.includes(shift.area) && shift.status === "open")
    .sort((left, right) => {
      const openedDelta = new Date(right.opened_at).getTime() - new Date(left.opened_at).getTime();
      return openedDelta || left.id.localeCompare(right.id);
    });
  const target = openCandidates[0] ?? null;
  const targetShift = target ? publicShift(target) : null;

  if (!reason && !target) reason = "No hay un turno abierto equivalente para recibir estos movimientos.";
  if (!reason && target && cashRows.some((row) => !equivalentAreas(row.area, target.area))) {
    reason = "El turno abierto de destino pertenece a un área diferente.";
  }
  if (!reason && target && new Date(target.opened_at).getTime() > new Date(receipt.created_at).getTime()) {
    reason = "La fecha de creación del recibo queda antes de la apertura del turno de destino.";
  }
  const retentionDetailCents = retentionAmounts(receipt);
  if (!reason && retentionDetailCents === null) reason = "El detalle de retenciones del recibo no es válido.";
  if (!reason && retentionDetailCents !== null &&
    informationalCents.reduce((sum, amount) => sum + amount, 0) !== retentionDetailCents) {
    reason = "Las retenciones informativas de Caja no coinciden con las retenciones del recibo.";
  }

  const allRowsAlreadyCorrect = Boolean(target) && cashRows.length > 0 &&
    cashRows.every((row) => row.shift_id === target!.id && row.area === target!.area);
  const status: CashShiftRepairPreview["status"] = reason
    ? "blocked"
    : allRowsAlreadyCorrect
      ? "already_correct"
      : "needs_repair";
  const canRepair = status === "needs_repair";

  const financialReceiptEvidence = { ...receipt };
  const cashEvidence = cashRows.map((row) => ({ ...row })).sort((left, right) => left.id.localeCompare(right.id));
  const sourceShiftEvidence = sourceShifts
    .map((shift) => ({ ...shift }))
    .sort((left, right) => left.id.localeCompare(right.id));
  const targetEvidence = target ? { ...target } : null;
  const previewToken = status === "blocked"
    ? null
    : sha256Evidence({
      receipt: financialReceiptEvidence,
      cashRows: cashEvidence,
      sourceShifts: sourceShiftEvidence,
      targetShift: targetEvidence,
      amountCents: grossCents,
    });

  return {
    receiptId: receipt.id,
    receiptNumber: receipt.receipt_number,
    grossAmount: money(grossCents),
    cashAmount: money(incomeCents.reduce((sum, amount) => sum + amount, 0)),
    retentionAmount: money(informationalCents.reduce((sum, amount) => sum + amount, 0)),
    movementCount: cashRows.length,
    fromShifts,
    targetShift,
    canRepair,
    status,
    message: reason ?? (status === "already_correct"
      ? "Los movimientos ya están asignados al turno abierto correcto."
      : "Los movimientos se pueden reasignar al turno abierto indicado."),
    previewToken,
  };
}

async function previewOnClient(client: PoolClient, receiptId: string, lock: boolean): Promise<CashShiftRepairPreview> {
  const receipt = await loadReceipt(client, receiptId, lock);
  if (!receipt) throw new CashShiftRepairError("No se encontró el recibo de Cuenta Corriente.", 404);
  const cashRows = await loadCashRows(client, receiptId, lock);
  const ids = cashRows.map((row) => row.shift_id).filter((id): id is string => Boolean(id));
  const areas = Array.from(new Set(cashRows.flatMap((row) => getCashShiftAreaVariants(row.area))));
  const shifts = await loadShifts(client, ids, areas, lock);
  return createPreview(receipt, cashRows, shifts);
}

export async function getCashShiftRepairPreview(receiptId: string): Promise<CashShiftRepairPreview> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    const preview = await previewOnClient(client, receiptId, false);
    await client.query("COMMIT");
    return preview;
  } catch (error) {
    await client.query("ROLLBACK");
    const code = (error as { code?: string } | null)?.code;
    if (code === "40001" || code === "40P01") {
      throw new CashShiftRepairError(
        "La operación entró en conflicto con un cambio concurrente; generá una nueva vista previa e intentá nuevamente.",
        409,
      );
    }
    throw error;
  } finally {
    client.release();
  }
}

export async function applyCashShiftRepair(input: {
  receiptId: string;
  previewToken: string;
  targetShiftId: string;
  actor: { id?: string | null; fullName?: string | null; username?: string | null; ipAddress?: string | null };
}): Promise<CashShiftRepairPreview> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN ISOLATION LEVEL SERIALIZABLE");
    // Lock in the documented order: receipt, all linked cash rows, then source
    // and candidate destination shifts sorted by id.
    const preview = await previewOnClient(client, input.receiptId, true);
    if (!/^[a-f0-9]{64}$/.test(input.previewToken) || !preview.previewToken) {
      throw new CashShiftRepairError("La vista previa no contiene un token válido.", 409, preview);
    }
    if (!preview.targetShift || preview.targetShift.id !== input.targetShiftId) {
      throw new CashShiftRepairError("El turno de destino ya no coincide con la vista previa.", 409, preview);
    }
    if (preview.status === "already_correct") {
      const tokenMatchesCurrentEvidence = preview.previewToken === input.previewToken;
      const priorApply = tokenMatchesCurrentEvidence
        ? true
        : (await client.query(
          `SELECT 1
           FROM audit_logs
           WHERE module = 'cc-receipt-cash-repair'
             AND entity_type = 'account_movement'
             AND entity_id = $1
             AND user_id IS NOT DISTINCT FROM $2
             AND details::jsonb->>'previewToken' = $3
             AND details::jsonb #>> '{targetShift,id}' = $4
           LIMIT 1`,
          [input.receiptId, input.actor.id || null, input.previewToken, input.targetShiftId],
        )).rows.length > 0;
      if (!priorApply) {
        throw new CashShiftRepairError("La evidencia cambió desde la vista previa; generá una nueva vista previa.", 409, preview);
      }
      await client.query("COMMIT");
      return preview;
    }
    if (preview.previewToken !== input.previewToken) {
      throw new CashShiftRepairError("La evidencia cambió desde la vista previa; generá una nueva vista previa.", 409, preview);
    }
    if (!preview.canRepair) {
      throw new CashShiftRepairError(preview.message, 409, preview);
    }

    const receipt = await loadReceipt(client, input.receiptId, false);
    if (!receipt) throw new CashShiftRepairError("No se encontró el recibo de Cuenta Corriente.", 404);
    const cashRows = await loadCashRows(client, input.receiptId, false);
    const movementIds = cashRows.map((row) => row.id);
    if (movementIds.length !== preview.movementCount) {
      throw new CashShiftRepairError("Las filas de Caja cambiaron durante la reparación.", 409);
    }
    const update = await client.query(
      `UPDATE cash_movements
       SET shift_id = $1, area = $2
       WHERE id = ANY($3::varchar[])`,
      [preview.targetShift.id, preview.targetShift.area, movementIds],
    );
    if (update.rowCount !== movementIds.length) {
      throw new CashShiftRepairError("No se actualizaron todas las filas previstas; la operación fue revertida.", 409);
    }
    const repairedPreview = await previewOnClient(client, input.receiptId, false);
    if (repairedPreview.status !== "already_correct" || repairedPreview.targetShift?.id !== input.targetShiftId) {
      throw new CashShiftRepairError("El turno de destino dejó de ser el turno abierto correcto; la operación fue revertida.", 409, repairedPreview);
    }

    const actorName = input.actor.fullName || input.actor.username || "Usuario";
    const details = {
      receiptId: input.receiptId,
      receiptNumber: preview.receiptNumber,
      previewToken: input.previewToken,
      movementIds,
      movementCount: movementIds.length,
      grossAmount: preview.grossAmount,
      cashAmount: preview.cashAmount,
      retentionAmount: preview.retentionAmount,
      fromShifts: preview.fromShifts,
      targetShift: preview.targetShift,
    };
    await client.query(
      `INSERT INTO audit_logs
       (id, user_id, user_name, action, module, entity_type, entity_id, description, details, ip_address, timestamp)
       VALUES (gen_random_uuid()::text, $1, $2, 'update', 'cc-receipt-cash-repair',
         'account_movement', $3, $4, $5, $6, NOW())`,
      [
        input.actor.id || null,
        actorName,
        input.receiptId,
        `Reasignación segura de Caja para el recibo ${preview.receiptNumber || input.receiptId}`,
        JSON.stringify(details),
        input.actor.ipAddress || null,
      ],
    );
    await client.query("COMMIT");
    return repairedPreview;
  } catch (error) {
    await client.query("ROLLBACK");
    const code = (error as { code?: string } | null)?.code;
    if (code === "40001" || code === "40P01") {
      throw new CashShiftRepairError(
        "La operación entró en conflicto con un cambio concurrente; generá una nueva vista previa e intentá nuevamente.",
        409,
      );
    }
    throw error;
  } finally {
    client.release();
  }
}