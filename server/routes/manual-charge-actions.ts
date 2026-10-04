import type { Express } from "express";
import type { PoolClient } from "pg";
import { pool } from "../db";
import { requireAuth, requireRole } from "../auth";

const MANUAL_CHARGE_ROLES = ["admin", "manager", "reception"] as const;
const MOTIVE_LIMIT = 500;
const DESCRIPTION_LIMIT = 500;
const MONEY_LIMIT_CENTS = 9_999_999_999n;
const MANUAL_CHARGE_CATEGORIES = new Set(["otros", "minibar"]);

type ChargeRow = {
  id: string;
  reservation_id: string;
  description: string;
  amount: string;
  date: string;
  category: string;
  status: string;
  created_by: string | null;
  is_recurring: boolean;
  unit_amount: string | null;
  anulado_por: string | null;
  motivo_anulacion: string | null;
  anulado_at: Date | null;
};

type ManualActionError = Error & { statusCode: number; code?: string };

function actionError(statusCode: number, message: string, code?: string): ManualActionError {
  return Object.assign(new Error(message), { statusCode, code });
}

function cents(value: unknown): bigint | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const text = String(value).trim();
  if (!/^\d{1,8}(?:\.\d{1,2})?$/.test(text)) return null;
  const [whole, fraction = ""] = text.split(".");
  const result = BigInt(whole) * 100n + BigInt((fraction + "00").slice(0, 2));
  return result > 0n && result <= MONEY_LIMIT_CENTS ? result : null;
}

function money(centsValue: bigint): string {
  const negative = centsValue < 0n;
  const absolute = negative ? -centsValue : centsValue;
  return `${negative ? "-" : ""}${absolute / 100n}.${String(absolute % 100n).padStart(2, "0")}`;
}

function assertAllowedBody(body: unknown, operation: "edit" | "void"): asserts body is Record<string, unknown> {
  const allowed = operation === "edit"
    ? new Set(["description", "amount", "motivo", "expectedDescription", "expectedAmount"])
    : new Set(["motivo", "expectedDescription", "expectedAmount"]);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw actionError(400, "El cuerpo de la solicitud no es válido.");
  }
  const unknownFields = Object.keys(body).filter((key) => !allowed.has(key));
  if (unknownFields.length) {
    throw actionError(400, "La solicitud contiene campos no permitidos.");
  }
}

function parseReason(body: any): string {
  if (typeof body?.motivo !== "string") {
    throw actionError(400, "El motivo es requerido.");
  }
  const reason = body.motivo.trim();
  if (!reason) throw actionError(400, "El motivo es requerido.");
  if (reason.length > MOTIVE_LIMIT) {
    throw actionError(400, `El motivo no puede superar ${MOTIVE_LIMIT} caracteres.`);
  }
  return reason;
}

function parseExpected(body: any): { description: string; amount: bigint } {
  if (typeof body?.expectedDescription !== "string" || !body.expectedDescription.trim()) {
    throw actionError(400, "La descripción esperada es requerida.");
  }
  const amount = cents(body?.expectedAmount);
  if (!amount) throw actionError(400, "El importe esperado no es válido.");
  return { description: body.expectedDescription, amount };
}

function publicCharge(row: ChargeRow) {
  return {
    id: row.id,
    reservationId: row.reservation_id,
    description: row.description,
    amount: row.amount,
    date: row.date,
    category: row.category,
    status: row.status,
    createdBy: row.created_by,
    isRecurring: row.is_recurring,
    unitAmount: row.unit_amount,
    anuladoPor: row.anulado_por,
    motivoAnulacion: row.motivo_anulacion,
    anuladoAt: row.anulado_at,
  };
}

async function withReservationInvoiceLock<T>(
  reservationId: string,
  action: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("SELECT pg_advisory_lock(hashtext($1))", [`folio-invoice:${reservationId}`]);
    return await action(client);
  } finally {
    await client.query("SELECT pg_advisory_unlock(hashtext($1))", [`folio-invoice:${reservationId}`]).catch(() => undefined);
    client.release();
  }
}

