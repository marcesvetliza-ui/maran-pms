import type { Express } from "express";
import { randomUUID } from "crypto";
import { storage, getArgentinaToday } from "../db-storage";
import { db } from "../db";
import { reservationChangelog, housekeepingTasks, groupReservationLinks, rooms as roomsTable, reservations as reservationsTable, guests as guestsTable, groupRoomBlocks, groupCharges as groupChargesTable, groupPayments as groupPaymentsTable, payments as paymentsTable, groupInvoices as groupInvoicesTable, salesInvoices as salesInvoicesTable, accountMovements as accountMovementsTable, accountMovementAllocations, cashMovements as cashMovementsTable } from "@shared/schema";
import { eq, and, sql, desc, inArray } from "drizzle-orm";
import { requireAuth } from "../auth";
import { audit } from "../audit";
import PDFDocument from "pdfkit";
import { generateGroupPaymentReceiptPdf } from "../groupPaymentReceiptPdf";
import { assertGroupPaymentInvoiceScope, assertMasterFacturaTAllowed, getGroupInvoiceCompositionSources, getGroupInvoiceSnapshot, getPersistedGroupInvoiceCompositionSources } from "../billing/groupInvoiceScope";
import { assertFinancialSchemaReady } from "../migrate";
import { computeGroupOperationalLedger } from "../billing/groupOperationalLedger";
import { buildGroupInvoiceComposition, buildUnavailableGroupInvoiceComposition } from "@shared/groupInvoiceComposition";
import { exposeInvoiceReconciliation } from "../billing/reconciliationPresentation";
import { buildGroupRoomFinancialSnapshot, groupInvoiceCollectionMatches, requiredGroupInvoiceCollection } from "@shared/groupFinancial";
import { hasCanonicalRoomType, isRoomAvailableForInterval } from "@shared/room-availability";

// A retención (IIBB/Ganancias) withheld by the payer is persisted on the
// room-level payment's notes as { retencion: { tipo, monto, neto } } — the
// same shape the single-reservation billing flow writes. Every group view
// that lists individual payments must parse and surface it, or the withheld
// amount stays invisible outside the database.
function parsePaymentRetention(notes: unknown): { tipo: string; monto: number } | null {
  if (!notes) return null;
  try {
    const parsed = typeof notes === "string" ? JSON.parse(notes) : notes;
    const ret = (parsed as any)?.retencion;
    if (!ret || !Number(ret.monto)) return null;
    return { tipo: String(ret.tipo || ""), monto: Number(ret.monto) || 0 };
  } catch {
    return null;
  }
}

// Retención withheld on the portion of a group_payments row allocated to a
// "__"-prefixed target (Folio Maestro balance, group charges) — no real room
// exists to carry it on payments.notes, so it lives on the parent row's
// retention_detail column instead. See parsePaymentRetention above for the
// room-level counterpart.
function parseGroupPaymentRetentions(retentionDetail: unknown): Array<{ tipo: string; monto: number }> {
  if (!Array.isArray(retentionDetail)) return [];
  return retentionDetail
    .map((r: any) => ({ tipo: String(r?.tipo || ""), monto: Number(r?.monto) || 0 }))
    .filter((r) => r.monto > 0);
}

function groupPaymentMethodLabel(method: unknown): string {
  const value = String(method || "");
  return ({
    cash: "Efectivo",
    transfer: "Transferencia",
    transferencia: "Transferencia",
    credit_card: "Tarjeta de crédito",
    debit_card: "Tarjeta de débito",
    check: "Cheque",
    mercadopago: "Mercado Pago",
    cuenta_corriente: "Cuenta corriente",
    other: "Otro",
  } as Record<string, string>)[value] || value.replace(/_/g, " ");
}

function isFiscalGroupReceipt(receiptType: string): boolean {
  return receiptType !== "sin_comprobante" && receiptType !== "none";
}

