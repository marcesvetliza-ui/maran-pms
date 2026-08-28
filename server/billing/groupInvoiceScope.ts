import { db } from "../db";
import { sql } from "drizzle-orm";

export type GroupInvoiceSource = {
  id: string;
  concept: string;
  destination: string;
  eligible: number;
  invoiced: number;
  available: number;
};

export type GroupInvoiceSnapshot = {
  sources: GroupInvoiceSource[];
  totals: {
    eligible: number;
    invoiced: number;
    available: number;
  };
  paymentDestinations: Array<{
    id: string;
    concept: string;
    destination: string;
    eligible: number;
    invoiced: number;
    available: number;
    invoiceId: number | null;
  }>;
};

const cents = (value: unknown) => Math.round((Number(value) || 0) * 100);
const money = (value: number) => value / 100;

export function assertGroupPaymentInvoiceScope(invoice: any, payment: any, groupId: string): void {
  if (invoice?.groupId !== groupId || invoice?.groupPaymentId !== payment?.id) {
    throw Object.assign(
      new Error("El comprobante no fue emitido para este grupo y cobro. No puede vincularse manualmente."),
      { statusCode: 409 },
    );
  }
}

// Factura T ("solo alojamiento") is only fiscally valid when the master folio is
// configured to cover accommodation exclusively — a config="all" master folio also
// covers extras/cargos grupales, which Factura T cannot legally document.
export function assertMasterFacturaTAllowed(receiptType: string | undefined | null, masterFolioConfig: string | undefined | null): void {
  if (receiptType === "factura_t" && masterFolioConfig !== "accommodation") {
    throw Object.assign(
      new Error("Factura T solo está disponible cuando el Folio Maestro cubre exclusivamente alojamiento."),
      { statusCode: 400 },
    );
  }
}