async function getReservation(client: PoolClient, reservationId: string) {
  const result = await client.query(
    `SELECT r.id, r.status, f.status AS folio_status, f.closed_at AS folio_closed_at
       FROM reservations r
       LEFT JOIN folios f ON f.entity_type = 'reservation' AND f.entity_id = r.id
      WHERE r.id = $1
      FOR UPDATE OF r`,
    [reservationId],
  );
  return result.rows[0] as { id: string; status: string; folio_status: string | null; folio_closed_at: Date | null } | undefined;
}

function reservationIsClosed(reservation: { status: string; folio_status?: string | null; folio_closed_at?: Date | null }) {
  return ["checked_out", "cancelled", "no_show"].includes(reservation.status) ||
    reservation.folio_status === "closed" ||
    reservation.folio_status === "invoiced" ||
    reservation.folio_closed_at != null;
}

async function getCharge(client: PoolClient, reservationId: string, chargeId: string) {
  const result = await client.query(
    `SELECT id, reservation_id, description, amount::text, date::text, category, status,
            created_by, is_recurring, unit_amount::text, anulado_por, motivo_anulacion, anulado_at
       FROM charges
      WHERE id = $1 AND reservation_id = $2
      FOR UPDATE`,
    [chargeId, reservationId],
  );
  return result.rows[0] as ChargeRow | undefined;
}

async function invoiceSourceConflict(client: PoolClient, reservationId: string, chargeId: string): Promise<string | null> {
  const result = await client.query(
    `WITH RECURSIVE invoice_history(id) AS (
       SELECT si.id
         FROM sales_invoices si
        WHERE si.reserva_id = $1
           OR si.folio_id IN (
                SELECT f.id FROM folios f
                 WHERE f.entity_type = 'reservation' AND f.entity_id = $1
              )
       UNION
       SELECT child.id
         FROM sales_invoices child
         JOIN invoice_history parent ON child.nota_credito_id = parent.id
     )
     SELECT si.id, si.tipo_comprobante, si.estado, si.source_charge_ids,
            si.source_charge_amounts, si.items, si.observaciones, si.nota_credito_id
       FROM sales_invoices si
       JOIN invoice_history history ON history.id = si.id`,
    [reservationId],
  );

  const invoicesById = new Map(result.rows.map((row: any) => [String(row.id), row]));
  const mappingCache = new Map<string, { mapped: boolean; sourceIds: Set<string> }>();
  const resolveSourceMap = (invoice: any, seen = new Set<string>()): { mapped: boolean; sourceIds: Set<string> } => {
    const invoiceId = String(invoice.id);
    const cached = mappingCache.get(invoiceId);
    if (cached) return cached;
    if (seen.has(invoiceId)) return { mapped: false, sourceIds: new Set() };
    seen.add(invoiceId);

    const ids = new Set<string>();
    let hasMapping = false;
    const parsedIds = invoice.source_charge_ids;
    if (Array.isArray(parsedIds)) {
      const strings = parsedIds.filter((id: unknown): id is string => typeof id === "string");
      strings.forEach((id: string) => ids.add(id));
      hasMapping ||= strings.length > 0;
    } else if (parsedIds && typeof parsedIds === "object") {
      const keys = Object.keys(parsedIds);
      keys.forEach((id) => ids.add(id));
      hasMapping ||= keys.length > 0;
    }
    const parsedAmounts = invoice.source_charge_amounts;
    if (parsedAmounts && typeof parsedAmounts === "object" && !Array.isArray(parsedAmounts)) {
      const keys = Object.keys(parsedAmounts);
      keys.forEach((id) => ids.add(id));
      hasMapping ||= keys.length > 0;
    }
    const itemIds = Array.isArray(invoice.items)
      ? invoice.items.flatMap((item: any) => [
          item?.sourceChargeId,
          item?.source_charge_id,
          item?.chargeId,
          item?.charge_id,
        ].filter((id: unknown): id is string => typeof id === "string"))
      : [];
    itemIds.forEach((id: string) => ids.add(id));
    hasMapping ||= itemIds.length > 0;

    if (!hasMapping && invoice.nota_credito_id != null) {
      const parent = invoicesById.get(String(invoice.nota_credito_id));
      if (parent) {
        const inherited = resolveSourceMap(parent, seen);
        if (inherited.mapped) {
          inherited.sourceIds.forEach((id) => ids.add(id));
          hasMapping = true;
        }
      }
    }
    const resolved = { mapped: hasMapping, sourceIds: ids };
    mappingCache.set(invoiceId, resolved);
    return resolved;
  };

  for (const invoice of result.rows) {
    const mapping = resolveSourceMap(invoice);
    if (!mapping.mapped) {
      return `La factura ${invoice.id} no conserva el detalle de cargos de origen; no se puede modificar con seguridad.`;
    }
    const referencias = typeof invoice.observaciones === "string" && invoice.observaciones.includes(chargeId);
    if (mapping.sourceIds.has(chargeId) || referencias) {
      return `El cargo ya tiene historial fiscal asociado (comprobante ${invoice.id}, estado ${invoice.estado ?? "desconocido"}).`;
    }
  }
  return null;
}