function parseSourceAmountMap(value: unknown): Record<string, number> {
  let parsed = value;
  if (typeof parsed === "string") {
    try {
      parsed = JSON.parse(parsed);
    } catch {
      return {};
    }
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
  return Object.fromEntries(
    Object.entries(parsed)
      .filter(([sourceId, amount]) => sourceId && Number.isFinite(Number(amount)) && Number(amount) > 0)
      .map(([sourceId, amount]) => [sourceId, Number(amount)]),
  );
}

function distributeCents(
  totalCents: number,
  entries: Array<{ id: string; weight: number }>
): Record<string, number> {
  const usable = entries
    .map((entry) => ({ ...entry, weightCents: Math.max(0, Math.round(entry.weight * 100)) }))
    .filter((entry) => entry.weightCents > 0)
    .sort((a, b) => a.id.localeCompare(b.id));
  if (totalCents <= 0 || usable.length === 0) return {};
  const totalWeight = usable.reduce((sum, entry) => sum + entry.weightCents, 0);
  const shares = usable.map((entry) => {
    const numerator = totalCents * entry.weightCents;
    return {
      id: entry.id,
      cents: Math.floor(numerator / totalWeight),
      remainder: numerator % totalWeight,
    };
  });
  let remaining = totalCents - shares.reduce((sum, share) => sum + share.cents, 0);
  // Largest remainder makes cents deterministic and preserves the exact
  // economic value independently of display/order changes in the UI.
  for (const share of [...shares].sort((a, b) => b.remainder - a.remainder || a.id.localeCompare(b.id))) {
    if (remaining <= 0) break;
    share.cents++;
    remaining--;
  }
  return Object.fromEntries(shares.map((share) => [share.id, share.cents / 100]));
}

function parentAllocationsByReservation(groupPayments: any[]): Map<string, number> {
  const centsByReservation = new Map<string, number>();
  for (const payment of groupPayments) {
    const detail = payment.distributionDetail;
    if (!detail || typeof detail !== "object" || Array.isArray(detail)) continue;
    for (const [reservationId, amount] of Object.entries(detail)) {
      if (reservationId.startsWith("__")) continue;
      centsByReservation.set(
        reservationId,
        (centsByReservation.get(reservationId) || 0) + Math.round((Number(amount) || 0) * 100),
      );
    }
  }
  return new Map([...centsByReservation].map(([id, amount]) => [id, amount / 100]));
}

// A retención (IIBB/Ganancias) withheld by the payer settles part of the debt
// without moving cash, so it must count toward the total the payer is
// crediting — the same convention the single-reservation Prefactura flow
// already uses (payments.amount = cash + retención, notes keeps the split).
// Reject malformed payloads here instead of trusting the client.
function validateAndNormalizePaymentRows<T extends { method: string; retention?: any }>(rows: T[]): T[] {
  return rows.map((row) => {
    const amount = Number((row as any).amount);
    if (!Number.isFinite(amount) || amount < 0) {
      throw Object.assign(new Error("Cada importe de cobro debe ser un número mayor o igual a cero."), { statusCode: 400 });
    }
    if (row.retention == null) return { ...row, retention: undefined };
    if (row.method === "cuenta_corriente") {
      throw Object.assign(new Error("Las retenciones no aplican a pagos por Cuenta Corriente."), { statusCode: 400 });
    }
    const tipo = row.retention.tipo;
    const monto = Number(row.retention.monto);
    if (tipo !== "iibb" && tipo !== "ganancias") {
      throw Object.assign(new Error("Tipo de retención inválido."), { statusCode: 400 });
    }
    if (!Number.isFinite(monto) || monto <= 0) {
      throw Object.assign(new Error("El monto de la retención debe ser un número positivo."), { statusCode: 400 });
    }
    return { ...row, retention: { tipo, monto } };
  });
}

function paymentRowsGrossTotal(rows: Array<{ amount: string; retention?: { monto: number } | null }>): number {
  return rows.reduce((s, r) => s + (parseFloat(r.amount) || 0) + (r.retention?.monto || 0), 0);
}

function buildSettlementBreakdown(input: {
  documentTotal: number;
  newCollection: number;
  availableAdvances?: number;
  supplied?: unknown;
}) {
  const cents = (value: unknown) => Math.round((Number(value) || 0) * 100);
  const documentCents = cents(input.documentTotal);
  const collectionCents = cents(input.newCollection);
  const expectedAdvanceCents = Math.min(documentCents, Math.max(0, cents(input.availableAdvances)));
  const raw = input.supplied && typeof input.supplied === "object"
    ? input.supplied as Record<string, unknown>
    : null;
  const breakdown = {
    documentTotal: raw ? cents(raw.documentTotal) / 100 : documentCents / 100,
    appliedAdvances: raw ? cents(raw.appliedAdvances) / 100 : expectedAdvanceCents / 100,
    newCollection: raw ? cents(raw.newCollection) / 100 : collectionCents / 100,
  };
  if (cents(breakdown.documentTotal) !== documentCents
    || cents(breakdown.newCollection) !== collectionCents
    || cents(breakdown.appliedAdvances) < 0
    || cents(breakdown.appliedAdvances) > documentCents
    || collectionCents < documentCents - cents(breakdown.appliedAdvances)
    || cents(breakdown.appliedAdvances) !== expectedAdvanceCents) {
    throw Object.assign(
      new Error("El desglose del comprobante, anticipos y cobro nuevo no coincide con el ledger del grupo."),
      { statusCode: 400 },
    );
  }
  return breakdown;
}

function confirmedInvoiceAppliedAdvances(invoiceData: any, fallback: number): number {
  const persisted = invoiceData?.groupPaymentIntent?.body?.settlementBreakdown?.appliedAdvances
    ?? invoiceData?.group_payment_intent?.body?.settlementBreakdown?.appliedAdvances;
  return persisted !== undefined && persisted !== null && Number.isFinite(Number(persisted))
    ? Number(persisted)
    : fallback;
}

const supportedGroupReceiptTypes = new Set([
  "sin_comprobante", "none", "factura_a", "factura_b", "factura_mipyme_a", "factura_t",
]);

/** Validate collection evidence before either group collection path persists it. */
function validateGroupPaymentEvidence(
  receiptType: unknown,
  rows: Array<{ method: string; amount: string; reference?: string }>,
  receiverDetails: unknown,
  concepts: unknown,
) {
  const normalizedReceiptType = String(receiptType ?? "sin_comprobante").trim().toLowerCase();
  if (!supportedGroupReceiptTypes.has(normalizedReceiptType)) {
    throw Object.assign(new Error("Tipo de comprobante no admitido para cobros grupales."), { statusCode: 400 });
  }
  if (!rows.some((row) => Number(row.amount) > 0)) {
    throw Object.assign(new Error("Debe informar al menos un detalle de cobro con importe positivo."), { statusCode: 400 });
  }
  const isFiscal = ["factura_a", "factura_b", "factura_mipyme_a", "factura_t"].includes(normalizedReceiptType);
  for (const row of rows) {
    if (!isFiscal && Number(row.amount) > 0 && !String(row.reference || "").trim()) {
      throw Object.assign(new Error("Cada medio de pago debe incluir una referencia no vacía."), { statusCode: 400 });
    }
  }
  const normalizedConcepts = (Array.isArray(concepts) ? concepts : [])
    .map((concept: any) => ({
      description: String(concept?.description || concept?.descripcion || "").trim().replace(/\s+/g, " "),
      amount: Number(concept?.amount ?? concept?.subtotal ?? 0),
    }))
    .filter((concept) => concept.description && Number.isFinite(concept.amount) && concept.amount > 0);
  if (normalizedConcepts.length === 0) {
    throw Object.assign(new Error("Debe informar al menos un concepto con detalle e importe positivo."), { statusCode: 400 });
  }
  const paymentCents = Math.round(paymentRowsGrossTotal(rows as Array<{ amount: string; retention?: { monto: number } | null }>) * 100);
  const conceptCents = normalizedConcepts.reduce((sum, concept) => sum + Math.round(concept.amount * 100), 0);
  if (!isFiscal && conceptCents !== paymentCents) {
    throw Object.assign(
      new Error("Los conceptos del recibo deben coincidir exactamente con el total cobrado."),
      { statusCode: 400 },
    );
  }
  const raw = receiverDetails && typeof receiverDetails === "object" ? receiverDetails as Record<string, unknown> : {};
  const receiver = {
    razonSocial: String(raw.razonSocial || "").trim().replace(/\s+/g, " "),
    cuit: String(raw.cuit || "").replace(/\D/g, ""),
    // DNI also carries foreign passport numbers in the group flow.
    dni: String(raw.dni || "").toUpperCase().replace(/[^A-Z0-9]/g, ""),
    condicionIva: String(raw.condicionIva || "").trim() || undefined,
    domicilio: String(raw.domicilio || "").trim() || undefined,
  };
  if (!receiver.razonSocial || (!receiver.cuit && !receiver.dni)) {
    throw Object.assign(new Error("Seleccione un receptor con nombre y CUIT o DNI."), { statusCode: 400 });
  }
  return { receiptType: normalizedReceiptType, receiver, concepts: normalizedConcepts };
}

function normalizeConceptsForGroupPaymentDestination(input: {
  destination: "group_distribution" | "master_folio";
  concepts: Array<{ description: string; amount: number }>;
  distributionDetail: Record<string, number>;
  ledgerLines: Array<{ reservationId: string; roomNumber?: string | null; reservationCode?: string | null }>;
  groupName: string;
}): Array<{ description: string; amount: number }> {
  const totalCents = input.concepts.reduce((sum, concept) => sum + Math.round(concept.amount * 100), 0);
  if (input.destination === "master_folio") {
    return [{
      description: `Folio Maestro — ${input.groupName}`,
      amount: totalCents / 100,
    }];
  }

  const roomByReservation = new Map(input.ledgerLines.map((line) => [line.reservationId, line]));
  const roomAllocations = Object.entries(input.distributionDetail)
    .filter(([reservationId, amount]) => !reservationId.startsWith("__") && Number(amount) > 0);
  if (roomAllocations.length === 0) {
    throw Object.assign(
      new Error("Un Pago Grupal distribuido debe incluir al menos una habitación."),
      { statusCode: 400 },
    );
  }

  const conceptAmounts = distributeCents(
    totalCents,
    roomAllocations.map(([reservationId, amount]) => ({ id: reservationId, weight: Number(amount) })),
  );
  return roomAllocations.map(([reservationId]) => {
    const room = roomByReservation.get(reservationId);
    const roomLabel = room?.roomNumber || room?.reservationCode || reservationId;
    return {
      description: `Habitación ${roomLabel}`,
      amount: conceptAmounts[reservationId],
    };
  });
}

function formatGroupPaymentNotes(
  existingNotes: unknown,
  concepts: Array<{ description: string; amount: number }>,
) {
  const conceptText = concepts
    .map((concept) => `${concept.description}: $${concept.amount.toFixed(2)}`)
    .join("; ");
  const note = String(existingNotes || "").trim();
  return note ? `${note}\nConceptos: ${conceptText}` : `Conceptos: ${conceptText}`;
}

/**
 * Once a group has financial evidence its room structure is part of that
 * evidence: removing a block (or unlinking a room, which can remove its last
 * block) would make historic allocations and fiscal sources ambiguous.
 */
async function assertGroupStructureCanChange(groupId: string): Promise<void> {
  const result = await db.execute(sql`
    SELECT (
      EXISTS (SELECT 1 FROM group_payments WHERE group_id = ${groupId})
      OR EXISTS (SELECT 1 FROM sales_invoices WHERE group_id = ${groupId})
    ) AS has_financial_activity
  `);
  if ((result.rows[0] as any)?.has_financial_activity) {
    throw Object.assign(
      new Error("No se puede modificar el bloqueo ni desasignar habitaciones: el grupo ya tiene cobros o comprobantes fiscales registrados."),
      { statusCode: 409 },
    );
  }
}

// Helper: get or create the single placeholder guest for a group
async function getOrCreatePlaceholderGuest(groupId: string, groupName: string) {
  const code = `GROUP-${groupId}`;
  const [existing] = await db.select().from(guestsTable).where(eq(guestsTable.codigo, code)).limit(1);
  if (existing) return existing;
  const [created] = await db.insert(guestsTable).values({
    firstName: groupName,
    lastName: "",
    codigo: code,
    segment: "LEISURE",
    sexo: "no_especifica",
  } as any).returning();
  return created;
}

export function registerGroupsRoutes(app: Express) {
  // Groups
  app.get("/api/groups", async (req, res) => {
    try {
      const groups = await storage.getGroups();
      res.json(groups);
    } catch (error) {
      res.status(500).json({ error: "Error fetching groups" });
    }
  });

  app.get("/api/groups/:id", async (req, res) => {
    try {
      const group = await storage.getGroup(req.params.id);
      if (!group) {
        return res.status(404).json({ error: "Group not found" });
      }
      res.json(group);
    } catch (error) {
      res.status(500).json({ error: "Error fetching group" });
    }
  });

  app.post("/api/groups", async (req, res) => {
    try {
      const { name, contactName, contactPhone, contactEmail, eventDate, eventSalon, eventTime, checkInDate, checkOutDate, status, releaseDate, notes, color, billingEntityType, billingEntityId } = req.body;

      if (!name || !checkInDate || !checkOutDate) {
        return res.status(400).json({ error: "Name, checkInDate, and checkOutDate are required" });
      }
      const today = getArgentinaToday();
      if (checkInDate < today) {
        return res.status(400).json({ error: "La fecha de check-in no puede ser anterior a hoy." });
      }
      if (checkOutDate <= checkInDate) {
        return res.status(400).json({ error: "La fecha de check-out debe ser posterior al check-in." });
      }

      const groupCode = storage.generateGroupCode();
      const group = await storage.createGroup({
        groupCode,
        name,
        contactName: contactName || null,
        contactPhone: contactPhone || null,
        contactEmail: contactEmail || null,
        eventDate: eventDate || null,
        eventSalon: eventSalon || null,
        eventTime: eventTime || null,
        checkInDate,
        checkOutDate,
        status: status || "tentative",
        releaseDate: releaseDate || null,
        notes: notes || null,
        color: color || "#6366f1",
        billingEntityType: billingEntityType || null,
        billingEntityId: billingEntityId || null,
        createdAt: new Date(),
        createdBy: null,
      });
      res.status(201).json(group);
    } catch (error) {
      res.status(500).json({ error: "Error creating group" });
    }
  });

  // 6a: Check which reservations conflict in new date range and offer alternatives
  app.get("/api/groups/:id/date-conflicts", async (req, res) => {
    try {
      const { checkIn, checkOut } = req.query as { checkIn?: string; checkOut?: string };
      if (!checkIn || !checkOut || checkOut <= checkIn) {
        return res.status(400).json({ error: "checkIn y checkOut son requeridos y checkOut debe ser posterior" });
      }

      const groupId = req.params.id;
      const group = await storage.getGroup(groupId);
      if (!group) return res.status(404).json({ error: "Grupo no encontrado" });

      const links = await db.select().from(groupReservationLinks).where(eq(groupReservationLinks.groupId, groupId));
      const allReservations = await storage.getReservations();
      const allRooms = await storage.getRooms();
      const allRoomTypes = await storage.getRoomTypes();
      const maintenanceBlocks = await storage.getMaintenanceBlocks();

      // Count checked_in reservations in the group — if any, block date change entirely
      const groupResIds = new Set(links.map(l => l.reservationId));
      const checkedInReservations = allReservations.filter(r => groupResIds.has(r.id) && r.status === "checked_in");
      if (checkedInReservations.length > 0) {
        return res.json({ checkedInCount: checkedInReservations.length, conflicts: [] });
      }

      const activeStatuses = ["tentative", "pending", "reserved", "confirmed", "web_checkin", "checked_in"];
      // "physically unavailable" room statuses — exclude from alternatives regardless of reservation conflicts
      const unavailableRoomStatuses: string[] = ["maintenance", "oos"];
      // groupResIds already defined above (used for checked_in check)

      const conflicts: Array<{
        reservationId: string;
        roomId: string;
        roomNumber: string;
        roomTypeId: string;
        roomTypeName: string;
        passengerName: string | null;
        alternatives: Array<{ id: string; roomNumber: string }>;
      }> = [];

      for (const link of links) {
        const [linked] = await db.select().from(reservationsTable).where(eq(reservationsTable.id, link.reservationId)).limit(1);
        if (!linked) continue;
        if (!["pending", "confirmed"].includes(linked.status as string)) continue;
        if (!linked.roomId) continue;

        const room = allRooms.find(r => r.id === linked.roomId);
        if (!room) continue;
        const roomType = allRoomTypes.find(rt => rt.id === room.roomTypeId);

        // Does this room have a conflict in the NEW date range? (exclude self)
        const hasResConflict = allReservations.some(res => {
          if (!activeStatuses.includes(res.status)) return false;
          if (res.roomId !== room.id) return false;
          if (res.id === linked.id) return false;
          return res.checkInDate < checkOut && res.checkOutDate > checkIn;
        });
        const hasBlockConflict = maintenanceBlocks.some(blk =>
          blk.roomId === room.id && blk.blockFrom < checkOut && blk.blockTo > checkIn
        );

        if (!hasResConflict && !hasBlockConflict) continue; // no conflict, skip

        // Get passenger name from the guest record (not from reservation row — that field may differ by ORM version)
        let passengerName: string | null = null;
        if (linked.guestId) {
          const [g] = await db.select().from(guestsTable).where(eq(guestsTable.id, linked.guestId)).limit(1);
          // Skip the group placeholder guest (codigo = GROUP-xxx) — not a real passenger name
          if (g && (!g.codigo || !g.codigo.startsWith("GROUP-"))) {
            passengerName = `${g.lastName || ""} ${g.firstName || ""}`.trim() || null;
          }
        }

        // Find alternative rooms of same type available for new dates
        const alternatives = allRooms
          .filter(r => {
            if (r.id === room.id) return false;
            if (r.roomTypeId !== room.roomTypeId) return false;
            if (unavailableRoomStatuses.includes(r.status)) return false;
            if ((r.roomNumber as string) === "REUB") return false;
            // Check no reservation conflicts (exclude other group reservations so they don't block each other)
            const resConflict = allReservations.find(res => {
              if (!activeStatuses.includes(res.status)) return false;
              if (res.roomId !== r.id) return false;
              if (groupResIds.has(res.id)) return false;
              return res.checkInDate < checkOut && res.checkOutDate > checkIn;
            });
            if (resConflict) return false;
            const blockConflict = maintenanceBlocks.find(blk =>
              blk.roomId === r.id && blk.blockFrom < checkOut && blk.blockTo > checkIn
            );
            if (blockConflict) return false;
            return true;
          })
          .map(r => ({ id: r.id, roomNumber: r.roomNumber as string }));

        conflicts.push({
          reservationId: linked.id,
          roomId: room.id,
          roomNumber: room.roomNumber as string,
          roomTypeId: room.roomTypeId,
          roomTypeName: roomType?.name || room.roomTypeId,
          passengerName,
          alternatives,
        });
      }

      res.json({ conflicts });
    } catch (error: any) {
      console.error("Error checking date conflicts:", error?.message);
      res.status(500).json({ error: "Error al verificar disponibilidad" });
    }
  });

  app.patch("/api/groups/:id", async (req, res) => {
    try {
      const { name, contactName, contactPhone, contactEmail, eventDate, eventSalon, eventTime, checkInDate, checkOutDate, status, releaseDate, notes, color, masterFolioConfig, billingEntityType, billingEntityId, roomReassignments } = req.body;
      const nullIfEmpty = (v: any) => (v === "" || v === null || v === undefined) ? null : v;
      const updateData: Record<string, unknown> = {};

      if (name !== undefined) updateData.name = name;
      if (contactName !== undefined) updateData.contactName = nullIfEmpty(contactName);
      if (contactPhone !== undefined) updateData.contactPhone = nullIfEmpty(contactPhone);
      if (contactEmail !== undefined) updateData.contactEmail = nullIfEmpty(contactEmail);
      if (eventDate !== undefined) updateData.eventDate = nullIfEmpty(eventDate);
      if (eventSalon !== undefined) updateData.eventSalon = nullIfEmpty(eventSalon);
      if (eventTime !== undefined) updateData.eventTime = nullIfEmpty(eventTime);
      if (checkInDate !== undefined) updateData.checkInDate = checkInDate;
      if (checkOutDate !== undefined) updateData.checkOutDate = checkOutDate;

      // Date integrity check — checkout must be strictly after checkin
      const finalCheckIn = (updateData.checkInDate as string) || undefined;
      const finalCheckOut = (updateData.checkOutDate as string) || undefined;
      if (finalCheckIn && finalCheckOut && finalCheckOut <= finalCheckIn) {
        return res.status(400).json({ error: "La fecha de check-out debe ser posterior al check-in." });
      }

      if (status !== undefined) updateData.status = status;
      if (releaseDate !== undefined) updateData.releaseDate = nullIfEmpty(releaseDate);
      if (notes !== undefined) updateData.notes = nullIfEmpty(notes);
      if (color !== undefined) updateData.color = color;
      if (masterFolioConfig !== undefined) updateData.masterFolioConfig = masterFolioConfig;
      if (billingEntityType !== undefined) updateData.billingEntityType = nullIfEmpty(billingEntityType);
      if (billingEntityId !== undefined) updateData.billingEntityId = nullIfEmpty(billingEntityId);

      // 3.1: Date propagation — fetch current dates BEFORE update
      // Normalize any date value (Date object or string) to "YYYY-MM-DD"
      const toDateStr = (d: any): string | null => {
        if (!d) return null;
        if (typeof d === "string") return d.substring(0, 10);
        if (d instanceof Date) return d.toISOString().substring(0, 10);
        return String(d).substring(0, 10);
      };
      const currentGroup = await storage.getGroup(req.params.id);
      const oldCheckIn = toDateStr(currentGroup?.checkInDate);
      const oldCheckOut = toDateStr(currentGroup?.checkOutDate);

      // Determine whether dates are changing before touching the database
      const newCheckIn = updateData.checkInDate as string | undefined;
      const newCheckOut = updateData.checkOutDate as string | undefined;
      const datesChanged = (newCheckIn && newCheckIn !== oldCheckIn) || (newCheckOut && newCheckOut !== oldCheckOut);

      // Guard: if dates are changing, reject if any linked reservation is currently checked_in
      if (datesChanged) {
        const linksForCheck = await db.select().from(groupReservationLinks).where(eq(groupReservationLinks.groupId, req.params.id));
        const linkedResIds = new Set(linksForCheck.map(l => l.reservationId));
        const allResForCheck = await storage.getReservations();
        const checkedInCount = allResForCheck.filter(r => linkedResIds.has(r.id) && r.status === "checked_in").length;
        if (checkedInCount > 0) {
          return res.status(409).json({
            error: `No se pueden cambiar las fechas mientras hay huéspedes en casa. Hay ${checkedInCount} habitación${checkedInCount !== 1 ? "es" : ""} actualmente en check-in en este grupo.`,
          });
        }
      }

      const group = await storage.updateGroup(req.params.id, updateData);
      if (!group) {
        return res.status(404).json({ error: "Group not found" });
      }

      // 3.1: If dates changed, propagate to pending/confirmed reservations that had the old dates
      let propagatedCount = 0;
      if (datesChanged) {
        const links = await db.select().from(groupReservationLinks).where(eq(groupReservationLinks.groupId, req.params.id));
        for (const link of links) {
          const [linked] = await db.select().from(reservationsTable).where(eq(reservationsTable.id, link.reservationId)).limit(1);
          if (!linked) continue;
          if (!["pending", "confirmed"].includes(linked.status as string)) continue;
          // Propagate group date changes to all pending/confirmed reservations.
          // We update only the date dimension that changed in the group.
          const patch: Record<string, unknown> = {};
          if (newCheckIn) patch.checkInDate = newCheckIn;
          if (newCheckOut) patch.checkOutDate = newCheckOut;
          if (Object.keys(patch).length) {
            await db.update(reservationsTable).set(patch as any).where(eq(reservationsTable.id, linked.id));
            propagatedCount++;
          }
        }
      }

      // 6a: Apply room reassignments sent from the conflict-resolution dialog (with full server-side validation)
      if (datesChanged && roomReassignments && typeof roomReassignments === 'object') {
        // Build the set of reservation IDs that belong to this group for ownership validation
        const groupLinks = await db.select().from(groupReservationLinks).where(eq(groupReservationLinks.groupId, req.params.id));
        const groupResIdSet = new Set(groupLinks.map(l => l.reservationId));

        // Validate uniqueness: no two reservations can be reassigned to the same room
        const targetRoomIds = Object.values(roomReassignments).filter(Boolean) as string[];
        const uniqueTargets = new Set(targetRoomIds);
        if (targetRoomIds.length !== uniqueTargets.size) {
          return res.status(400).json({ error: "Dos reservas no pueden asignarse a la misma habitación." });
        }

        const ciToUse = newCheckIn || (newCheckOut ? group.checkInDate : null);
        const coToUse = newCheckOut || (newCheckIn ? group.checkOutDate : null);

        for (const [reservationId, newRoomId] of Object.entries(roomReassignments)) {
          if (!newRoomId) continue;

          // 1. Ownership: reservationId must belong to this group
          if (!groupResIdSet.has(reservationId)) {
            return res.status(403).json({ error: `Reserva ${reservationId} no pertenece a este grupo.` });
          }

          const [currentRes] = await db.select().from(reservationsTable).where(eq(reservationsTable.id, reservationId)).limit(1);
          if (!currentRes) continue;

          const [newRoom] = await db.select().from(roomsTable).where(eq(roomsTable.id, newRoomId as string)).limit(1);
          if (!newRoom) return res.status(404).json({ error: `Habitación destino ${newRoomId} no encontrada.` });

          // 2. Room type must match original reservation
          if (newRoom.roomTypeId !== currentRes.roomTypeId) {
            return res.status(400).json({ error: `La habitación ${newRoom.roomNumber} no es del mismo tipo que la original.` });
          }

          // 3. Recheck availability at commit time with new dates
          const checkInForRecheck = ciToUse || currentRes.checkInDate;
          const checkOutForRecheck = coToUse || currentRes.checkOutDate;
          const hasConflict = await storage.checkOverbooking(newRoomId as string, checkInForRecheck, checkOutForRecheck, reservationId);
          if (hasConflict) {
            return res.status(409).json({ error: `La habitación ${newRoom.roomNumber} ya no está disponible en esas fechas. Recargá la página y volvé a intentarlo.` });
          }

          // All validations passed — apply the reassignment
          if (currentRes.roomId) {
            await db.update(roomsTable).set({ status: 'available' }).where(eq(roomsTable.id, currentRes.roomId));
          }
          await db.update(reservationsTable)
            .set({ roomId: newRoomId as string, roomTypeId: newRoom.roomTypeId })
            .where(eq(reservationsTable.id, reservationId));
          await db.update(roomsTable).set({ status: 'occupied' }).where(eq(roomsTable.id, newRoomId as string));
        }
      }

      // 2.2: Al cancelar el grupo, cancelar todas las reservas vinculadas (excepto las ya checked_out)
      if (status === 'cancelled') {
        const links = await db.select().from(groupReservationLinks).where(eq(groupReservationLinks.groupId, req.params.id));
        for (const link of links) {
          const [res] = await db.select().from(reservationsTable).where(eq(reservationsTable.id, link.reservationId)).limit(1);
          if (res && res.status !== 'checked_out' && res.status !== 'cancelled') {
            await db.update(reservationsTable).set({ status: 'cancelled' }).where(eq(reservationsTable.id, res.id));
            if (res.roomId) {
              await db.update(roomsTable).set({ status: 'available' }).where(eq(roomsTable.id, res.roomId));
            }
          }
        }
      }

      // Si el nombre cambió, sincronizar el guest placeholder que se usa en planning,
      // rooming list, folio y cualquier otro lugar que muestra el nombre del grupo
      if (name !== undefined) {
        const placeholderCode = `GROUP-${req.params.id}`;
        await db.update(guestsTable)
          .set({ firstName: name, lastName: "" })
          .where(eq(guestsTable.codigo, placeholderCode));
      }

      res.json({ ...group, propagatedCount });
    } catch (error: any) {
      console.error("Error updating group:", error?.message || error);
      res.status(500).json({ error: "Error updating group", detail: error?.message });
    }
  });

  app.delete("/api/groups/:id", requireAuth, async (req, res) => {
    try {
      // Get group info before deleting for audit trail
      const group = await storage.getGroup(req.params.id);
      if (!group) {
        return res.status(404).json({ error: "Group not found" });
      }

      // Solo se puede eliminar un grupo Tentativo sin reservas ni movimientos financieros
      if (group.status !== "tentative") {
        return res.status(400).json({ error: "Solo se pueden eliminar grupos en estado Tentativo. Para cancelar un grupo usá el estado Cancelado." });
      }
      if (group.reservations.length > 0) {
        return res.status(400).json({ error: "No se puede eliminar un grupo que tiene reservas asignadas." });
      }
      const [gCharges, gPayments] = await Promise.all([
        storage.getGroupCharges(req.params.id),
        storage.getGroupPayments(req.params.id),
      ]);
      if (gCharges.length > 0 || gPayments.length > 0) {
        return res.status(400).json({ error: "No se puede eliminar un grupo que tiene movimientos financieros registrados." });
      }

      const reservationCount = 0;

      const deleted = await storage.deleteGroup(req.params.id);
      if (!deleted) {
        return res.status(404).json({ error: "Group not found" });
      }

      await audit(req, "delete", "groups",
        `Grupo eliminado: ${group.name} (${group.groupCode}). ${reservationCount} reserva(s) canceladas.`,
        { entityType: "group", entityId: req.params.id }
      );

      res.json({ success: true, cancelledReservations: reservationCount });
    } catch (error: any) {
      console.error("Error deleting group:", error);
      res.status(500).json({ error: "Error deleting group" });
    }
  });

  // Group Room Blocks
  app.get("/api/groups/:groupId/blocks", async (req, res) => {
    try {
      const blocks = await storage.getGroupBlocks(req.params.groupId);
      res.json(blocks);
    } catch (error) {
      res.status(500).json({ error: "Error fetching group blocks" });
    }
  });

  app.post("/api/groups/:groupId/blocks", async (req, res) => {
    try {
      const { roomTypeId, quantity, ratePlanId, agreedRate, blockCheckInDate, blockCheckOutDate } = req.body;

      if (!roomTypeId || quantity === undefined) {
        return res.status(400).json({ error: "roomTypeId and quantity are required" });
      }

      const qty = typeof quantity === 'number' ? quantity : parseInt(quantity, 10);

      const block = await storage.createGroupBlock({
        groupId: req.params.groupId,
        roomTypeId,
        quantity: qty,
        ratePlanId: ratePlanId || null,
        agreedRate: agreedRate ? String(agreedRate) : null,
        blockCheckInDate: blockCheckInDate || null,
        blockCheckOutDate: blockCheckOutDate || null,
      });

      // Auto-assign available rooms and create placeholder reservations
      const group = await storage.getGroup(req.params.groupId);
      if (group) {
        const checkIn = blockCheckInDate || group.checkInDate;
        const checkOut = blockCheckOutDate || group.checkOutDate;

        const allRoomsOfType = await db.select().from(roomsTable).where(eq(roomsTable.roomTypeId, block.roomTypeId));
        const allReservations = await storage.getReservations();

        const maintenanceBlocks = await storage.getMaintenanceBlocks();
        const availableRooms = allRoomsOfType.filter((room) => isRoomAvailableForInterval({
          room,
          checkIn,
          checkOut,
          reservations: allReservations,
          maintenanceBlocks,
        }));

        let autoAssigned = 0;
        for (const room of availableRooms) {
          if (autoAssigned >= qty) break;
          const nights = Math.max(1, Math.ceil(
            (new Date(checkOut).getTime() - new Date(checkIn).getTime()) / (1000 * 60 * 60 * 24)
          ));
          const rate = agreedRate ? String(agreedRate) : "0";

          // Each placeholder reservation is INDEPENDENT — no shared guest.
          // Use the group's placeholder guest so guestId is never null (schema constraint).
          const placeholderGuest = await getOrCreatePlaceholderGuest(group.id, group.name);
          const reservation = await storage.createReservation({
            reservationCode: `G${group.groupCode}-${room.roomNumber}`,
            guestId: placeholderGuest.id,
            guestName: "",
            // The block is the source of truth for a group allocation. The
            // physical room was filtered against this same persisted ID above.
            roomTypeId: block.roomTypeId,
            roomId: room.id,
            ratePlanId: ratePlanId || null,
            checkInDate: checkIn,
            checkOutDate: checkOut,
            nights,
            baseRatePerNight: rate,
            discountType: "none",
            discountValue: "0",
            finalRatePerNight: rate,
            totalRoomAmount: (parseFloat(rate) * nights).toFixed(2),
            status: "confirmed",
            source: "empresa",
            otaChannelId: null,
            externalReservationId: null,
            numberOfGuests: 1,
            notes: `Grupo: ${group.name}`,
            createdAt: new Date(),
            lastModifiedBy: null,
          } as any);

          await storage.createGroupReservationLink({ groupId: group.id, reservationId: reservation.id });
          await db.update(roomsTable).set({ status: "occupied" }).where(eq(roomsTable.id, room.id));
          autoAssigned++;
        }

        return res.status(201).json({ ...block, autoAssigned, totalRequested: qty });
      }

      res.status(201).json(block);
    } catch (error) {
      res.status(500).json({ error: "Error creating group block" });
    }
  });

  app.patch("/api/group-blocks/:id", async (req, res) => {
    try {
      const block = await storage.updateGroupBlock(req.params.id, req.body);
      if (!block) {
        return res.status(404).json({ error: "Group block not found" });
      }
      res.json(block);
    } catch (error) {
      res.status(500).json({ error: "Error updating group block" });
    }
  });

  app.delete("/api/group-blocks/:id", async (req, res) => {
    try {
      // Get block info before deletion to cancel its placeholder reservations
      const [block] = await db.select().from(groupRoomBlocks).where(eq(groupRoomBlocks.id, req.params.id));
      if (!block) return res.status(404).json({ error: "Group block not found" });
      await assertGroupStructureCanChange(block.groupId);

      // Determine the placeholders to release before removing the block. The
      // destructive block operation itself is deliberately performed first:
      // its storage-level transaction repeats the financial guard, so a
      // concurrent receipt cannot leave reservations/rooms mutated after the
      // endpoint returns a 409.
      const reservationsToCancel: any[] = [];
      const group = await storage.getGroup(block.groupId);
      if (group) {
        const placeholderCode = `GROUP-${block.groupId}`;
        const remainingBlocks = group.blocks.filter(b => b.id !== req.params.id && b.roomTypeId === block.roomTypeId);
        const remainingCapacity = remainingBlocks.reduce((sum, b) => sum + b.quantity, 0);

        const allPlaceholders = group.reservations.filter((r: any) =>
          r.room?.roomTypeId === block.roomTypeId &&
          // Placeholder = no real guest assigned (null guestId) OR legacy shared placeholder guest
          (!r.guestId || r.guest?.codigo === placeholderCode) &&
          !["cancelled", "checked_out"].includes(r.status)
        );

        // Cancel excess placeholder reservations (beyond remaining capacity)
        reservationsToCancel.push(...allPlaceholders.slice(remainingCapacity));
      }

      const deleted = await db.transaction(async (tx) => {
        // Serialize the activity recheck with group-payment recording before
        // changing either the block or its placeholder reservations.
        await tx.execute(sql`SELECT id FROM groups WHERE id = ${block.groupId} FOR UPDATE`);
        const activity = await tx.execute(sql`
          SELECT (
            EXISTS (SELECT 1 FROM group_payments WHERE group_id = ${block.groupId})
            OR EXISTS (SELECT 1 FROM sales_invoices WHERE group_id = ${block.groupId})
          ) AS has_financial_activity
        `);
        if ((activity.rows[0] as any)?.has_financial_activity) {
          throw Object.assign(
            new Error("No se puede modificar el bloqueo ni desasignar habitaciones: el grupo ya tiene cobros o comprobantes fiscales registrados."),
            { statusCode: 409 },
          );
        }
        for (const reservation of reservationsToCancel) {
          await tx.update(reservationsTable).set({ status: "cancelled" }).where(eq(reservationsTable.id, reservation.id));
          if (reservation.roomId) {
            await tx.update(roomsTable).set({ status: "available" }).where(eq(roomsTable.id, reservation.roomId));
          }
        }
        const result = await tx.delete(groupRoomBlocks).where(eq(groupRoomBlocks.id, req.params.id));
        return (result.rowCount ?? 0) > 0;
      });
      if (!deleted) return res.status(404).json({ error: "Group block not found" });
      res.status(204).send();
    } catch (error: any) {
      res.status(error?.statusCode || 500).json({ error: error?.message || "Error deleting group block" });
    }
  });

  // Assign real guest to a pre-blocked (placeholder) reservation, optionally changing room
  app.patch("/api/groups/:groupId/placeholder-reservations/:reservationId", async (req, res) => {
    try {
      const { guestId, guestFirstName, guestLastName, roomId, roomTypeId } = req.body;
      const { groupId, reservationId } = req.params;

      if (!guestId && !guestFirstName?.trim()) {
        return res.status(400).json({ error: "El nombre del pasajero es requerido" });
      }

      const firstName = (guestFirstName || "").trim();
      const lastName = (guestLastName || "").trim();

      // Verify the reservation exists and belongs to this group
      const [link] = await db
        .select()
        .from(groupReservationLinks)
        .where(
          and(
            eq(groupReservationLinks.groupId, groupId),
            eq(groupReservationLinks.reservationId, reservationId)
          )
        )
        .limit(1);
      if (!link) {
        console.error(`[passenger-assign] Reserva ${reservationId} no pertenece al grupo ${groupId}`);
        return res.status(404).json({ error: "Reserva no encontrada en este grupo" });
      }

      // Handle optional room change
      let oldRoomId: string | null = null;
      let newRoomId: string | null = null;
      const reservationUpdates: Record<string, any> = {};
      const [currentRes] = await db
        .select()
        .from(reservationsTable)
        .where(eq(reservationsTable.id, reservationId))
        .limit(1);
      if (!currentRes) {
        return res.status(404).json({ error: "Reserva no encontrada" });
      }

      if (roomId) {
        if (roomId !== currentRes.roomId) {
          const hasConflict = await storage.checkOverbooking(roomId, currentRes.checkInDate, currentRes.checkOutDate, reservationId);
          if (hasConflict) {
            return res.status(400).json({ error: "La habitación ya tiene una reserva en esas fechas" });
          }
          const [newRoom] = await db.select().from(roomsTable).where(eq(roomsTable.id, roomId));
          if (!newRoom) return res.status(404).json({ error: "Habitación no encontrada" });
          const canonicalRoomTypeId = roomTypeId || currentRes.roomTypeId;
          if (!hasCanonicalRoomType(newRoom, canonicalRoomTypeId)) {
            return res.status(400).json({ error: "La habitación no corresponde al tipo del bloque" });
          }
          reservationUpdates.roomId = roomId;
          reservationUpdates.roomTypeId = canonicalRoomTypeId;
          oldRoomId = currentRes.roomId || null;
          newRoomId = roomId;
        }
      }

      let assignedGuest;
      if (guestId) {
        [assignedGuest] = await db
          .select()
          .from(guestsTable)
          .where(eq(guestsTable.id, guestId))
          .limit(1);
        if (!assignedGuest || assignedGuest.codigo?.startsWith("GROUP-")) {
          return res.status(400).json({ error: "El huésped seleccionado no es válido" });
        }
      } else {
        [assignedGuest] = await db.insert(guestsTable).values({
          firstName,
          lastName,
          segment: "LEISURE",
          sexo: "no_especifica",
        } as any).returning();
      }
      if (!assignedGuest?.id) throw new Error("No se pudo crear el registro del huésped");

      const guestName = `${assignedGuest.lastName || ""} ${assignedGuest.firstName || ""}`.trim();
      Object.assign(reservationUpdates, {
        guestId: assignedGuest.id,
        guestName,
      });

      // Direct DB update — bypass storage layer to avoid silent failures
      const [updated] = await db
        .update(reservationsTable)
        .set(reservationUpdates)
        .where(eq(reservationsTable.id, reservationId))
        .returning();

      if (!updated) {
        console.error(`[passenger-assign] updateReservation devolvió vacío para ID ${reservationId}`);
        return res.status(500).json({ error: "No se pudo actualizar la reserva" });
      }

      console.log(`[passenger-assign] OK: reserva ${reservationId} → guest ${assignedGuest.id} "${guestName}"`);

      // Apply room status changes only after the reservation update succeeds
      if (newRoomId) {
        if (oldRoomId) await db.update(roomsTable).set({ status: "available" }).where(eq(roomsTable.id, oldRoomId));
        await db.update(roomsTable).set({ status: "occupied" }).where(eq(roomsTable.id, newRoomId));
      }

      res.json(updated);
    } catch (error: any) {
      console.error("[passenger-assign] Error:", error?.message);
      res.status(500).json({ error: error?.message || "Error al asignar pasajero" });
    }
  });

  // Group Room Assignment
  app.post("/api/groups/:groupId/assign-room", async (req, res) => {
    try {
      const { roomId, roomTypeId, guestId, guestFirstName, guestLastName, checkInDate, checkOutDate, agreedRate, ratePlanId } = req.body;
      if (!roomId || (!guestId && !guestFirstName)) {
        return res.status(400).json({ error: "Room ID and guest first name are required" });
      }

      // Date integrity check — checkout must be strictly after checkin
      if (checkInDate && checkOutDate && checkOutDate <= checkInDate) {
        return res.status(400).json({ error: "La fecha de check-out debe ser posterior al check-in." });
      }

      const group = await storage.getGroup(req.params.groupId);
      if (!group) {
        return res.status(404).json({ error: "Grupo no encontrado" });
      }
      const activeAssigned = (group.reservations || []).filter(
        (r: any) => r.status !== "cancelled" && r.status !== "checked_out"
      ).length;
      if (activeAssigned >= group.totalRooms) {
        return res.status(400).json({ 
          error: `El grupo ya tiene todas sus habitaciones asignadas (${group.totalRooms}). Para agregar más, primero agregue un bloque adicional.` 
        });
      }
      const reservation = await storage.assignRoomToGroup(
        req.params.groupId,
        roomId,
        guestFirstName || "",
        guestLastName || "",
        {
          checkInDate: checkInDate || undefined,
          checkOutDate: checkOutDate || undefined,
          agreedRate: agreedRate ? String(agreedRate) : undefined,
          ratePlanId: ratePlanId !== undefined ? ratePlanId : undefined,
          guestId: guestId || undefined,
          canonicalRoomTypeId: roomTypeId || undefined,
        }
      );
      if (!reservation) {
        return res.status(400).json({ error: "Could not assign room to group" });
      }
      res.status(201).json(reservation);
    } catch (error: any) {
      const msg = error?.message || "Error assigning room to group";
      res.status(400).json({ error: msg });
    }
  });

  // Group Mass Actions - Check-in all group reservations
  app.post("/api/groups/:groupId/check-in-all", requireAuth, async (req, res) => {
    try {
      const result = await storage.bulkCheckIn(req.params.groupId);
      res.json({ success: result.processed, failed: result.skipped, errors: result.skippedRooms.map((r: string) => `Hab. ${r}: no disponible para check-in`) });
    } catch (error) {
      res.status(500).json({ error: "Error en check-in grupal" });
    }
  });

  app.post("/api/groups/:groupId/check-out-all", requireAuth, async (req, res) => {
    try {
      const result = await storage.bulkCheckOut(req.params.groupId);
      await audit(req, "update", "groups",
        `Check-out grupal: ${result.processed} habitaciones procesadas`,
        { entityType: "group", entityId: req.params.groupId }
      );
      res.json({ success: result.processed, failed: result.skipped, errors: result.pendingBalance.map((p: any) => `Hab. ${p.room}: saldo pendiente $${p.balance.toFixed(2)}`) });
    } catch (error: any) {
      console.error("[group-check-out-all]", error);
      res.status(error?.statusCode || 500).json({
        error: error?.statusCode ? (error.message || "No se pudo realizar el check-out grupal") : "Error en check-out grupal",
      });
    }
  });

  // Group Invoice - Get consolidated invoice data for the group
  app.get("/api/groups/:groupId/invoice", async (req, res) => {
    try {
      const group = await storage.getGroup(req.params.groupId);
      if (!group) {
        return res.status(404).json({ error: "Group not found" });
      }

      // Same batched, filtered per-reservation facts (active reservations,
      // totalRoomAmount, non-"anulado" charges/payments) used by /folio and
      // /master-folio, plus the group payments they already reconcile
      // against, so the Resumen del Grupo can never show a different balance
      // than the Folio Grupal for the same underlying charges and receipts.
      const [groupChargesList, allGroupPayments, ledgerLines, billing] = await Promise.all([
        storage.getGroupCharges(req.params.groupId),
        storage.getGroupPayments(req.params.groupId),
        storage.getGroupReservationLedger(req.params.groupId),
        getGroupInvoiceSnapshot(req.params.groupId),
      ]);
      const operational = computeGroupOperationalLedger(ledgerLines, groupChargesList, allGroupPayments);

      const invoiceData = {
        group: {
          code: group.groupCode,
          name: group.name,
          contactName: group.contactName,
          contactPhone: group.contactPhone,
          contactEmail: group.contactEmail,
          checkInDate: group.checkInDate,
          checkOutDate: group.checkOutDate,
        },
        reservations: [] as any[],
        groupCharges: groupChargesList.map((c: any) => ({
          description: c.description,
          amount: parseFloat(c.amount),
          category: c.category,
          date: c.createdAt,
        })),
        totals: {
          accommodation: 0,
          charges: 0,
          groupCharges: 0,
          payments: 0,
          balance: 0,
        },
        billing,
      };

      for (const line of ledgerLines) {
        const totalCost = line.accommodationTotal + line.extrasTotal;
        const roomSourcePrefix = `reservation:${line.reservationId}:`;
        const roomSources = billing.sources.filter((source) => source.id.startsWith(roomSourcePrefix));
        const financial = buildGroupRoomFinancialSnapshot({
          accommodation: line.accommodationTotal,
          extras: line.extrasTotal,
          collected: line.paymentsTotal,
          invoiced: roomSources.reduce((sum, source) => sum + source.invoiced, 0),
          fiscalAvailable: roomSources.reduce((sum, source) => sum + source.available, 0),
        });

        invoiceData.reservations.push({
          reservationCode: line.reservationCode,
          guest: line.guestName,
          room: line.roomNumber,
          nights: line.nights,
          ratePerNight: line.nights > 0 ? line.accommodationTotal / line.nights : line.accommodationTotal,
          accommodationTotal: line.accommodationTotal,
          charges: line.charges.map((c: any) => ({
            description: c.description,
            amount: parseFloat(c.amount),
            category: c.category,
            date: c.date,
          })),
          chargesTotal: line.extrasTotal,
          payments: line.payments.map((p: any) => ({
            method: p.method,
            amount: parseFloat(p.amount),
            date: p.date,
            reference: p.reference,
            retention: parsePaymentRetention(p.notes),
          })),
          paymentsTotal: line.paymentsTotal,
          balance: financial.operationalBalance,
          financial,
        });

      }

      invoiceData.totals.accommodation = operational.accommodation;
      invoiceData.totals.charges = operational.extras;
      invoiceData.totals.groupCharges = operational.groupCharges;
      invoiceData.totals.payments = operational.payments;
      invoiceData.totals.balance = Math.max(0, operational.balance);

      res.json(invoiceData);
    } catch (error) {
      res.status(500).json({ error: "Error generating group invoice" });
    }
  });

  // Single fiscal snapshot used by the group summary and payment invoice
  // dialogs. It exposes source-level eligible, invoiced and available values;
  // UI numbers are previews only and are rechecked under a server lock.
  app.get("/api/groups/:groupId/invoice-snapshot", requireAuth, async (req, res) => {
    try {
      const group = await storage.getGroup(req.params.groupId);
      if (!group) return res.status(404).json({ error: "Grupo no encontrado" });
      res.json(await getGroupInvoiceSnapshot(req.params.groupId));
    } catch (error) {
      console.error("[group-invoice-snapshot] Error:", error);
      res.status(500).json({ error: "Error al calcular la disponibilidad de facturación del grupo" });
    }
  });

  app.get("/api/groups/:groupId/pending-fiscal-collections", requireAuth, async (req, res) => {
    try {
      assertFinancialSchemaReady();
      const result = await db.execute(sql`
        SELECT id, items, group_payment_intent
        FROM sales_invoices
        WHERE group_id = ${req.params.groupId}
          AND estado = 'emitida'
          AND group_payment_id IS NULL
          AND group_payment_intent IS NOT NULL
        ORDER BY id
      `);
      res.json(result.rows.map((row: any) => ({
        id: Number(row.id),
        items: row.items,
        intent: row.group_payment_intent,
      })));
    } catch (error) {
      console.error("[pending-fiscal-collections] Error:", error);
      const typedError = error as any;
      res.status(typedError?.statusCode || 500).json({
        error: typedError?.message || "No se pudieron recuperar los cobros fiscales pendientes",
        ...(typedError?.code ? { code: typedError.code } : {}),
      });
    }
  });

  app.post("/api/groups/:groupId/payment", requireAuth, async (req, res) => {
    try {
      const group = await storage.getGroup(req.params.groupId);
      if (!group) {
        return res.status(404).json({ error: "Grupo no encontrado" });
      }

      const {
        paymentRows: rawPaymentRows,
        amount: legacyAmount, method: legacyMethod, reference: legacyReference,
        receiptType, distribution, closeAllRooms, closeReservationIds: rawCloseReservationIds,
        ccEntityType: legacyCcEntityType, ccEntityId: legacyCcEntityId,
        billingEntityType: rawBillingEntityType, billingEntityId: rawBillingEntityId,
        receiverDetails, concepts, notes, invoiceData, settlementBreakdown: rawSettlementBreakdown,
      } = req.body;

      const paymentRows = validateAndNormalizePaymentRows<{method: string; amount: string; reference?: string; retention?: { tipo: string; monto: number }}>(
        rawPaymentRows?.length
          ? rawPaymentRows
          : [{ method: legacyMethod, amount: legacyAmount, reference: legacyReference }]
      );
      const totalAmount = paymentRowsGrossTotal(paymentRows);
      if (totalAmount <= 0) {
        return res.status(400).json({ error: "El monto debe ser positivo" });
      }
      const evidence = validateGroupPaymentEvidence(receiptType, paymentRows, receiverDetails, concepts);
      if (isFiscalGroupReceipt(evidence.receiptType) && !invoiceData?.id) {
        return res.status(409).json({ error: "Confirmá la factura antes de registrar el cobro grupal." });
      }

      const billingEntityType = rawBillingEntityType || legacyCcEntityType;
      const billingEntityId = rawBillingEntityId || legacyCcEntityId;
      const hasCuentaCorriente = paymentRows.some((r: any) => r.method === "cuenta_corriente");
      if (hasCuentaCorriente && (!billingEntityType || !billingEntityId)) {
        return res.status(400).json({ error: "Seleccione la empresa o agencia para el pago por cuenta corriente." });
      }

      const activeReservations = group.reservations.filter(
        (r: any) => r.status === "confirmed" || r.status === "checked_in"
      );
      if (activeReservations.length === 0) {
        return res.status(400).json({ error: "No hay reservas activas (confirmadas o en casa) para registrar pagos" });
      }

      const today = getArgentinaToday();
      const [ledgerLines, groupChargesList, groupPaymentsList, invoiceSnapshot] = await Promise.all([
        storage.getGroupReservationLedger(req.params.groupId),
        storage.getGroupCharges(req.params.groupId),
        storage.getGroupPayments(req.params.groupId),
        getGroupInvoiceSnapshot(req.params.groupId),
      ]);
      const operational = computeGroupOperationalLedger(ledgerLines, groupChargesList, groupPaymentsList);
      const activeIds = new Set(activeReservations.map((reservation: any) => reservation.id));
      const requestedCloseIds = Array.isArray(rawCloseReservationIds)
          ? Array.from(new Set(rawCloseReservationIds.map((id: unknown) => String(id))))
          : closeAllRooms
            ? activeReservations.map((reservation: any) => reservation.id)
            : [];
      const shouldCloseReservations = requestedCloseIds.length > 0;
      if (requestedCloseIds.some((id) => !activeIds.has(id))) {
        return res.status(400).json({ error: "Sólo se pueden cerrar habitaciones activas de este grupo." });
      }
      const balances = ledgerLines
        .filter((line) => activeIds.has(line.reservationId))
        .map((line) => ({
          id: line.reservationId,
          balance: Math.max(0, Math.round((line.accommodationTotal + line.extrasTotal - line.paymentsTotal) * 100) / 100),
        }));
      const balancesById = new Map(balances.map((item) => [item.id, item.balance]));
      const selectedBalance = requestedCloseIds.reduce((sum, id) => sum + (balancesById.get(id) || 0), 0);
      const totalBalance = Math.max(0, operational.balance);
      let nonFiscalAdvancesForAllocation = 0;
      if (isFiscalGroupReceipt(evidence.receiptType)) {
        const conceptsTotal = evidence.concepts.reduce((sum, concept) => sum + concept.amount, 0);
        const fiscalAvailable = invoiceSnapshot.financial?.fiscalAvailable ?? invoiceSnapshot.totals.available;
        const nonFiscalAdvances = invoiceSnapshot.financial?.nonFiscalAdvances ?? 0;
        nonFiscalAdvancesForAllocation = Math.max(0, Number(nonFiscalAdvances) || 0);
        // Once ARCA confirmed the invoice, that same document already consumes
        // its source availability. recordGroupPayment validates and claims the
        // persisted invoice atomically, so comparing it again with the reduced
        // post-emission availability would reject every valid confirmation.
        if (!invoiceData && Math.round(conceptsTotal * 100) > Math.round(fiscalAvailable * 100)) {
          return res.status(400).json({
            error: `La factura de $${conceptsTotal.toFixed(2)} supera el disponible fiscal de $${fiscalAvailable.toFixed(2)}.`,
          });
        }
        const requiredCollection = requiredGroupInvoiceCollection(
          conceptsTotal,
          nonFiscalAdvances,
        );
        if (!groupInvoiceCollectionMatches({
          newCollection: totalAmount,
          conceptsTotal,
          nonFiscalAdvances,
          closeAllRooms: shouldCloseReservations,
          operationalBalance: shouldCloseReservations ? selectedBalance : totalBalance,
        })) {
          return res.status(400).json({
            error: shouldCloseReservations
              ? `Para cerrar las habitaciones elegidas, el cobro nuevo debe cubrir su saldo exacto de $${selectedBalance.toFixed(2)} e incluir al menos $${requiredCollection.toFixed(2)} para la factura.`
              : `El cobro nuevo debe ser $${requiredCollection.toFixed(2)}; la diferencia se cubre con adelantos no fiscalizados.`,
          });
        }
      }
      if (Math.round(totalAmount * 100) > Math.round(totalBalance * 100)) {
        return res.status(400).json({ error: `El cobro de $${totalAmount.toFixed(2)} supera el saldo grupal disponible de $${totalBalance.toFixed(2)}.` });
      }
      if (shouldCloseReservations && Math.round(totalAmount * 100) !== Math.round(selectedBalance * 100)) {
        return res.status(400).json({ error: `Para cerrar las habitaciones elegidas, el pago debe coincidir exactamente con su saldo de $${selectedBalance.toFixed(2)}.` });
      }

      const allocation = shouldCloseReservations
        ? Object.fromEntries(requestedCloseIds
            .map((id) => ({ id, balance: balancesById.get(id) || 0 }))
            .filter((item) => item.balance > 0)
            .map((item) => [item.id, Number(item.balance.toFixed(2))]))
        : distributeCents(
            Math.round(totalAmount * 100),
            // An earlier advance may have been explicitly directed to a room.
            // Allocate this final collection against each room's *remaining*
            // balance, rather than re-equalizing the total and moving that
            // directed credit to other rooms.
            balances.map((item) => ({
              id: item.id,
              weight: distribution === "proportional" || nonFiscalAdvancesForAllocation > 0
                ? item.balance
                : 1,
            }))
          );
      const persistedConcepts = normalizeConceptsForGroupPaymentDestination({
        destination: "group_distribution",
        concepts: evidence.concepts,
        distributionDetail: allocation,
        ledgerLines,
        groupName: group.name,
      });
      const conceptsTotal = evidence.concepts.reduce((sum, concept) => sum + concept.amount, 0);
      const settlementBreakdown = buildSettlementBreakdown({
        documentTotal: isFiscalGroupReceipt(evidence.receiptType) ? conceptsTotal : totalAmount,
        newCollection: totalAmount,
        availableAdvances: isFiscalGroupReceipt(evidence.receiptType)
          ? confirmedInvoiceAppliedAdvances(
              invoiceData,
              Number(invoiceSnapshot.financial?.nonFiscalAdvances || 0),
            )
          : 0,
        supplied: rawSettlementBreakdown,
      });
      const recorded = await storage.recordGroupPayment({
        groupId: req.params.groupId,
        destination: "group_distribution",
        paymentRows,
        date: today,
        reference: paymentRows.map((row) => String(row.reference || "").trim()).filter(Boolean).join(" / ")
          || `Pago grupal${shouldCloseReservations ? " (cierre dirigido)" : ""} — ${group.name}`,
        distribution: distribution || "equal",
        distributionDetail: allocation,
        receivedBy: (req.user as any)?.username || null,
        notes: formatGroupPaymentNotes(notes, persistedConcepts),
        cashLabel: `Pago Grupal — ${group.name}`,
        receiptType: evidence.receiptType,
        billingEntityType: billingEntityType || null,
        billingEntityId: billingEntityId || null,
        receiverDetails: evidence.receiver,
        concepts: persistedConcepts,
        invoiceData: isFiscalGroupReceipt(evidence.receiptType) ? invoiceData : null,
        invoiceTotal: isFiscalGroupReceipt(evidence.receiptType)
          ? conceptsTotal
          : null,
        settlementBreakdown,
        closeReservationIds: shouldCloseReservations ? requestedCloseIds : undefined,
      });

      const checkoutCount = recorded.closedReservations?.processed || 0;

      res.json({
        success: true,
        groupPayment: recorded.groupPayment,
        groupPaymentId: recorded.groupPayment.id,
        distributed: Object.keys(allocation).length,
        checkoutCount,
        closedReservationIds: shouldCloseReservations ? requestedCloseIds : [],
        paymentIds: recorded.reservationPayments.map((payment) => payment.id),
        paymentId: recorded.reservationPayments[0]?.id ?? null,
      });
    } catch (error: any) {
      console.error("Error processing group payment:", error);
      res.status(error?.statusCode || 500).json({ error: error?.message || "Error al registrar pago grupal" });
    }
  });

  // Group Folio endpoints
  app.get("/api/groups/:groupId/folio", requireAuth, async (req, res) => {
    try {
      const folio = await storage.getGroupFolio(req.params.groupId);
      res.json(folio);
    } catch (error: any) {
      if (error.message === "Grupo no encontrado") return res.status(404).json({ error: error.message });
      console.error("[folio-grupal] Error:", error);
      res.status(500).json({ error: "Error al obtener folio grupal" });
    }
  });

  // Direct invoices: facturas emitidas desde el Resumen del Grupo sin pago asociado
  app.get("/api/groups/:groupId/direct-invoices", requireAuth, async (req, res) => {
    try {
      const rows = await db
        .select()
        .from(groupInvoicesTable)
        .where(eq(groupInvoicesTable.groupId, req.params.groupId))
        .orderBy(desc(groupInvoicesTable.createdAt));
      res.json(rows);
    } catch (error: any) {
      console.error("[group-direct-invoices] GET Error:", error);
      res.status(500).json({ error: "Error al obtener facturas del grupo" });
    }
  });

  // Every fiscal document issued for the group, including payment-linked
  // invoices, direct invoices, credit notes and reissues. The composition is
  // always rebuilt from the document's persisted source map, never from the
  // current operational balance.
  app.get("/api/groups/:groupId/invoices", requireAuth, async (req, res) => {
    try {
      const [ownedRows, linkedRows] = await Promise.all([
        db
          .select()
          .from(salesInvoicesTable)
          .where(eq(salesInvoicesTable.groupId, req.params.groupId)),
        db
          .select({ invoice: salesInvoicesTable })
          .from(groupInvoicesTable)
          .innerJoin(salesInvoicesTable, eq(groupInvoicesTable.salesInvoiceId, salesInvoicesTable.id))
          .where(eq(groupInvoicesTable.groupId, req.params.groupId)),
      ]);
      const invoiceById = new Map(ownedRows.map((invoice) => [invoice.id, invoice]));
      for (const linked of linkedRows) invoiceById.set(linked.invoice.id, linked.invoice);
      const rows = [...invoiceById.values()].sort((a, b) =>
        Number(b.createdAt || 0) - Number(a.createdAt || 0) || b.id - a.id
      );
      const compositionSources = await getGroupInvoiceCompositionSources(req.params.groupId);
      const fiscalTypes = new Set([
        "FA", "FB", "FC", "FT", "FM",
        "NCA", "NCB", "NCC", "NCT", "NCM",
        "NDA", "NDB", "NDC", "NDT", "NDM",
      ]);
      const invoices = rows
        .filter((invoice) => fiscalTypes.has(invoice.tipoComprobante))
        .map((invoice) => {
          const sourceAmounts = parseSourceAmountMap(invoice.sourceChargeAmounts);
          const persistedSources = getPersistedGroupInvoiceCompositionSources(invoice.items);
          return exposeInvoiceReconciliation({
            ...invoice,
            groupReconciliationLinked: Boolean(invoice.groupPaymentId),
            groupComposition: Object.keys(sourceAmounts).length > 0
              ? buildGroupInvoiceComposition(
                  persistedSources.length > 0 ? persistedSources : compositionSources,
                  sourceAmounts,
                )
              : buildUnavailableGroupInvoiceComposition(invoice.montoTotal),
          });
        });
      res.json(invoices);
    } catch (error: any) {
      console.error("[group-invoices] GET Error:", error);
      res.status(500).json({ error: "Error al obtener los comprobantes del grupo" });
    }
  });

  app.post("/api/groups/:groupId/direct-invoice", requireAuth, async (req, res) => {
    try {
      const { invoiceData, notes } = req.body;
      if (!invoiceData || typeof invoiceData !== "object") {
        return res.status(400).json({ error: "invoiceData es requerido y debe ser un objeto" });
      }

      // emitirFactura returns camelCase Drizzle fields; validate those field names
      const { id: invoiceId, tipoComprobante, numero, puntoVenta } = invoiceData;
      if (!tipoComprobante || numero == null || puntoVenta == null) {
        return res.status(400).json({ error: "invoiceData debe contener tipoComprobante, puntoVenta y numero" });
      }
      if (invoiceId == null) {
        return res.status(400).json({ error: "invoiceData debe contener el id del comprobante emitido" });
      }

      // Verify the invoice was actually issued through our system (salesInvoices table)
      const [storedInvoice] = await db
        .select({
          id: salesInvoicesTable.id,
          groupId: salesInvoicesTable.groupId,
          groupPaymentId: salesInvoicesTable.groupPaymentId,
          sourceChargeAmounts: salesInvoicesTable.sourceChargeAmounts,
        })
        .from(salesInvoicesTable)
        .where(eq(salesInvoicesTable.id, Number(invoiceId)))
        .limit(1);
      if (!storedInvoice) {
        return res.status(400).json({ error: "El comprobante indicado no existe en el sistema" });
      }
      if (storedInvoice.groupId !== req.params.groupId || storedInvoice.groupPaymentId || !storedInvoice.sourceChargeAmounts) {
        return res.status(409).json({
          error: "El comprobante no fue emitido con conceptos disponibles de este grupo y no puede vincularse como factura directa.",
        });
      }

      // Verify the group exists
      const group = await storage.getGroup(req.params.groupId);
      if (!group) return res.status(404).json({ error: "Grupo no encontrado" });

      // Idempotent upsert: if this salesInvoiceId is already linked, return the existing row
      const [created] = await db
        .insert(groupInvoicesTable)
        .values({
          groupId: req.params.groupId,
          salesInvoiceId: Number(invoiceId),
          invoiceRef: JSON.stringify(invoiceData),
          notes: notes ?? null,
        })
        .onConflictDoUpdate({
          target: groupInvoicesTable.salesInvoiceId,
          set: { groupId: req.params.groupId, invoiceRef: JSON.stringify(invoiceData), notes: notes ?? null },
        })
        .returning();
      res.json(created);
    } catch (error: any) {
      console.error("[group-direct-invoices] POST Error:", error);
      res.status(500).json({ error: "Error al guardar factura directa del grupo" });
    }
  });

  // Link an issued invoice to the parent group payment. This avoids relying on
  // one arbitrary room allocation when a payment has several rooms or methods.
  app.patch("/api/groups/:groupId/payments/:paymentId/invoice", requireAuth, async (req, res) => {
    try {
      const { invoiceData } = req.body;
      if (!invoiceData?.id) return res.status(400).json({ error: "invoiceData es requerido" });
      const { payment, updated } = await db.transaction(async (tx) => {
        const [payment] = await tx.select()
          .from(groupPaymentsTable)
          .where(and(
            eq(groupPaymentsTable.id, req.params.paymentId),
            eq(groupPaymentsTable.groupId, req.params.groupId),
          ))
          .limit(1);
        if (!payment) throw Object.assign(new Error("Cobro grupal no encontrado"), { statusCode: 404 });

        const [storedInvoice] = await tx.select()
          .from(salesInvoicesTable)
          .where(eq(salesInvoicesTable.id, Number(invoiceData.id)))
          .limit(1);
        if (!storedInvoice) throw Object.assign(new Error("El comprobante indicado no existe en el sistema"), { statusCode: 400 });
        assertGroupPaymentInvoiceScope(storedInvoice, payment, req.params.groupId);
        const receiver = (payment.receiverDetails || {}) as Record<string, string | undefined>;
        const normalizeCuit = (value?: string | null) => String(value || "").replace(/\D/g, "");
        const normalizeDocument = (value?: string | null) => String(value || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
        const normalizeName = (value?: string | null) => String(value || "").trim().replace(/\s+/g, " ").toUpperCase();
        if (receiver.cuit && normalizeCuit(storedInvoice.clienteCuit) !== normalizeCuit(receiver.cuit)) {
          throw Object.assign(new Error("El CUIT de la factura no coincide con el receptor del cobro."), { statusCode: 400 });
        }
        if (!receiver.cuit && receiver.dni && normalizeDocument(storedInvoice.clienteDni) !== normalizeDocument(receiver.dni)) {
          throw Object.assign(new Error("El DNI de la factura no coincide con el receptor del cobro."), { statusCode: 400 });
        }
        if (!receiver.cuit && !receiver.dni && receiver.razonSocial
          && normalizeName(storedInvoice.clienteRazonSocial) !== normalizeName(receiver.razonSocial)) {
          throw Object.assign(new Error("El receptor de la factura no coincide con el receptor del cobro."), { statusCode: 400 });
        }

        // A retry for the exact same invoice is safe. A replacement is allowed
        // only after the previously linked document was fully credited: both
        // fiscal documents remain in sales_invoices under the same payment
        // scope, while group_payments points at the currently active one.
        if (payment.invoiceId) {
          if (payment.invoiceId === storedInvoice.id) return { payment, updated: payment };
          const [previousInvoice] = await tx.select()
            .from(salesInvoicesTable)
            .where(eq(salesInvoicesTable.id, payment.invoiceId))
            .limit(1);
          const fullyCredited = previousInvoice
            && Number(previousInvoice.montoAcreditado || 0) >= Number(previousInvoice.montoTotal || 0) - 0.009;
          if (!fullyCredited) {
            throw Object.assign(new Error("Este cobro ya tiene una factura fiscal vigente. Primero emití una Nota de Crédito por el total para poder reemitirla."), { statusCode: 409 });
          }
        }
        const [usedByAnotherPayment] = await tx.select({ id: groupPaymentsTable.id })
          .from(groupPaymentsTable)
          .where(eq(groupPaymentsTable.invoiceId, storedInvoice.id))
          .limit(1);
        if (usedByAnotherPayment) throw Object.assign(new Error("Esta factura ya está vinculada a otro cobro grupal."), { statusCode: 409 });

        const [updated] = await tx.update(groupPaymentsTable)
          .set({ invoiceId: storedInvoice.id, invoiceRef: JSON.stringify(invoiceData) })
          .where(and(
            eq(groupPaymentsTable.id, payment.id),
            payment.invoiceId
              ? eq(groupPaymentsTable.invoiceId, payment.invoiceId)
              : sql`${groupPaymentsTable.invoiceId} IS NULL`,
          ))
          .returning();
        if (!updated) throw Object.assign(new Error("El cobro fue vinculado a una factura por otra operación. Actualice la pantalla."), { statusCode: 409 });
        if (storedInvoice.reconciliationStatus === "pendiente" && storedInvoice.groupPaymentIntent) {
          await tx.update(salesInvoicesTable)
            .set({
              reconciliationStatus: "conciliada",
              reconciliationError: null,
              reconciliationUpdatedAt: new Date(),
            })
            .where(eq(salesInvoicesTable.id, storedInvoice.id));
        }
        return { payment, updated };
      });
      await audit(req, "update", "groups", `Factura vinculada al cobro grupal: $${payment.amount}`, {
        entityType: "group",
        entityId: req.params.groupId,
      });
      res.json(updated);
    } catch (error: any) {
      console.error("[group-payment-invoice] Error:", error);
      if (error?.code === "23505") {
        return res.status(409).json({ error: "Esta factura ya está vinculada a otro cobro grupal." });
      }
      res.status(error?.statusCode || 500).json({ error: error?.message || "Error al vincular la factura al cobro grupal" });
    }
  });

  app.post("/api/groups/:groupId/charges", requireAuth, async (req, res) => {
    try {
      const { description, amount, date, category } = req.body;
      if (!description || !amount || !date) {
        return res.status(400).json({ error: "description, amount y date son requeridos" });
      }
      const charge = await storage.createGroupCharge({
        groupId: req.params.groupId,
        description,
        amount: parseFloat(amount).toFixed(2),
        date,
        category: category || "otros",
        billingTarget: "group",
        reservationId: null,
        createdBy: (req.user as any)?.username || null,
      });
      res.json(charge);
    } catch (error) {
      res.status(500).json({ error: "Error al crear cargo grupal" });
    }
  });

  app.delete("/api/groups/:groupId/charges/:chargeId", requireAuth, async (req, res) => {
    try {
      const [charge] = await db.select().from(groupChargesTable)
        .where(and(eq(groupChargesTable.id, req.params.chargeId), eq(groupChargesTable.groupId, req.params.groupId)))
        .limit(1);
      if (!charge) return res.status(404).json({ error: "Cargo no encontrado o no pertenece a este grupo" });
      const sourceId = `group-charge:${req.params.chargeId}`;
      const activeReference = await db.execute(sql`
        SELECT 1
        FROM sales_invoices si
        WHERE si.group_id = ${req.params.groupId}
          AND si.tipo_comprobante IN ('FA', 'FB', 'FC', 'FT', 'FM')
          AND si.estado IN ('emitida', 'parcial')
          AND COALESCE(si.source_charge_amounts->>${sourceId}, '0')::numeric > 0
          AND COALESCE(si.monto_total, 0)::numeric > COALESCE(si.monto_acreditado, 0)::numeric + 0.009
        LIMIT 1
      `);
      if (activeReference.rows.length) {
        return res.status(409).json({ error: "No se puede eliminar un cargo incluido en una factura fiscal vigente." });
      }
      const ok = await storage.deleteGroupCharge(req.params.chargeId);
      if (!ok) return res.status(404).json({ error: "Cargo no encontrado" });
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Error al eliminar cargo grupal" });
    }
  });

  app.get("/api/groups/:groupId/payments", requireAuth, async (req, res) => {
    try {
      const payments = await storage.getGroupPayments(req.params.groupId);
      res.json(payments);
    } catch (error) {
      res.status(500).json({ error: "Error al obtener pagos grupales" });
    }
  });

  // A receipt belongs to its parent group payment, never to one of the
  // room-level allocation rows. Checking both path ids prevents a valid
  // authenticated user from retrieving another group's receipt by UUID.
  app.get("/api/groups/:groupId/payments/:paymentId/receipt.pdf", requireAuth, async (req, res) => {
    try {
      const group = await storage.getGroup(req.params.groupId);
      if (!group) return res.status(404).json({ error: "Grupo no encontrado" });
      const groupPayments = await storage.getGroupPayments(req.params.groupId);
      const payment = groupPayments.find((entry: any) => entry.id === req.params.paymentId);
      if (!payment) return res.status(404).json({ error: "Recibo de pago grupal no encontrado" });

      const ledger = await storage.getGroupReservationLedger(req.params.groupId);
      const distribution = payment.distributionDetail && typeof payment.distributionDetail === "object"
        ? payment.distributionDetail as Record<string, unknown> : {};
      const roomDistribution = Object.entries(distribution)
        .filter(([reservationId, amount]) => !reservationId.startsWith("__") && Number(amount) > 0)
        .map(([reservationId, amount]) => {
          const room = ledger.find((line) => line.reservationId === reservationId);
          return {
            roomNumber: room?.roomNumber,
            guestName: room?.guestName,
            reservationCode: room?.reservationCode,
            amount: Number(amount),
          };
        });
      // Room retentions live on allocation notes, whereas a master-only
      // retention lives on the parent. Combine them only for presentation.
      const roomRetentions = ledger.flatMap((line) => line.payments
        .filter((row: any) => row.groupPaymentId === payment.id)
        .map((row: any) => parsePaymentRetention(row.notes))
        .filter((retention): retention is { tipo: string; monto: number } => Boolean(retention)));
      const pdf = await generateGroupPaymentReceiptPdf({
        receiptNumber: (payment as any).receiptNumber ?? null,
        legacyId: payment.id,
        group: { name: (group as any).name || "Grupo", code: (group as any).groupCode },
        payment: {
          ...(payment as any),
          retentionDetail: [...parseGroupPaymentRetentions((payment as any).retentionDetail), ...roomRetentions],
        },
        roomDistribution,
      });
      const receiptToken = (payment as any).receiptNumber ?? payment.id;
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="recibo-grupal-${receiptToken}.pdf"`);
      res.send(pdf);
    } catch (error: any) {
      console.error("[group-payment-receipt] Error:", error);
      res.status(error?.statusCode || 500).json({ error: error?.message || "No se pudo generar el recibo grupal" });
    }
  });

  app.post("/api/groups/:groupId/payment/v2", requireAuth, async (req, res) => {
    try {
      assertFinancialSchemaReady();
      const { amount, method, date, reference, distribution, distributionDetail, notes, receiptType, receiverDetails, concepts } = req.body;
      if (!amount || !method) {
        return res.status(400).json({ error: "amount y method son requeridos" });
      }
      const totalAmount = parseFloat(amount);
      if (totalAmount <= 0) return res.status(400).json({ error: "El monto debe ser positivo" });
      const paymentRows = [{ method, amount: totalAmount.toFixed(2), reference }];
      const evidence = validateGroupPaymentEvidence(receiptType, paymentRows, receiverDetails, concepts);

      const paymentDate = date || new Date().toISOString().split("T")[0];
      const distrib = distribution || "equal";

      const detail = await storage.distributeGroupPayment(
        req.params.groupId,
        totalAmount,
        distrib,
        distributionDetail
      );
      const persistedConcepts = normalizeConceptsForGroupPaymentDestination({
        destination: "group_distribution",
        concepts: evidence.concepts,
        distributionDetail: detail,
        ledgerLines: [],
        groupName: req.params.groupId,
      });

      // A single parent movement owns both the receipt and all room
      // allocations. This keeps this legacy entry point aligned with Pago
      // Grupal and avoids counting parent + children twice.
      const recorded = await storage.recordGroupPayment({
        groupId: req.params.groupId,
        destination: "group_distribution",
        paymentRows,
        date: paymentDate,
        reference: reference || "Pago grupal distribuido",
        distribution: distrib,
        distributionDetail: detail,
        receivedBy: (req.user as any)?.username || null,
        notes: formatGroupPaymentNotes(notes, persistedConcepts),
        cashLabel: `Pago Grupal — ${req.params.groupId}`,
        receiptType: evidence.receiptType,
        receiverDetails: evidence.receiver,
        concepts: persistedConcepts,
      });

      await audit(req, "create", "groups",
        `Pago grupal: $${req.body.amount} (${req.body.method})`,
        { entityType: "group", entityId: req.params.groupId }
      );
      res.json({
        success: true,
        groupPayment: recorded.groupPayment,
        groupPaymentId: recorded.groupPayment.id,
        paymentId: recorded.reservationPayments[0]?.id ?? null,
        distributed: Object.keys(detail).length,
      });
    } catch (error: any) {
      res.status(error?.statusCode || 500).json({ error: error?.message || "Error al registrar pago grupal" });
    }
  });

  app.post("/api/groups/:groupId/transfer-charge", requireAuth, async (req, res) => {
    try {
      const { chargeId } = req.body;
      if (!chargeId) return res.status(400).json({ error: "chargeId es requerido" });
      const transferred = await storage.transferChargeToGroup(chargeId, req.params.groupId);
      // Also delete the source charge to avoid double-counting
      try { await storage.deleteCharge(chargeId); } catch {}
      res.json(transferred);
    } catch (error: any) {
      if (error.message === "Cargo no encontrado") return res.status(404).json({ error: error.message });
      res.status(500).json({ error: "Error al transferir cargo" });
    }
  });

  // POST reverse a group-folio charge (undo a transfer-to-group or manually added group charge)
  // Guard: chargeId must be present in the request body — a missing value must never reach
  // the DB layer and produce a confusing generic error.
  app.post("/api/groups/:groupId/reverse-transfer-charge", requireAuth, async (req, res) => {
    try {
      const { groupId } = req.params;
      const { chargeId } = req.body;

      if (!chargeId) return res.status(400).json({ error: "Se requiere chargeId" });

      // Verify the group exists
      const group = await storage.getGroup(groupId);
      if (!group) return res.status(404).json({ error: "Grupo no encontrado" });

      // Fetch the charge and verify it belongs to this group
      const [charge] = await db
        .select()
        .from(groupChargesTable)
        .where(eq(groupChargesTable.id, chargeId))
        .limit(1);
      if (!charge) return res.status(404).json({ error: "Cargo no encontrado" });
      if (charge.groupId !== groupId) {
        return res.status(403).json({ error: "El cargo no pertenece a este grupo" });
      }

      await storage.deleteGroupCharge(chargeId);

      // If the group charge originated from a reservation transfer, recreate
      // the charge on that reservation so the room folio remains complete.
      // Guard: skip recreation if an active charge with the same reservationId,
      // amount, and description already exists (e.g. the source charge was never
      // deleted during the original transfer), to prevent duplicate entries.
      let recreated = false;
      let alreadyExists = false;
      if (charge.reservationId) {
        const existingCharges = await storage.getCharges(charge.reservationId);
        const duplicate = existingCharges.find(
          (c: any) =>
            c.status !== "anulado" &&
            c.description === charge.description &&
            String(c.amount) === String(charge.amount)
        );
        if (duplicate) {
          alreadyExists = true;
        } else {
          await storage.createCharge({
            reservationId: charge.reservationId,
            description: charge.description,
            amount: charge.amount,
            date: charge.date,
            category: (charge.category as any) || "otros",
            status: "active",
          });
          recreated = true;
        }
      }

      await audit(req, "delete", "groups",
        `Cargo grupal revertido: ${charge.description} ($${charge.amount})${recreated ? ` (cargo restaurado en reserva ${charge.reservationId})` : ""}`,
        { entityType: "group", entityId: groupId }
      );

      res.json({ success: true, reversed: parseFloat(charge.amount), recreated, alreadyExists });
    } catch (error) {
      console.error("[reverse-group-charge] Error:", error);
      res.status(500).json({ error: "Error al revertir el cargo grupal" });
    }
  });

  // ─── MASTER FOLIO ───────────────────────────────────────────────────────────

  // GET master folio data — breakdown for the organizer's folio
  app.get("/api/groups/:groupId/master-folio", requireAuth, async (req, res) => {
    try {
      const group = await storage.getGroup(req.params.groupId);
      if (!group) return res.status(404).json({ error: "Grupo no encontrado" });

      const config = (group as any).masterFolioConfig || "accommodation";
      const gCharges = await storage.getGroupCharges(req.params.groupId);
      const allGroupPayments = await storage.getGroupPayments(req.params.groupId);
      // Only master-folio receipts reduce and appear on this folio. Group
      // payments distributed directly to rooms are a different destination.
      const gPayments = allGroupPayments.filter((payment: any) =>
        payment.destination === "master_folio" || payment.distribution === "master_folio"
      );
      const allParentPaymentIds = new Set(allGroupPayments.map((payment: any) => payment.id));
      const distributedParentAllocations = parentAllocationsByReservation(
        allGroupPayments.filter((payment: any) =>
          payment.destination !== "master_folio" && payment.distribution !== "master_folio"
        ),
      );

      // Same batched, filtered per-reservation facts used by the group folio
      // (/folio) and the group invoice summary (/invoice), so the three views
      // can never disagree about a room's accommodation, extras or payments.
      const ledgerLines = await storage.getGroupReservationLedger(req.params.groupId);
      const billing = await getGroupInvoiceSnapshot(req.params.groupId);

      // Build per-room data
      const rooms: any[] = [];
      let masterAccommodation = 0;
      let masterExtras = 0;
      let masterTransferred = 0;
       let directAllPaid = 0;
       let directAccommodationPaid = 0;

      for (const line of ledgerLines) {
        const accommodation = line.accommodationTotal;
        const activeCharges = line.charges;
        const extras = line.extrasTotal;
        const paid = line.paymentsTotal;
        const directPaid = line.payments
          .filter((p: any) => !p.groupPaymentId || !allParentPaymentIds.has(p.groupPaymentId))
          .reduce((s: number, p: any) => s + parseFloat(p.amount), 0)
          + (distributedParentAllocations.get(line.reservationId) || 0);

        masterAccommodation += accommodation;
        if (config === "all") masterExtras += extras;
         directAllPaid += directPaid;
         // Direct room receipts have an explicit extras-first scope. This
         // keeps a payment for extras from reducing an accommodation-only
         // master folio while still preventing duplicate room collection.
         directAccommodationPaid += Math.min(accommodation, Math.max(0, directPaid - extras));

        const roomSourcePrefix = `reservation:${line.reservationId}:`;
        const roomSources = billing.sources.filter((source) => source.id.startsWith(roomSourcePrefix));
        const roomInvoiced = roomSources.reduce((sum, source) => sum + source.invoiced, 0);
        const roomFiscalAvailable = roomSources.reduce((sum, source) => sum + source.available, 0);
        const financial = buildGroupRoomFinancialSnapshot({
          accommodation,
          extras,
          collected: paid,
          invoiced: roomInvoiced,
          fiscalAvailable: roomFiscalAvailable,
        });

        rooms.push({
          reservationId: line.reservationId,
          guestName: line.guestName,
          roomNumber: line.roomNumber,
          status: line.status,
          nights: line.nights,
          accommodation,
          extras,
          charges: activeCharges.map((c: any) => ({
            id: c.id,
            description: (c.description || "").replace(/\s*\[(xfer|corr|res):[^\]]+\]/g, "").trim(),
            amount: parseFloat(c.amount),
            date: c.date,
            category: c.category,
          })),
          individualPayments: line.payments.map((p: any) => ({
            id: p.id,
            amount: parseFloat(p.amount),
            method: p.method,
            invoiceRef: p.invoiceRef ?? null,
            date: p.date,
            retention: parsePaymentRetention(p.notes),
          })),
          financial,
          // balance that remains on the individual folio
          individualBalance: config === "accommodation"
            ? Math.max(0, extras - directPaid) // master allocations cover accommodation, not room extras
            : config === "all"
              ? 0 // everything covered by master
              : financial.operationalBalance, // nothing covered by master
        });
      }

      // Group charges (events, services) always go to master
      const groupChargesTotal = gCharges.reduce((s: number, c: any) => s + parseFloat(c.amount), 0);

      // Total master folio charges
      const masterTotal = masterAccommodation + masterExtras + groupChargesTotal + masterTransferred;

      const masterParentPaid = gPayments.reduce((sum: number, payment: any) => sum + parseFloat(payment.amount), 0);
      const masterPaid = masterParentPaid + (config === "all" ? directAllPaid : directAccommodationPaid);
      const masterBalance = masterTotal - masterPaid;

      res.json({
        config,
        masterTotal,
        masterAccommodation,
        masterExtras,
        groupChargesTotal,
        masterPaid,
        masterBalance,
        groupCharges: gCharges,
        groupPayments: gPayments,
        rooms,
        billing,
      });
    } catch (error: any) {
      console.error("master-folio error:", error);
      res.status(500).json({ error: "Error al obtener folio maestro" });
    }
  });

  // POST master payment — pays the master folio, distributes to individual rooms
  app.post("/api/groups/:groupId/master-payment", requireAuth, async (req, res) => {
    try {
      assertFinancialSchemaReady();
      const group = await storage.getGroup(req.params.groupId);
      if (!group) return res.status(404).json({ error: "Grupo no encontrado" });

      // Support multi-row payments and keep a single parent movement for the
      // receipt, regardless of how many payment methods the operator uses.
      const {
        paymentRows, amount, method, date, reference, notes, receiptType,
        billingEntityType, billingEntityId, receiverDetails, concepts, invoiceData,
        settlementBreakdown: rawSettlementBreakdown,
        closeReservationIds: rawCloseReservationIds, distributionDetail: rawDistributionDetail,
      } = req.body;
      const rows = validateAndNormalizePaymentRows<{ method: string; amount: string; reference?: string; retention?: { tipo: string; monto: number } }>(
        Array.isArray(paymentRows) && paymentRows.length > 0
          ? paymentRows
          : [{ method: method ?? "cash", amount: amount ?? "0", reference: reference ?? undefined }]
      );

      const totalAmount = paymentRowsGrossTotal(rows);
      if (!rows.length || totalAmount <= 0) return res.status(400).json({ error: "Monto total debe ser positivo" });
      const evidence = validateGroupPaymentEvidence(receiptType, rows, receiverDetails, concepts);
      if (isFiscalGroupReceipt(evidence.receiptType) && !invoiceData?.id) {
        return res.status(409).json({ error: "Confirmá la factura antes de registrar el cobro del Folio Maestro." });
      }
      if (rows.some((row) => row.method === "cuenta_corriente") && (!billingEntityType || !billingEntityId)) {
        return res.status(400).json({ error: "Seleccione la empresa o agencia para el pago por cuenta corriente." });
      }

      const config = (group as any).masterFolioConfig || "accommodation";
      assertMasterFacturaTAllowed(evidence.receiptType, config);
      const paymentDate = date || getArgentinaToday();

      const activeRes = group.reservations.filter(
        (r: any) => r.status === "confirmed" || r.status === "checked_in"
      );
      const activeIds = new Set(activeRes.map((reservation: any) => reservation.id));
      const closeReservationIds = Array.isArray(rawCloseReservationIds)
        ? Array.from(new Set(rawCloseReservationIds.map((id: unknown) => String(id))))
        : [];
      if (closeReservationIds.some((id) => !activeIds.has(id))) {
        return res.status(400).json({ error: "Sólo se pueden cerrar habitaciones activas de este grupo." });
      }
      const allGroupPayments = await storage.getGroupPayments(req.params.groupId);
      const masterPaymentIds = new Set(allGroupPayments
        .filter((payment: any) => payment.destination === "master_folio" || payment.distribution === "master_folio")
        .map((payment: any) => payment.id));
      const allParentPaymentIds = new Set(allGroupPayments.map((payment: any) => payment.id));
      const distributedParentAllocations = parentAllocationsByReservation(
        allGroupPayments.filter((payment: any) => !masterPaymentIds.has(payment.id)),
      );
      const allParentAllocations = parentAllocationsByReservation(allGroupPayments);

      // Use the same filtered room facts as /folio, /invoice and the GET
      // master folio. Besides avoiding N+1 reads, this keeps voided charges
      // and payments out of every preview before recordGroupPayment performs
      // the authoritative validation under the group row lock.
      const ledgerLines = await storage.getGroupReservationLedger(req.params.groupId);
      const selectedBalances = new Map(closeReservationIds.map((reservationId) => {
        const line = ledgerLines.find((item) => item.reservationId === reservationId);
        return [
          reservationId,
          Math.max(0, Number(line
            ? line.accommodationTotal + line.extrasTotal - line.paymentsTotal
            : 0)),
        ];
      }));
      const selectedBalance = Array.from(selectedBalances.values()).reduce((sum, balance) => sum + balance, 0);
      const roomAmounts = new Map<string, number>();
      let masterAccommodation = 0;
      let masterExtras = 0;
      let directAllPaid = 0;
      let directAccommodationPaid = 0;
      for (const line of ledgerLines) {
        const accommodation = line.accommodationTotal;
        masterAccommodation += accommodation;
        const extras = line.extrasTotal;
        let roomAmount = accommodation;
        if (config === "all") {
          masterExtras += extras;
          roomAmount += extras;
        }
        const unparentedPaid = line.payments
          .filter((payment: any) => !payment.groupPaymentId || !allParentPaymentIds.has(payment.groupPaymentId))
          .reduce((sum: number, payment: any) => sum + parseFloat(payment.amount), 0);
        const alreadyApplied = unparentedPaid + (allParentAllocations.get(line.reservationId) || 0);
        const directPaid = unparentedPaid + (distributedParentAllocations.get(line.reservationId) || 0);
        directAllPaid += directPaid;
        directAccommodationPaid += Math.min(accommodation, Math.max(0, directPaid - extras));
        // Use the actual remaining room saldo for a new master distribution.
        roomAmounts.set(line.reservationId, Math.max(0, roomAmount - alreadyApplied));
      }
      const groupChargesTotal = (await storage.getGroupCharges(req.params.groupId))
        .reduce((sum, charge) => sum + parseFloat(charge.amount), 0);
      const masterTotal = masterAccommodation + masterExtras + groupChargesTotal;
      const masterParentPaid = allGroupPayments
        .filter((payment: any) => masterPaymentIds.has(payment.id))
        .reduce((sum: number, payment: any) => sum + parseFloat(payment.amount), 0);
      const masterBalance = masterTotal - masterParentPaid - (config === "all" ? directAllPaid : directAccommodationPaid);
      if (closeReservationIds.length === 0 && totalAmount > masterBalance + 0.009) {
        return res.status(400).json({
          error: `El cobro de $${totalAmount.toFixed(2)} supera el saldo del Folio Maestro de $${Math.max(0, masterBalance).toFixed(2)}.`,
        });
      }
      if (closeReservationIds.length > 0
        && Math.round(totalAmount * 100) !== Math.round(selectedBalance * 100)) {
        return res.status(400).json({
          error: `Para cerrar las habitaciones elegidas, el pago debe coincidir exactamente con su saldo de $${selectedBalance.toFixed(2)}.`,
        });
      }
      let availableAdvances = 0;
      if (isFiscalGroupReceipt(evidence.receiptType)) {
        const invoiceSnapshot = await getGroupInvoiceSnapshot(req.params.groupId);
        const conceptsTotal = evidence.concepts.reduce((sum, concept) => sum + concept.amount, 0);
        const fiscalAvailable = invoiceSnapshot.financial?.fiscalAvailable ?? invoiceSnapshot.totals.available;
        const nonFiscalAdvances = invoiceSnapshot.financial?.nonFiscalAdvances ?? 0;
        availableAdvances = nonFiscalAdvances;
        if (!invoiceData && Math.round(conceptsTotal * 100) > Math.round(fiscalAvailable * 100)) {
          return res.status(400).json({
            error: `La factura de $${conceptsTotal.toFixed(2)} supera el disponible fiscal de $${fiscalAvailable.toFixed(2)}.`,
          });
        }
        const requiredCollection = requiredGroupInvoiceCollection(
          conceptsTotal,
          nonFiscalAdvances,
        );
        const requiredAmount = closeReservationIds.length > 0 ? selectedBalance : requiredCollection;
        if (Math.round(totalAmount * 100) !== Math.round(requiredAmount * 100)
          || (closeReservationIds.length > 0 && totalAmount + 0.009 < requiredCollection)) {
          return res.status(400).json({
            error: closeReservationIds.length > 0
              ? `Para cerrar las habitaciones elegidas, el cobro debe ser $${selectedBalance.toFixed(2)} e incluir al menos $${requiredCollection.toFixed(2)} para la factura.`
              : `El cobro nuevo debe ser $${requiredCollection.toFixed(2)}; la diferencia se cubre con adelantos no fiscalizados.`,
          });
        }
      }

      const confirmedAllocation = closeReservationIds.length > 0
        ? Object.fromEntries(closeReservationIds.map((reservationId) => [
            reservationId,
            Number(rawDistributionDetail?.[reservationId] || 0),
          ]))
        : null;
      const allocationEntries = closeReservationIds.length > 0
        ? []
        : activeRes
            .map((reservation: any) => ({ id: reservation.id, weight: roomAmounts.get(reservation.id) || 0 }))
            .filter((entry) => entry.weight > 0);
      if (closeReservationIds.length === 0 && groupChargesTotal > 0) {
        allocationEntries.push({ id: "__group_charges__", weight: groupChargesTotal });
      }
       // A historical/checked-out balance remains on the parent receipt.
       // Add its capacity even when active rooms exist, otherwise a valid
       // mixed historical/current balance would be forced onto those rooms.
       const activeAllocationCapacity = allocationEntries.reduce((sum, entry) => sum + entry.weight, 0);
       const historicalMasterBalance = Math.max(0, masterBalance - activeAllocationCapacity);
       if (historicalMasterBalance > 0.0001) {
         allocationEntries.push({ id: "__master_balance__", weight: historicalMasterBalance });
       }
       if (allocationEntries.length === 0) allocationEntries.push({ id: "__master_balance__", weight: 1 });
      const allocation = confirmedAllocation
        ?? distributeCents(Math.round(totalAmount * 100), allocationEntries);
      const destination = closeReservationIds.length > 0 ? "group_distribution" : "master_folio";
      const persistedConcepts = normalizeConceptsForGroupPaymentDestination({
        destination,
        concepts: evidence.concepts,
        distributionDetail: allocation,
        ledgerLines,
        groupName: group.name,
      });
      const conceptsTotal = evidence.concepts.reduce((sum, concept) => sum + concept.amount, 0);
      const settlementBreakdown = buildSettlementBreakdown({
        documentTotal: isFiscalGroupReceipt(evidence.receiptType) ? conceptsTotal : totalAmount,
        newCollection: totalAmount,
        availableAdvances: isFiscalGroupReceipt(evidence.receiptType)
          ? confirmedInvoiceAppliedAdvances(invoiceData, availableAdvances)
          : 0,
        supplied: rawSettlementBreakdown,
      });

      const recorded = await storage.recordGroupPayment({
        groupId: req.params.groupId,
        // A directed checkout is launched from the Master Folio UI, but its
        // explicit room allocations are operational room payments. Keeping
        // them out of master_folio prevents an accommodation-only master from
        // rejecting room extras or consuming unrelated group charges.
        destination,
        paymentRows: rows,
        date: paymentDate,
        reference: rows.map((row) => String(row.reference || "").trim()).filter(Boolean).join(" / ")
          || reference || (closeReservationIds.length > 0
            ? `Cierre dirigido desde Folio Maestro — ${group.name}`
            : `Pago Folio Maestro — ${group.name}`),
        distribution: closeReservationIds.length > 0 ? "selected_rooms" : "master_folio",
        distributionDetail: allocation,
        receivedBy: (req.user as any)?.username || null,
        notes: formatGroupPaymentNotes(notes, persistedConcepts),
        cashLabel: closeReservationIds.length > 0
          ? `Cierre dirigido desde Folio Maestro — ${group.name}`
          : `Pago Folio Maestro — ${group.name}`,
        receiptType: evidence.receiptType,
        billingEntityType: billingEntityType || null,
        billingEntityId: billingEntityId || null,
        receiverDetails: evidence.receiver,
        concepts: persistedConcepts,
        invoiceData: isFiscalGroupReceipt(evidence.receiptType) ? invoiceData : null,
        invoiceTotal: isFiscalGroupReceipt(evidence.receiptType)
          ? conceptsTotal
          : null,
        settlementBreakdown,
        closeReservationIds: closeReservationIds.length > 0 ? closeReservationIds : undefined,
      });

      await audit(req, "create", "groups",
        `Pago Folio Maestro: $${totalAmount.toFixed(2)} (${rows.map(r => r.method).join("+")}) — config: ${config}`,
        { entityType: "group", entityId: req.params.groupId }
      );

      res.json({
        success: true,
        groupPayment: recorded.groupPayment,
        groupPaymentId: recorded.groupPayment.id,
        paymentId: recorded.reservationPayments[0]?.id ?? null,
        paymentIds: recorded.reservationPayments.map((payment) => payment.id),
        distributed: recorded.reservationPayments.length,
        checkoutCount: recorded.closedReservations?.processed || 0,
        closedReservationIds: closeReservationIds,
      });
    } catch (error: any) {
      console.error("master-payment error:", error);
      res.status(error?.statusCode || 500).json({ error: error?.message || "Error al registrar pago maestro" });
    }
  });

  // ─── DELETE NON-INVOICED MASTER FOLIO PAYMENT ────────────────────────────────
  app.delete("/api/groups/:groupId/master-payments/:paymentId", requireAuth, async (req, res) => {
    try {
      assertFinancialSchemaReady();
      const { groupId, paymentId } = req.params;
      const gp = await db.transaction(async (tx) => {
        // Serialize reversal with invoice emission/linking. The invoice route
        // uses this same group lock before validating and persisting fiscal
        // source amounts, closing the emit-before-PATCH(invoiceRef) window.
        const groupLock = await tx.execute(sql`
          SELECT id FROM groups WHERE id = ${groupId} FOR UPDATE
        `);
        if (!(groupLock.rows as any[])[0]) {
          throw Object.assign(new Error("Grupo no encontrado"), { statusCode: 404 });
        }
        await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${"group-invoice:" + groupId}))`);
        const [payment] = await tx.select()
          .from(groupPaymentsTable)
          .where(and(eq(groupPaymentsTable.id, paymentId), eq(groupPaymentsTable.groupId, groupId)))
          .limit(1);
        if (!payment) throw Object.assign(new Error("Pago no encontrado o no pertenece a este grupo"), { statusCode: 404 });
        if (payment.invoiceRef) {
          throw Object.assign(new Error("No se puede eliminar un pago con factura electrónica emitida. Emita una Nota de Crédito en su lugar."), { statusCode: 400 });
        }
        const fiscalLink = await tx.execute(sql`
          SELECT si.id
          FROM sales_invoices si
          WHERE (si.group_payment_id = ${paymentId} OR si.id = ${payment.invoiceId ?? null})
            AND si.tipo_comprobante IN ('FA', 'FB', 'FC', 'FT', 'FM')
            AND si.estado IN ('emitida', 'parcial')
          LIMIT 1
        `);
        if ((fiscalLink.rows as any[])[0]) {
          throw Object.assign(new Error("No se puede eliminar un pago con factura electrónica emitida. Emita una Nota de Crédito en su lugar."), { statusCode: 400 });
        }

        // Serialize this reversal with Cuenta Corriente allocations. The
        // allocation path locks the cargo rows before checking their balance;
        // the reversal must acquire those same locks before looking for
        // allocations or deleting the cargos. Whichever transaction gets the
        // lock first therefore leaves the other with a safe, consistent
        // outcome.
        const lockedCargos = await tx.execute(sql`
          SELECT id
          FROM account_movements
          WHERE group_payment_id = ${paymentId}
            AND type = 'cargo'
          ORDER BY id
          FOR UPDATE
        `);
        const cargoIds = (lockedCargos.rows as Array<{ id: string }>).map((cargo) => cargo.id);
        if (cargoIds.length > 0) {
          const [settledCargo] = await tx.select({ id: accountMovementAllocations.id })
            .from(accountMovementAllocations)
            .where(inArray(accountMovementAllocations.cargoId, cargoIds))
            .limit(1);
          if (settledCargo) {
            throw Object.assign(new Error("No se puede eliminar este pago: su cargo de cuenta corriente ya fue aplicado. Emita una reversión contable."), { statusCode: 409 });
          }
          await tx.delete(accountMovementsTable).where(inArray(accountMovementsTable.id, cargoIds));
        }
        await tx.delete(paymentsTable).where(eq((paymentsTable as any).groupPaymentId, paymentId));
        await tx.delete(groupPaymentsTable).where(eq(groupPaymentsTable.id, paymentId));

        // recordGroupPayment() atomically links Caja rows to the parent via
        // payment_id = group_payments.id. Deleting the payment above without
        // also anulando those rows would
        // leave Caja/Reportes showing income that no longer exists — anular
        // them here, in the same transaction, exactly like the manual
        // anulación path in cash-register.tsx marks a movement (never a hard
        // delete, so the audit trail survives).
        const operator = (req.user as any)?.username || "sistema";
        await tx.update(cashMovementsTable)
          .set({
            anulado: true,
            motivoAnulacion: "Pago maestro (Folio Maestro / Pago Grupal) eliminado",
            anuladoPor: operator,
            anuladoAt: new Date(),
          })
          .where(and(eq(cashMovementsTable.paymentId, paymentId), eq(cashMovementsTable.anulado, false)));

        return payment;
      });
      await audit(req, "delete", "groups", `Pago maestro eliminado: $${(gp as any).amount} (${(gp as any).method})`, { entityType: "group", entityId: groupId });
      res.json({ success: true });
    } catch (error: any) {
      console.error("Error deleting master payment:", error?.message || error);
      res.status(error?.statusCode || 500).json({ error: error?.message || "Error al eliminar pago maestro" });
    }
  });

  // ─── UNASSIGN RESERVATION FROM GROUP ────────────────────────────────────────
  app.delete("/api/groups/:groupId/reservations/:reservationId", requireAuth, async (req, res) => {
    try {
      const { groupId, reservationId } = req.params;
      const group = await storage.getGroup(groupId);
      if (!group) return res.status(404).json({ error: "Grupo no encontrado" });

      const reservation = group.reservations.find(r => r.id === reservationId);
      if (!reservation) return res.status(404).json({ error: "Reserva no encontrada en el grupo" });

      if (!["confirmed", "pending", "tentative"].includes(reservation.status)) {
        return res.status(400).json({ error: "Solo se pueden desasignar reservas confirmadas, pendientes o tentativas" });
      }
      await assertGroupStructureCanChange(groupId);

      // Verificar que no tenga cargos extras antes de desasignar
      const chargesCheck = await db.execute(sql`
        SELECT COUNT(*) as cnt FROM folio_movements
        WHERE reservation_id = ${reservationId}
          AND type = 'charge'
          AND source_type NOT IN ('accommodation', 'transfer', 'transfer_reversal')
      `);
      const chargeCount = parseInt(String(chargesCheck.rows[0]?.cnt ?? "0"));
      if (chargeCount > 0) {
        return res.status(400).json({
          error: `Esta reserva tiene ${chargeCount} cargo(s) extra registrado(s). Eliminá o revertí los cargos antes de desasignarla del grupo.`
        });
      }

      await db.transaction(async (tx) => {
        await tx.execute(sql`SELECT id FROM groups WHERE id = ${groupId} FOR UPDATE`);
        const activity = await tx.execute(sql`
          SELECT (
            EXISTS (SELECT 1 FROM group_payments WHERE group_id = ${groupId})
            OR EXISTS (SELECT 1 FROM sales_invoices WHERE group_id = ${groupId})
          ) AS has_financial_activity
        `);
        if ((activity.rows[0] as any)?.has_financial_activity) {
          throw Object.assign(
            new Error("No se puede modificar el bloqueo ni desasignar habitaciones: el grupo ya tiene cobros o comprobantes fiscales registrados."),
            { statusCode: 409 },
          );
        }
        await tx.update(reservationsTable).set({ status: "cancelled" }).where(eq(reservationsTable.id, reservationId));
        if (reservation.roomId) {
          await tx.update(roomsTable).set({ status: "available" }).where(eq(roomsTable.id, reservation.roomId));
        }

        // Auto-adjust group block: decrement quantity so ghost disappears from planning.
        const blocks = await tx.select().from(groupRoomBlocks)
          .where(eq(groupRoomBlocks.groupId, groupId));
        const resRoomTypeId = (reservation as any).room?.roomTypeId ?? (reservation as any).roomTypeId;
        const matchingBlock = blocks.find(b => b.roomTypeId === resRoomTypeId);
        if (matchingBlock) {
          if (matchingBlock.quantity <= 1) {
            await tx.delete(groupRoomBlocks).where(eq(groupRoomBlocks.id, matchingBlock.id));
          } else {
            await tx.update(groupRoomBlocks)
              .set({ quantity: matchingBlock.quantity - 1 })
              .where(eq(groupRoomBlocks.id, matchingBlock.id));
          }
        }
        await tx.delete(groupReservationLinks).where(eq(groupReservationLinks.reservationId, reservationId));
      });

      await audit(req, "delete", "groups",
        `Reserva ${reservation.reservationCode} desasignada del grupo ${group.name}`,
        { entityType: "group", entityId: groupId }
      );

      res.json({ success: true });
    } catch (error: any) {
      console.error("unassign-reservation error:", error);
      res.status(error?.statusCode || 500).json({
        error: error?.message || "Error al desasignar reserva",
      });
    }
  });

  // ─── UPDATE RESERVATION RATE + LATE CHECKOUT (from group view) ──────────────
  app.patch("/api/groups/:groupId/reservations/:reservationId/rate", requireAuth, async (req, res) => {
    try {
      const { groupId, reservationId } = req.params;
      const { finalRatePerNight, lateCheckOut, lateCheckOutTime } = req.body;

      const group = await storage.getGroup(groupId);
      if (!group) return res.status(404).json({ error: "Grupo no encontrado" });

      const reservation = group.reservations.find(r => r.id === reservationId);
      if (!reservation) return res.status(404).json({ error: "Reserva no encontrada en el grupo" });

      const updateData: Record<string, any> = {};

      if (finalRatePerNight !== undefined && finalRatePerNight !== "") {
        const rate = parseFloat(finalRatePerNight);
        if (isNaN(rate) || rate < 0) return res.status(400).json({ error: "Tarifa inválida" });
        const checkIn = new Date(reservation.checkInDate);
        const checkOut = new Date(reservation.checkOutDate);
        const nights = Math.ceil((checkOut.getTime() - checkIn.getTime()) / (1000 * 60 * 60 * 24));
        updateData.finalRatePerNight = rate.toFixed(2);
        updateData.totalRoomAmount = (rate * nights).toFixed(2);
      }

      if (lateCheckOut !== undefined) updateData.lateCheckOut = Boolean(lateCheckOut);
      if (lateCheckOutTime !== undefined) updateData.lateCheckOutTime = lateCheckOutTime || null;

      if (Object.keys(updateData).length === 0) return res.status(400).json({ error: "Sin cambios para aplicar" });

      await storage.updateReservation(reservationId, updateData);

      await audit(req, "update", "reservations",
        `Tarifa/late checkout actualizado desde grupo ${group.name}: $${finalRatePerNight ?? "sin cambio"}`,
        { entityType: "reservation", entityId: reservationId }
      );

      res.json({ success: true });
    } catch (error: any) {
      console.error("update-rate error:", error);
      res.status(500).json({ error: "Error al actualizar tarifa" });
    }
  });

  // ─── MASTER FOLIO PDF ────────────────────────────────────────────────────────
  app.get("/api/groups/:groupId/master-folio/pdf", requireAuth, async (req, res) => {
    try {
      const group = await storage.getGroup(req.params.groupId);
      if (!group) return res.status(404).json({ error: "Grupo no encontrado" });

      const config = (group as any).masterFolioConfig || "accommodation";

      // Resolve billing entity name (company / agency) for display in the PDF
      let billingEntityName = "";
      const beType = (group as any).billingEntityType;
      const beId   = (group as any).billingEntityId;
      if (beType && beId) {
        try {
          if (beType === "company") {
            const ent = await storage.getCompany(beId);
            billingEntityName = (ent as any)?.razonSocial || (ent as any)?.nombreFantasia || "";
          } else if (beType === "agency") {
            const ent = await storage.getAgency(beId);
            billingEntityName = (ent as any)?.razonSocial || (ent as any)?.nombreFantasia || "";
          }
        } catch { /* non-fatal */ }
      }

      const gCharges = await storage.getGroupCharges(req.params.groupId);
      const allGroupPayments = await storage.getGroupPayments(req.params.groupId);
      const gPayments = allGroupPayments.filter((payment: any) =>
        payment.destination === "master_folio" || payment.distribution === "master_folio"
      );
      const allParentPaymentIds = new Set(allGroupPayments.map((payment: any) => payment.id));
      const distributedParentAllocations = parentAllocationsByReservation(
        allGroupPayments.filter((payment: any) =>
          payment.destination !== "master_folio" && payment.distribution !== "master_folio"
        ),
      );

      // Fetch void movements via the group folio helper
      const folioData = await storage.getGroupFolio(req.params.groupId);
      const voidMovements = folioData?.voidMovements ?? [];
      const voidMovementsTotal = folioData?.voidMovementsTotal ?? 0;

      // Same batched, filtered per-reservation facts used by /folio, /master-folio
      // and /invoice, so the printed PDF can never disagree with the on-screen
      // master folio or Resumen del Grupo.
      const ledgerLines = await storage.getGroupReservationLedger(req.params.groupId);

      // Build per-room data
      let masterAccommodation = 0;
      let masterExtras = 0;
      let directAllPaid = 0;
      let directAccommodationPaid = 0;
      const roomRows: any[] = [];

      for (const line of ledgerLines) {
        const accommodation = line.accommodationTotal;
        const extras = line.extrasTotal;
        const paid = line.paymentsTotal;
        const directPaid = line.payments
          .filter((p: any) => !p.groupPaymentId || !allParentPaymentIds.has(p.groupPaymentId))
          .reduce((s: number, p: any) => s + parseFloat(p.amount), 0)
          + (distributedParentAllocations.get(line.reservationId) || 0);

        masterAccommodation += accommodation;
        if (config === "all") masterExtras += extras;
        directAllPaid += directPaid;
        directAccommodationPaid += Math.min(accommodation, Math.max(0, directPaid - extras));

        const individualPayments = line.payments.map((p: any) => ({
          amount: parseFloat(p.amount),
          method: p.method || "",
          reference: p.reference || null,
          invoiceRef: (p as any).invoiceRef ?? null,
          date: p.date || null,
          status: (p as any).status || null,
          retention: parsePaymentRetention((p as any).notes),
        }));
        roomRows.push({
          guestName: line.guestName || "Sin asignar",
          roomNumber: line.roomNumber,
          nights: line.nights,
          accommodation,
          extras,
          paid,
          individualPayments,
          activeCharges: line.charges,
        });
      }

      const groupChargesTotal = gCharges.reduce((s: number, c: any) => s + parseFloat(c.amount), 0);
      const masterTotal = masterAccommodation + masterExtras + groupChargesTotal;
      // Same formula as the on-screen master folio: master-destined group
      // payments plus each room's direct payment (extras-first offset when
      // the config only covers accommodation).
      const masterParentPaid = gPayments.reduce((sum: number, payment: any) => sum + parseFloat(payment.amount), 0);
      const masterPaid = masterParentPaid + (config === "all" ? directAllPaid : directAccommodationPaid);
      const masterBalance = masterTotal - masterPaid;
      const roomRetentionsTotal = roomRows.reduce((sum: number, row: any) =>
        sum + row.individualPayments.reduce((s: number, p: any) => s + (p.retention?.monto || 0), 0), 0);
      // Retención withheld on the Folio Maestro / group-charges portion of a
      // parent group payment (no room to carry it on payments.notes).
      const organizerRetentionsTotal = gPayments.reduce((sum: number, gp: any) =>
        sum + parseGroupPaymentRetentions(gp.retentionDetail).reduce((s: number, r) => s + r.monto, 0), 0);
      const masterRetentionsTotal = roomRetentionsTotal + organizerRetentionsTotal;

      // Generate PDF
      const doc = new PDFDocument({ margin: 40, size: "A4" });
      const chunks: Buffer[] = [];
      doc.on("data", (chunk: Buffer) => chunks.push(chunk));
      doc.on("end", () => {
        const pdfBuffer = Buffer.concat(chunks);
        res.setHeader("Content-Type", "application/pdf");
        res.setHeader("Content-Disposition", `attachment; filename="folio-maestro-${group.groupCode}.pdf"`);
        res.send(pdfBuffer);
      });

      const HOTEL = "Maran Suites & Towers";
      const ADDR = "Alameda de la Federación 698, Paraná, Entre Ríos";
      const pageW = 595 - 80;

      // Header
      doc.fontSize(18).font("Helvetica-Bold").text(HOTEL, 40, 40);
      doc.fontSize(9).font("Helvetica").fillColor("#666666").text(ADDR, 40, 62);
      doc.fillColor("#000000");

      doc.moveTo(40, 80).lineTo(555, 80).lineWidth(1.5).stroke("#1a1a1a");

      doc.fontSize(14).font("Helvetica-Bold").text("DETALLE DE CUENTA", 40, 90);
      doc.fontSize(9).font("Helvetica").fillColor("#555555");
      const coverageLabel = config === "accommodation" ? "Cubre: Solo Alojamiento" : config === "all" ? "Cubre: Alojamiento + Extras" : "Sin cobertura grupal";
      const configLabel = billingEntityName ? `${coverageLabel} | Factura: ${billingEntityName}` : coverageLabel;
      doc.text(configLabel, 40, 108);
      doc.fillColor("#000000");

      // Group info
      let y = 130;
      doc.fontSize(10).font("Helvetica-Bold").text("Grupo:", 40, y);
      doc.font("Helvetica").text(group.name, 110, y);
      y += 16;
      doc.font("Helvetica-Bold").text("Código:", 40, y);
      doc.font("Helvetica").text(group.groupCode, 110, y);
      y += 16;
      const fmtAR = (d: string) => d ? d.split("-").reverse().join("/") : "";
      doc.font("Helvetica-Bold").text("Check-in:", 40, y);
      doc.font("Helvetica").text(fmtAR(group.checkInDate), 110, y);
      doc.font("Helvetica-Bold").text("Check-out:", 250, y);
      doc.font("Helvetica").text(fmtAR(group.checkOutDate), 330, y);
      y += 16;
      if (group.contactName) {
        doc.font("Helvetica-Bold").text("Contacto:", 40, y);
        doc.font("Helvetica").text(group.contactName, 110, y);
        y += 16;
      }

      y += 8;
      doc.moveTo(40, y).lineTo(555, y).lineWidth(0.5).stroke("#cccccc");
      y += 12;

      // Room breakdown table header
      const extrasColLabel = config === "none" ? "EXTRAS (directo)" : "EXTRAS";
      doc.fontSize(8).font("Helvetica-Bold").fillColor("#555555")
        .text("HAB.", 40, y)
        .text("HUÉSPED", 80, y)
        .text("NOCHES", 280, y, { align: "right", width: 60 })
        .text("ALOJAMIENTO", 350, y, { align: "right", width: 80 })
        .text(extrasColLabel, 440, y, { align: "right", width: 60 })
        .text("PAGADO", 505, y, { align: "right", width: 50 });
      y += 4;
      doc.moveTo(40, y).lineTo(555, y).lineWidth(0.5).stroke("#cccccc");
      y += 8;
      doc.fillColor("#000000");

      for (const row of roomRows) {
        const guest = row.guestName || "Sin asignar";

        if (y > 740) {
          doc.addPage();
          y = 40;
        }

        doc.fontSize(9).font("Helvetica")
          .text(row.roomNumber || "-", 40, y)
          .text(guest.substring(0, 26), 80, y)
          .text(String(row.nights), 280, y, { align: "right", width: 60 })
          .text(`$${row.accommodation.toLocaleString("es-AR")}`, 350, y, { align: "right", width: 80 })
          .text(row.extras > 0 ? `$${row.extras.toLocaleString("es-AR")}` : "-", 440, y, { align: "right", width: 60 })
          .text(`$${row.paid.toLocaleString("es-AR")}`, 505, y, { align: "right", width: 50 });
        y += 14;

        // Per-charge sub-rows (with ND amber styling) — always shown regardless of masterFolioConfig
        if (row.activeCharges && row.activeCharges.length > 0) {
          for (const c of row.activeCharges) {
            if (y > 740) { doc.addPage(); y = 40; }
            const cleanDesc = (c.description || "").replace(/\s*\[(xfer|corr|res):[^\]]+\]/g, "").trim();
            const isND = c.category === "nota_debito";
            if (isND) {
              doc.rect(80, y - 1, 475, 13).fillColor("#fef3e2").fill()
                .rect(80, y - 1, 475, 13).strokeColor("#f59e0b").lineWidth(0.5).stroke();
              doc.fontSize(8).font("Helvetica-Bold").fillColor("#92400e")
                .text(`  • ${cleanDesc.substring(0, 40)}`, 90, y, { width: 340 })
                .text(`$${parseFloat(c.amount).toLocaleString("es-AR")}`, 440, y, { align: "right", width: 60 });
              doc.font("Helvetica").fillColor("#000000");
            } else {
              doc.fontSize(8).font("Helvetica").fillColor("#555555")
                .text(`  • ${cleanDesc.substring(0, 40)}`, 90, y, { width: 340 })
                .text(`$${parseFloat(c.amount).toLocaleString("es-AR")}`, 440, y, { align: "right", width: 60 });
              doc.fillColor("#000000");
            }
            y += 12;
          }
          y += 2;
        }

        // Per-payment sub-rows with invoice badge
        if (row.individualPayments && row.individualPayments.length > 0) {
          for (const pmt of row.individualPayments) {
            if (y > 740) { doc.addPage(); y = 40; }
            const methodLabel = pmt.method
              ? pmt.method.charAt(0).toUpperCase() + pmt.method.slice(1).replace(/_/g, " ")
              : "";
            let pmtLabel = methodLabel;
            if (pmt.reference) pmtLabel += ` (${pmt.reference})`;
            doc.fontSize(7.5).font("Helvetica").fillColor("#555555")
              .text("", 80, y) // indent
              .text(`  • ${pmtLabel}`, 90, y, { width: 300 });
            if (pmt.invoiceRef) {
              // Parse JSON invoiceRef and format as human-readable fiscal badge
              let badgeText: string | null = null;
              try {
                const ref = typeof pmt.invoiceRef === "string" ? JSON.parse(pmt.invoiceRef) : pmt.invoiceRef;
                const tipo = ref.tipo_comprobante ?? ref.tipoComprobante ?? "FAC";
                const pv = String(ref.punto_venta ?? ref.puntoVenta ?? 0).padStart(4, "0");
                const num = String(ref.numero ?? 0).padStart(8, "0");
                badgeText = `${tipo} ${pv}-${num}`;
              } catch {
                // unparseable — skip badge
              }
              if (badgeText) {
                const badgeX = 395;
                doc.fontSize(7);
                const badgeW = Math.min(doc.widthOfString(badgeText) + 10, 150);
                doc.save()
                  .roundedRect(badgeX, y - 1, badgeW, 11, 3)
                  .fillAndStroke("#e8f4fd", "#3b82f6")
                  .restore();
                doc.fontSize(7).font("Helvetica-Bold").fillColor("#1d4ed8")
                  .text(badgeText, badgeX + 5, y + 1, { width: badgeW - 10 });
                doc.fillColor("#555555");
              }
            }
            doc.fontSize(7.5).font("Helvetica").fillColor("#555555")
              .text(`$${pmt.amount.toLocaleString("es-AR")}`, 505, y, { align: "right", width: 50 });
            doc.fillColor("#000000");
            y += 12;

            // Retención (IIBB/Ganancias) withheld by the payer on this payment
            if (pmt.retention && pmt.retention.monto > 0) {
              if (y > 740) { doc.addPage(); y = 40; }
              const retLabel = pmt.retention.tipo === "iibb" ? "Ret. IIBB" : pmt.retention.tipo === "ganancias" ? "Ret. Ganancias" : `Ret. ${pmt.retention.tipo}`;
              doc.fontSize(7.2).font("Helvetica-Oblique").fillColor("#b45309")
                .text(`    ↳ ${retLabel}`, 90, y, { width: 300 })
                .text(`$${pmt.retention.monto.toLocaleString("es-AR")}`, 505, y, { align: "right", width: 50 });
              doc.fillColor("#000000");
              y += 11;
            }
          }
          y += 2;
        } else {
          y += 2;
        }
      }

      y += 4;
      doc.moveTo(40, y).lineTo(555, y).lineWidth(0.5).stroke("#cccccc");
      y += 8;

      // Coverage legend note below room table
      {
        let legendText: string;
        const entityRef = billingEntityName ? billingEntityName : "el organizador";
        if (config === "none") {
          legendText = `(*) Columna EXTRAS (directo): cargos facturados al huésped, no cubiertos por ${entityRef}.`;
        } else if (config === "accommodation") {
          legendText = `(*) Columna EXTRAS: cargos adicionales facturados directamente al huésped. Solo el alojamiento está cubierto por ${entityRef}.`;
        } else {
          // "all"
          legendText = `(*) Columna EXTRAS: alojamiento y extras cubiertos por ${entityRef}. Sin cargos directos al huésped por estas columnas.`;
        }
        if (y > 740) { doc.addPage(); y = 40; }
        doc.fontSize(7.5).font("Helvetica").fillColor("#666666").text(legendText, 40, y, { width: 515 });
        y += 14;
        doc.fillColor("#000000");
      }

      y += 4;

      // Group charges
      if (gCharges.length > 0) {
        doc.fontSize(9).font("Helvetica-Bold").text("Cargos grupales:", 40, y);
        y += 14;
        for (const c of gCharges) {
          if (y > 740) { doc.addPage(); y = 40; }
          const cleanDesc = (c.description || "").replace(/\s*\[(xfer|corr|res):[^\]]+\]/g, "").trim();
          const isND = (c as any).category === "nota_debito";
          if (isND) {
            doc.rect(40, y - 1, 515, 14).fillColor("#fef3e2").fill()
              .rect(40, y - 1, 515, 14).strokeColor("#f59e0b").lineWidth(0.5).stroke();
            doc.fontSize(9).font("Helvetica-Bold").fillColor("#92400e")
              .text(cleanDesc, 50, y)
              .text(`$${parseFloat(c.amount).toLocaleString("es-AR")}`, 455, y, { align: "right", width: 100 });
            doc.font("Helvetica").fillColor("#000000");
          } else {
            doc.fontSize(9).font("Helvetica").fillColor("#000000")
              .text(cleanDesc, 50, y)
              .text(`$${parseFloat(c.amount).toLocaleString("es-AR")}`, 455, y, { align: "right", width: 100 });
          }
          y += 14;
        }
        y += 4;
        doc.moveTo(40, y).lineTo(555, y).lineWidth(0.5).stroke("#cccccc");
        y += 12;
      }

      // Totals
      const totals = [
        ["Total alojamiento", `$${masterAccommodation.toLocaleString("es-AR")}`],
        ...(config === "all" ? [["Extras (habitaciones)", `$${masterExtras.toLocaleString("es-AR")}`]] : []),
        ...(groupChargesTotal > 0 ? [["Cargos grupales", `$${groupChargesTotal.toLocaleString("es-AR")}`]] : []),
        ["TOTAL DETALLE DE CUENTA", `$${masterTotal.toLocaleString("es-AR")}`],
        ["Pagado", `$${masterPaid.toLocaleString("es-AR")}`],
        ...(masterRetentionsTotal > 0 ? [["Retenciones (IIBB/Ganancias)", `$${masterRetentionsTotal.toLocaleString("es-AR")}`]] : []),
        ...(voidMovementsTotal > 0 ? [["Anulaciones (NC)", `$${voidMovementsTotal.toLocaleString("es-AR")}`]] : []),
        ["SALDO PENDIENTE", `$${masterBalance.toLocaleString("es-AR")}`],
      ];

      for (const [label, value] of totals) {
        if (y > 740) { doc.addPage(); y = 40; }
        const isBold = label.startsWith("TOTAL") || label.startsWith("SALDO");
        doc.fontSize(10).font(isBold ? "Helvetica-Bold" : "Helvetica")
          .text(label, 300, y)
          .text(value, 455, y, { align: "right", width: 100 });
        y += 16;
      }

      // Group payments
      if (gPayments.length > 0) {
        y += 8;
        doc.fontSize(9).font("Helvetica-Bold").text("Pagos registrados:", 40, y);
        y += 14;
        for (const p of gPayments) {
          if (y > 740) { doc.addPage(); y = 40; }
          const settlement = (p as any).settlementBreakdown && typeof (p as any).settlementBreakdown === "object"
            ? (p as any).settlementBreakdown
            : {
                documentTotal: Number(p.amount) || 0,
                appliedAdvances: 0,
                newCollection: Number(p.amount) || 0,
              };
          const settlementUnavailable = (p as any).settlementBreakdownStatus === "not_reconstructible";
          doc.fontSize(9).font("Helvetica-Bold")
            .text(`${fmtAR(p.date)}${p.reference ? ` — ${p.reference}` : ""}`, 50, y)
            .text(`$${Number(settlement.newCollection || 0).toLocaleString("es-AR")}`, 455, y, { align: "right", width: 100 });
          y += 14;
          doc.fontSize(7.5).font(settlementUnavailable ? "Helvetica-Bold" : "Helvetica")
            .fillColor(settlementUnavailable ? "#92400e" : "#555555")
            .text(
              settlementUnavailable
                ? `Desglose histórico no reconstruible · Cobro registrado: $${Number(p.amount || 0).toLocaleString("es-AR")}`
                : `Comprobante: $${Number(settlement.documentTotal || 0).toLocaleString("es-AR")}  ·  `
                  + `Anticipos aplicados: $${Number(settlement.appliedAdvances || 0).toLocaleString("es-AR")}  ·  `
                  + `Cobro nuevo: $${Number(settlement.newCollection || 0).toLocaleString("es-AR")}`
                  + ((p as any).settlementBreakdownStatus === "reconstructed_from_fiscal_intent"
                    ? "  ·  Reconstruido desde intención fiscal"
                    : ""),
              60,
              y,
              { width: 495 },
            );
          doc.fillColor("#000000");
          y += 12;
          const methodRows = Array.isArray((p as any).paymentMethodDetail) && (p as any).paymentMethodDetail.length > 0
            ? (p as any).paymentMethodDetail
            : [{ method: p.method, amount: p.amount, reference: p.reference }];
          for (const methodRow of methodRows) {
            if (y > 740) { doc.addPage(); y = 40; }
            const methodLabel = groupPaymentMethodLabel(methodRow.method);
            doc.fontSize(7.5).font("Helvetica").fillColor("#555555")
              .text(`    • ${methodLabel}${methodRow.reference ? ` (${methodRow.reference})` : ""}`, 60, y, { width: 365 })
              .text(`$${Number(methodRow.amount || 0).toLocaleString("es-AR")}`, 455, y, { align: "right", width: 100 });
            doc.fillColor("#000000");
            y += 11;
          }
          for (const ret of parseGroupPaymentRetentions((p as any).retentionDetail)) {
            if (y > 740) { doc.addPage(); y = 40; }
            const retLabel = ret.tipo === "iibb" ? "Ret. IIBB" : ret.tipo === "ganancias" ? "Ret. Ganancias" : `Ret. ${ret.tipo}`;
            doc.fontSize(7.2).font("Helvetica-Oblique").fillColor("#b45309")
              .text(`    ↳ ${retLabel}`, 60, y, { width: 300 })
              .text(`$${ret.monto.toLocaleString("es-AR")}`, 455, y, { align: "right", width: 100 });
            doc.fillColor("#000000");
            y += 11;
          }
        }
      }

      // Anulaciones (NC void movements)
      if (voidMovements.length > 0) {
        y += 8;
        doc.moveTo(40, y).lineTo(555, y).lineWidth(0.5).stroke("#cccccc");
        y += 12;
        doc.fontSize(9).font("Helvetica-Bold").fillColor("#b91c1c").text("Anulaciones:", 40, y);
        doc.fillColor("#000000");
        y += 14;
        // Column headers
        doc.fontSize(8).font("Helvetica-Bold").fillColor("#555555")
          .text("HAB.", 50, y)
          .text("DESCRIPCIÓN", 90, y)
          .text("IMPORTE", 455, y, { align: "right", width: 100 });
        doc.fillColor("#000000");
        y += 4;
        doc.moveTo(50, y).lineTo(555, y).lineWidth(0.3).stroke("#dddddd");
        y += 8;
        for (const vm of voidMovements) {
          if (y > 740) { doc.addPage(); y = 40; }
          const desc = vm.description || (vm.voidReason ? `Anulación: ${vm.voidReason}` : "Anulación NC");
          doc.fontSize(9).font("Helvetica")
            .text(vm.roomNumber || "-", 50, y)
            .text(desc.substring(0, 55), 90, y)
            .text(`$${parseFloat(vm.amount).toLocaleString("es-AR")}`, 455, y, { align: "right", width: 100 });
          y += 14;
        }
        // Subtotal line
        y += 2;
        doc.moveTo(300, y).lineTo(555, y).lineWidth(0.3).stroke("#dddddd");
        y += 6;
        doc.fontSize(9).font("Helvetica-Bold").fillColor("#b91c1c")
          .text("Total anulaciones", 300, y)
          .text(`$${voidMovementsTotal.toLocaleString("es-AR")}`, 455, y, { align: "right", width: 100 });
        doc.fillColor("#000000");
        y += 4;
      }

      // Footer
      y += 20;
      doc.moveTo(40, y).lineTo(555, y).lineWidth(0.5).stroke("#cccccc");
      doc.fontSize(8).font("Helvetica").fillColor("#888888")
        .text(`Generado el ${new Date().toLocaleString("es-AR")} | ${HOTEL}`, 40, y + 8, { align: "center", width: pageW });

      doc.end();
    } catch (error: any) {
      console.error("master-folio PDF error:", error);
      res.status(500).json({ error: "Error al generar PDF del folio maestro" });
    }
  });
}