function parseJson(value: unknown): any {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

/**
 * Returns the still-active value of every source consumed by a group invoice.
 * Credit notes restore their exact source allocation, rather than restoring a
 * proportional approximation of the invoice total.
 */
export function parseGroupInvoiceSourceAmounts(invoice: any): Record<string, number> {
  const total = Number(invoice.monto_total ?? invoice.montoTotal ?? 0) || 0;
  const credited = Number(invoice.monto_acreditado ?? invoice.montoAcreditado ?? 0) || 0;
  const explicit = parseJson(invoice.source_charge_amounts ?? invoice.sourceChargeAmounts);
  const creditMaps = parseJson(invoice.credit_source_charge_amounts);
  // Historical/group NCs may not carry a per-source map. In that case the
  // original invoice's accrued credit is the only reliable restoration signal.
  const hasExplicitCredits = Array.isArray(creditMaps) && creditMaps.length > 0;
  const result: Record<string, number> = {};

  if (!explicit || typeof explicit !== "object" || Array.isArray(explicit)) return result;
  for (const [id, rawAmount] of Object.entries(explicit)) {
    const amount = cents(rawAmount);
    if (amount <= 0) continue;
    const credit = hasExplicitCredits
      // jsonb_agg() collects each NC's raw column value; older rows may have
      // been stored double-JSON-encoded (a jsonb scalar string instead of an
      // object), so each entry needs its own parseJson pass before indexing.
      ? creditMaps.reduce((sum: number, rawMap: any) => sum + cents(parseJson(rawMap)?.[id]), 0)
      : Math.round(amount * (total > 0 ? credited / total : 0));
    const active = Math.max(0, amount - credit);
    if (active > 0) result[String(id)] = money(active);
  }
  return result;
}

export async function getGroupInvoiceSnapshot(groupId: string): Promise<GroupInvoiceSnapshot> {
  const [reservationRows, groupChargeRows, invoiceRows, paymentRows] = await Promise.all([
    db.execute(sql`
      SELECT r.id, r.reservation_code, r.total_room_amount, rm.room_number
      FROM reservations r
      JOIN group_reservation_links l ON l.reservation_id = r.id
      LEFT JOIN rooms rm ON rm.id = r.room_id
      WHERE l.group_id = ${groupId}
        AND r.status <> 'cancelled'
      ORDER BY rm.room_number NULLS LAST, r.id
    `),
    db.execute(sql`
      SELECT id, description, amount
      FROM group_charges
      WHERE group_id = ${groupId}
      ORDER BY created_at, id
    `),
    db.execute(sql`
      SELECT si.source_charge_amounts, si.monto_total, si.monto_acreditado,
             COALESCE((
               SELECT jsonb_agg(nc.source_charge_amounts)
               FROM sales_invoices nc
               WHERE nc.nota_credito_id = si.id
                 AND nc.tipo_comprobante IN ('NCA', 'NCB', 'NCC', 'NCT', 'NCM')
             ), '[]'::jsonb) AS credit_source_charge_amounts
      FROM sales_invoices si
      WHERE si.group_id = ${groupId}
        AND si.tipo_comprobante IN ('FA', 'FB', 'FC', 'FT', 'FM')
        AND si.estado IN ('emitida', 'parcial')
    `),
    db.execute(sql`
      SELECT gp.id, gp.amount, gp.destination, gp.invoice_id,
             si.id AS claimed_invoice_id,
             si.monto_total,
             si.monto_acreditado
      FROM group_payments gp
      LEFT JOIN LATERAL (
        SELECT candidate.*
        FROM sales_invoices candidate
        WHERE (candidate.group_payment_id = gp.id OR candidate.id = gp.invoice_id)
          AND candidate.tipo_comprobante IN ('FA', 'FB', 'FC', 'FT', 'FM')
        ORDER BY CASE WHEN COALESCE(candidate.monto_total, 0)::numeric > COALESCE(candidate.monto_acreditado, 0)::numeric THEN 0 ELSE 1 END,
                 candidate.id DESC
        LIMIT 1
      ) si ON true
      WHERE gp.group_id = ${groupId}
      ORDER BY gp.created_at, gp.id
    `),
  ]);

  const sourceCents = new Map<string, Omit<GroupInvoiceSource, "eligible" | "invoiced" | "available"> & { eligibleCents: number }>();
  const addSource = (id: string, concept: string, destination: string, amount: unknown) => {
    const amountCents = cents(amount);
    if (amountCents <= 0) return;
    sourceCents.set(id, { id, concept, destination, eligibleCents: amountCents });
  };

  for (const reservation of reservationRows.rows as any[]) {
    const room = reservation.room_number ? `Habitación ${reservation.room_number}` : `Reserva ${reservation.reservation_code || reservation.id}`;
    addSource(`reservation:${reservation.id}:accommodation`, "Alojamiento", room, reservation.total_room_amount);
  }

  const chargeRows = await db.execute(sql`
    SELECT c.id, c.reservation_id, c.description, c.amount, r.reservation_code, rm.room_number
    FROM charges c
    JOIN group_reservation_links l ON l.reservation_id = c.reservation_id
    JOIN reservations r ON r.id = c.reservation_id
    LEFT JOIN rooms rm ON rm.id = r.room_id
    WHERE l.group_id = ${groupId}
      AND r.status <> 'cancelled'
      AND c.status <> 'anulado'
      AND c.category NOT IN ('transfer_in', 'transfer_out', 'adjustment')
    ORDER BY c.date, c.id
  `);
  for (const charge of chargeRows.rows as any[]) {
    const room = charge.room_number ? `Habitación ${charge.room_number}` : `Reserva ${charge.reservation_code || charge.reservation_id}`;
    addSource(`reservation:${charge.reservation_id}:charge:${charge.id}`, charge.description || "Consumo", room, charge.amount);
  }
  for (const charge of groupChargeRows.rows as any[]) {
    addSource(`group-charge:${charge.id}`, charge.description || "Cargo grupal", "Grupo", charge.amount);
  }

  const invoicedBySource = new Map<string, number>();
  for (const invoice of invoiceRows.rows as any[]) {
    for (const [sourceId, amount] of Object.entries(parseGroupInvoiceSourceAmounts(invoice))) {
      invoicedBySource.set(sourceId, (invoicedBySource.get(sourceId) || 0) + cents(amount));
    }
  }

  const sources = [...sourceCents.values()]
    .map((source) => {
      const invoiced = Math.min(source.eligibleCents, invoicedBySource.get(source.id) || 0);
      return {
        id: source.id,
        concept: source.concept,
        destination: source.destination,
        eligible: money(source.eligibleCents),
        invoiced: money(invoiced),
        available: money(Math.max(0, source.eligibleCents - invoiced)),
      };
    })
    .sort((a, b) => a.id.localeCompare(b.id));

  const paymentDestinations = (paymentRows.rows as any[]).map((payment) => {
    const eligible = cents(payment.amount);
    const activeInvoice = payment.claimed_invoice_id
      ? Math.max(0, cents(payment.monto_total) - cents(payment.monto_acreditado))
      : payment.invoice_id
        ? eligible
        : 0;
    return {
      id: String(payment.id),
      concept: "Cobro grupal",
      destination: payment.destination === "master_folio" ? "Folio Maestro" : "Distribución a habitaciones",
      eligible: money(eligible),
      invoiced: money(Math.min(eligible, activeInvoice)),
      available: money(Math.max(0, eligible - activeInvoice)),
      invoiceId: payment.claimed_invoice_id ? Number(payment.claimed_invoice_id) : payment.invoice_id ? Number(payment.invoice_id) : null,
    };
  });

  const totalsCents = sources.reduce((totals, source) => ({
    eligible: totals.eligible + cents(source.eligible),
    invoiced: totals.invoiced + cents(source.invoiced),
    available: totals.available + cents(source.available),
  }), { eligible: 0, invoiced: 0, available: 0 });

  return {
    sources,
    totals: {
      eligible: money(totalsCents.eligible),
      invoiced: money(totalsCents.invoiced),
      available: money(totalsCents.available),
    },
    paymentDestinations,
  };
}

export async function assertGroupInvoiceAllocation(
  groupId: string,
  sourceAmounts: Record<string, number>,
  invoiceTotal: number,
): Promise<void> {
  const requested = Object.entries(sourceAmounts)
    .filter(([id, amount]) => id && cents(amount) > 0)
    .map(([id, amount]) => [id, cents(amount)] as const);
  if (!requested.length) {
    throw Object.assign(new Error("La factura grupal debe indicar el importe de cada concepto facturado."), { status: 400 });
  }
  const requestedTotal = requested.reduce((sum, [, amount]) => sum + amount, 0);
  if (requestedTotal !== cents(invoiceTotal)) {
    throw Object.assign(new Error("Los importes por concepto no coinciden exactamente con el total del comprobante."), { status: 400 });
  }

  const snapshot = await getGroupInvoiceSnapshot(groupId);
  const available = new Map(snapshot.sources.map((source) => [source.id, cents(source.available)]));
  for (const [sourceId, amount] of requested) {
    const remaining = available.get(sourceId);
    if (remaining === undefined) {
      throw Object.assign(new Error(`El concepto seleccionado (${sourceId}) no existe o no es facturable para este grupo.`), { status: 400 });
    }
    if (amount > remaining) {
      throw Object.assign(
        new Error(`El concepto seleccionado ya no tiene saldo suficiente para facturar ($${money(Math.max(0, remaining)).toFixed(2)} disponible).`),
        { status: 409 },
      );
    }
  }
}

export async function assertGroupPaymentInvoiceEligibility(
  groupId: string,
  groupPaymentId: string,
  invoiceTotal: number,
): Promise<void> {
  const result = await db.execute(sql`
    SELECT gp.amount, gp.invoice_id,
           EXISTS (
             SELECT 1 FROM sales_invoices active_invoice
             WHERE (active_invoice.group_payment_id = gp.id OR active_invoice.id = gp.invoice_id)
               AND active_invoice.tipo_comprobante IN ('FA', 'FB', 'FC', 'FT', 'FM')
               AND active_invoice.estado IN ('emitida', 'parcial')
               AND COALESCE(active_invoice.monto_total, 0)::numeric > COALESCE(active_invoice.monto_acreditado, 0)::numeric + 0.009
           ) AS has_active_claim
    FROM group_payments gp
    WHERE gp.id = ${groupPaymentId}
      AND gp.group_id = ${groupId}
    LIMIT 1
  `);
  const payment = result.rows[0] as any;
  if (!payment) {
    throw Object.assign(new Error("El cobro grupal no existe o no pertenece al grupo."), { status: 404 });
  }
  if (payment.has_active_claim) {
    throw Object.assign(new Error("Este cobro grupal ya tiene una factura vinculada."), { status: 409 });
  }
  if (Number.isNaN(invoiceTotal)) {
    throw Object.assign(new Error("El importe fiscal informado no es válido."), { status: 400 });
  }
}