async function inspectManualSource(
  client: PoolClient,
  reservationId: string,
  charge: ChargeRow,
): Promise<{ eligible: boolean; reason?: string; movementId?: string; movementSnapshot?: Record<string, unknown> }> {
  if (!MANUAL_CHARGE_CATEGORIES.has(charge.category) || charge.is_recurring || charge.unit_amount != null) {
    return { eligible: false, reason: "El origen del cargo no corresponde a un extra manual editable." };
  }
  if (!charge.description.trim() || !cents(charge.amount)) {
    return { eligible: false, reason: "El extra debe tener descripción e importe positivo válido." };
  }

  const movementResult = await client.query(
    `SELECT fm.id, fm.folio_id, fm.type, fm.amount::text, fm.description,
            fm.source_type, fm.source_id, f.entity_type, f.entity_id
       FROM folio_movements fm
       JOIN folios f ON f.id = fm.folio_id
      WHERE fm.source_type = 'charge' AND fm.source_id = $1 AND fm.type = 'charge'
      FOR UPDATE OF fm`,
    [charge.id],
  );
  if (movementResult.rows.length !== 1) {
    return { eligible: false, reason: "No se pudo comprobar un origen manual único en el folio." };
  }
  const movement = movementResult.rows[0];
  if (
    movement.entity_type !== "reservation" ||
    movement.entity_id !== reservationId ||
    movement.amount !== charge.amount ||
    movement.description !== charge.description
  ) {
    return { eligible: false, reason: "El cargo y su movimiento de folio no coinciden; requiere revisión." };
  }

  const transferHistory = await client.query(
    `SELECT 1 FROM charges
      WHERE id <> $1 AND description LIKE $2
      LIMIT 1`,
    [charge.id, `%[xfer:${charge.id}]%`],
  );
  if (transferHistory.rows.length) {
    return { eligible: false, reason: "El cargo tiene historial de transferencia." };
  }

  const linkedMovementHistory = await client.query(
    `SELECT 1 FROM folio_movements
      WHERE (source_id = $1 AND NOT (source_type = 'charge' AND id = $2))
         OR voided_movement_id = $3
      LIMIT 1`,
    [charge.id, movement.id, movement.id],
  );
  if (linkedMovementHistory.rows.length) {
    return { eligible: false, reason: "El cargo tiene otros movimientos financieros vinculados." };
  }

  const fiscalConflict = await invoiceSourceConflict(client, reservationId, charge.id);
  if (fiscalConflict) return { eligible: false, reason: fiscalConflict };

  if (charge.status !== "active") {
    return { eligible: false, reason: "Solo se pueden modificar extras activos." };
  }
  return {
    eligible: true,
    movementId: movement.id,
    movementSnapshot: {
      id: movement.id,
      folioId: movement.folio_id,
      type: movement.type,
      amount: movement.amount,
      description: movement.description,
      sourceType: movement.source_type,
      sourceId: movement.source_id,
    },
  };
}

async function recalculateFolio(client: PoolClient, folioId: string) {
  await client.query(
    `UPDATE folios f SET
       total_charges = COALESCE((
         SELECT SUM(amount::numeric) FROM folio_movements
          WHERE folio_id = f.id AND type IN ('charge', 'transfer_in')
       ), 0),
       total_payments = COALESCE((
         SELECT SUM(amount::numeric) FROM folio_movements
          WHERE folio_id = f.id AND type IN ('payment', 'advance', 'discount', 'transfer_out', 'void')
       ), 0)
     WHERE f.id = $1`,
    [folioId],
  );
  await client.query("UPDATE folios SET balance = total_charges::numeric - total_payments::numeric WHERE id = $1", [folioId]);
}

async function writeAudit(
  client: PoolClient,
  input: {
    actorId: string;
    actorName: string;
    ipAddress: string;
    action: "update" | "delete";
    reservationId: string;
    chargeId: string;
    description: string;
    before: unknown;
    after: unknown;
    motivo: string;
  },
) {
  await client.query(
    `INSERT INTO audit_logs
       (user_id, user_name, action, module, entity_type, entity_id, description, details, ip_address, timestamp)
     VALUES ($1, $2, $3, 'charges', 'reservation_manual_extra', $4, $5, $6, $7, NOW())`,
    [
      input.actorId,
      input.actorName,
      input.action,
      input.chargeId,
      input.description,
      JSON.stringify({
        reservationId: input.reservationId,
        chargeId: input.chargeId,
        motivo: input.motivo,
        before: input.before,
        after: input.after,
      }),
      input.ipAddress,
    ],
  );
}

async function loadActions(client: PoolClient, reservationId: string) {
  const reservation = await getReservation(client, reservationId);
  if (!reservation) throw actionError(404, "Reserva no encontrada.");
  const result = await client.query(
    `SELECT id, reservation_id, description, amount::text, date::text, category, status,
            created_by, is_recurring, unit_amount::text, anulado_por, motivo_anulacion, anulado_at
       FROM charges
      WHERE reservation_id = $1
      ORDER BY date DESC, id
      FOR UPDATE`,
    [reservationId],
  );
  const charges = [];
  for (const row of result.rows as ChargeRow[]) {
    const proof = await inspectManualSource(client, reservationId, row);
    let reason = proof.reason;
    if (reservationIsClosed(reservation)) reason = "La reserva o su folio está cerrado o cancelado.";
    charges.push({
      id: row.id,
      eligible: proof.eligible && !reservationIsClosed(reservation),
      ...(reason ? { reason } : {}),
      description: row.description,
      amount: row.amount,
      status: row.status,
    });
  }
  return { charges };
}

async function mutateManualCharge(
  reservationId: string,
  chargeId: string,
  operation: "edit" | "void",
  body: any,
  actor: { id: string; name: string; ipAddress: string },
) {
  assertAllowedBody(body, operation);
  const motivo = parseReason(body);
  const expected = parseExpected(body);
  let nextDescription: string | undefined;
  let nextAmount: bigint | undefined;

  if (operation === "edit") {
    if (typeof body?.description !== "string" || !body.description.trim()) {
      throw actionError(400, "La descripción es requerida.");
    }
    const description = body.description.trim();
    if (description.length > DESCRIPTION_LIMIT) {
      throw actionError(400, `La descripción no puede superar ${DESCRIPTION_LIMIT} caracteres.`);
    }
    nextDescription = description;
    nextAmount = cents(body?.amount) ?? undefined;
    if (!nextAmount) {
      throw actionError(400, "El importe debe ser mayor a cero y tener como máximo dos decimales.");
    }
  }

  return withReservationInvoiceLock(reservationId, async (client) => {
    await client.query("BEGIN");
    try {
      const reservation = await getReservation(client, reservationId);
      if (!reservation) throw actionError(404, "Reserva no encontrada.");
      if (reservationIsClosed(reservation)) {
        throw actionError(403, "No se pueden modificar extras de una reserva cerrada o cancelada.");
      }

      const charge = await getCharge(client, reservationId, chargeId);
      if (!charge) throw actionError(404, "Cargo no encontrado en esta reserva.");
      if (charge.description !== expected.description || cents(charge.amount) !== expected.amount) {
        throw actionError(409, "El extra cambió desde que se abrió. Actualizá la pantalla e intentá nuevamente.", "stale_snapshot");
      }

      const proof = await inspectManualSource(client, reservationId, charge);
      if (!proof.movementId) {
        throw actionError(409, proof.reason ?? "No se pudo comprobar el origen manual del cargo.", "source_conflict");
      }
      if (!proof.eligible) {
        throw actionError(409, proof.reason ?? "El cargo no está disponible para esta acción.", "source_conflict");
      }

      const before = {
        charge: publicCharge(charge),
        folioMovement: proof.movementSnapshot,
      };
      let result: ChargeRow;
      let afterMovement: unknown;
      if (operation === "edit") {
        const updateCharge = await client.query(
          `UPDATE charges
              SET description = $1, amount = $2
            WHERE id = $3 AND reservation_id = $4
              AND description = $5 AND amount::numeric = $6::numeric
              AND status = 'active'
          RETURNING id, reservation_id, description, amount::text, date::text, category, status,
                    created_by, is_recurring, unit_amount::text, anulado_por, motivo_anulacion, anulado_at`,
          [nextDescription, money(nextAmount!), chargeId, reservationId, expected.description, money(expected.amount)],
        );
        if (!updateCharge.rows[0]) {
          throw actionError(409, "El extra cambió desde que se abrió. Actualizá la pantalla e intentá nuevamente.", "stale_snapshot");
        }
        const movementUpdate = await client.query(
          `UPDATE folio_movements
              SET description = $1, amount = $2
            WHERE id = $3 AND type = 'charge' AND source_type = 'charge' AND source_id = $4
          RETURNING folio_id`,
          [nextDescription, money(nextAmount!), proof.movementId, chargeId],
        );
        if (movementUpdate.rows.length !== 1) {
          throw actionError(409, "El movimiento del folio cambió; no se aplicó la edición.", "source_conflict");
        }
        await recalculateFolio(client, movementUpdate.rows[0].folio_id);
        const updatedMovement = await client.query("SELECT * FROM folio_movements WHERE id = $1", [proof.movementId]);
        afterMovement = updatedMovement.rows[0];
        result = updateCharge.rows[0] as ChargeRow;
      } else {
        const updateCharge = await client.query(
          `UPDATE charges
              SET status = 'anulado', anulado_por = $1, motivo_anulacion = $2, anulado_at = NOW()
            WHERE id = $3 AND reservation_id = $4
              AND description = $5 AND amount::numeric = $6::numeric
              AND status = 'active'
          RETURNING id, reservation_id, description, amount::text, date::text, category, status,
                    created_by, is_recurring, unit_amount::text, anulado_por, motivo_anulacion, anulado_at`,
          [actor.name, motivo, chargeId, reservationId, expected.description, money(expected.amount)],
        );
        if (!updateCharge.rows[0]) {
          throw actionError(409, "El extra cambió desde que se abrió. Actualizá la pantalla e intentá nuevamente.", "stale_snapshot");
        }
        const folio = await client.query(
          `SELECT folio_id FROM folio_movements
            WHERE id = $1 AND type = 'charge' AND source_type = 'charge' AND source_id = $2`,
          [proof.movementId, chargeId],
        );
        if (folio.rows.length !== 1) {
          throw actionError(409, "El movimiento del folio cambió; no se anuló el extra.", "source_conflict");
        }
        const reversal = await client.query(
          `INSERT INTO folio_movements
             (folio_id, type, amount, description, source_type, source_id, voided_movement_id, void_reason, registered_by)
           VALUES ($1, 'charge', $2, $3, 'manual_charge_void', $4, $5, $6, $7)
           RETURNING *`,
          [
            folio.rows[0].folio_id,
            money(-expected.amount),
            `Anulación de extra: ${charge.description}`,
            chargeId,
            proof.movementId,
            motivo,
            actor.name,
          ],
        );
        afterMovement = {
          original: proof.movementSnapshot,
          reversal: reversal.rows[0] ?? {
            folioId: folio.rows[0].folio_id,
            type: "charge",
            amount: money(-expected.amount),
            description: `Anulación de extra: ${charge.description}`,
            sourceType: "manual_charge_void",
            sourceId: chargeId,
            voidedMovementId: proof.movementId,
            voidReason: motivo,
            registeredBy: actor.name,
          },
        };
        await recalculateFolio(client, folio.rows[0].folio_id);
        result = updateCharge.rows[0] as ChargeRow;
      }
      await writeAudit(client, {
        actorId: actor.id,
        actorName: actor.name,
        ipAddress: actor.ipAddress,
        action: operation === "edit" ? "update" : "delete",
        reservationId,
        chargeId,
        description: operation === "edit" ? "Edición manual de extra de prefactura" : "Anulación manual de extra de prefactura",
        before,
        after: { charge: publicCharge(result), folioMovement: afterMovement },
        motivo,
      });
      await client.query("COMMIT");
      return publicCharge(result);
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    }
  });
}

export async function anularManualChargeLegacy(
  reservationId: string,
  charge: { id: string; description: string; amount: string },
  motivoAnulacion: unknown,
  actor: { id: string; name: string; ipAddress: string },
) {
  return mutateManualCharge(
    reservationId,
    charge.id,
    "void",
    {
      motivo: motivoAnulacion,
      expectedDescription: charge.description,
      expectedAmount: charge.amount,
    },
    actor,
  );
}

function requestActor(req: any) {
  const user = req.user;
  return {
    id: String(user?.id ?? ""),
    name: String(user?.username ?? user?.fullName ?? ""),
    ipAddress: String(req.ip ?? req.socket?.remoteAddress ?? ""),
  };
}

function sendActionError(res: any, error: any) {
  const statusCode = Number(error?.statusCode);
  if (statusCode >= 400 && statusCode < 600) {
    return res.status(statusCode).json({
      error: error.message || "No se pudo completar la acción sobre el extra.",
      ...(error.code ? { code: error.code } : {}),
    });
  }
  console.error("[manual-charge-actions] Error:", error);
  return res.status(500).json({ error: "No se pudo completar la acción sobre el extra." });
}

export function registerManualChargeActionRoutes(app: Express) {
  app.get(
    "/api/reservations/:reservationId/manual-charge-actions",
    requireAuth,
    requireRole([...MANUAL_CHARGE_ROLES]),
    async (req, res) => {
      try {
        const result = await withReservationInvoiceLock(req.params.reservationId, async (client) => {
          await client.query("BEGIN");
          try {
            const actions = await loadActions(client, req.params.reservationId);
            await client.query("COMMIT");
            return actions;
          } catch (error) {
            await client.query("ROLLBACK").catch(() => undefined);
            throw error;
          }
        });
        res.json(result);
      } catch (error) {
        sendActionError(res, error);
      }
    },
  );

  app.patch(
    "/api/reservations/:reservationId/manual-charges/:chargeId",
    requireAuth,
    requireRole([...MANUAL_CHARGE_ROLES]),
    async (req, res) => {
      try {
        const result = await mutateManualCharge(
          req.params.reservationId,
          req.params.chargeId,
          "edit",
          req.body,
          requestActor(req),
        );
        res.json(result);
      } catch (error) {
        sendActionError(res, error);
      }
    },
  );

  app.post(
    "/api/reservations/:reservationId/manual-charges/:chargeId/anular",
    requireAuth,
    requireRole([...MANUAL_CHARGE_ROLES]),
    async (req, res) => {
      try {
        const result = await mutateManualCharge(
          req.params.reservationId,
          req.params.chargeId,
          "void",
          req.body,
          requestActor(req),
        );
        res.json(result);
      } catch (error) {
        sendActionError(res, error);
      }
    },
  );
}

export async function manualChargeHasSourceLedger(chargeId: string): Promise<boolean> {
  const result = await pool.query(
    "SELECT 1 FROM folio_movements WHERE source_type = 'charge' AND source_id = $1 LIMIT 1",
    [chargeId],
  );
  return Number(result.rowCount) > 0;
}