import { sql } from "drizzle-orm";
import {
  db,
  withDatabaseTransaction,
  withReadOnlyDatabaseTransaction,
} from "./db";
import { activeSalesRecord } from "./salesArchive";
import { getCcManualTrackingRows } from "./ccManualTracking";
import type {
  CcInvoiceTrackingFilters,
  CcInvoiceTrackingRow,
} from "./ccInvoiceTracking";

const normalizeSearch = (value: string) =>
  value
    .toLocaleLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
const stamp = (v: unknown) =>
  v instanceof Date ? v.toISOString() : String(v || "");
const money = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const text = (...values: unknown[]) =>
  values
    .find((v) => typeof v === "string" && v.trim())
    ?.toString()
    .trim() || "";
function invoiceRefId(value: unknown): number | null {
  try {
    const parsed = typeof value === "string" ? JSON.parse(value) : value;
    const id = Number((parsed as any)?.id);
    return Number.isSafeInteger(id) && id > 0 ? id : null;
  } catch {
    return null;
  }
}

/** A read projection: charge identities and explicit fiscal links only. Never
 * match debt by guest, amount, or another invoice sharing the reservation. */
export async function getCcDebtTrackingList(
  filters: CcInvoiceTrackingFilters = {},
): Promise<CcInvoiceTrackingRow[]> {
  return withReadOnlyDatabaseTransaction(async () => {
    // Resolve ownership before applying owner filters. A fiscal recipient may
    // differ from the entity whose ledger actually owns the linked charge.
    const scope = sql`m.entity_type IN ('company','agency')`;
    const movements = (
      await db.execute(sql`SELECT m.*, p.invoice_ref AS payment_invoice_ref,
        gp.invoice_id AS group_invoice_id, gp.invoice_ref AS group_invoice_ref,
        r.reservation_code AS linked_reservation_code, rm.room_number,
        NULLIF(concat_ws(', ',NULLIF(btrim(g.last_name),''),NULLIF(btrim(g.first_name),'')),'') AS linked_guest_name,
        COALESCE(NULLIF(regexp_replace(c.nombre_fantasia,'^[[:space:]]+|[[:space:]]+$','','g'),''),NULLIF(btrim(c.razon_social),'')) AS company_name,
        COALESCE(NULLIF(regexp_replace(ag.nombre_fantasia,'^[[:space:]]+|[[:space:]]+$','','g'),''),NULLIF(btrim(ag.razon_social),'')) AS agency_name
      FROM account_movements m
      LEFT JOIN payments p ON p.id=m.payment_id
      LEFT JOIN group_payments gp ON gp.id=m.group_payment_id
      LEFT JOIN reservations r ON r.id=COALESCE(m.reservation_id,p.reservation_id)
      LEFT JOIN rooms rm ON rm.id=r.room_id LEFT JOIN guests g ON g.id=r.guest_id
      LEFT JOIN companies c ON m.entity_type='company' AND c.id=m.entity_id
      LEFT JOIN agencies ag ON m.entity_type='agency' AND ag.id=m.entity_id
      WHERE ${scope} AND m.type='cargo' AND NOT m.voided AND m.amount>0
        AND m.reversal_of_movement_id IS NULL AND ${activeSalesRecord("account_movement", sql`m.id`)}
      ORDER BY m.date DESC,m.id`)
    ).rows as any[];
    // Invoices without a ledger link remain visible, but their balance is
    // explicitly unknown: issuing an invoice is not evidence of non-payment.
    const invoices = (
      await db.execute(sql`SELECT si.*, COALESCE(NULLIF(regexp_replace(c.nombre_fantasia,'^[[:space:]]+|[[:space:]]+$','','g'),''),NULLIF(btrim(c.razon_social),'')) AS company_name,
        COALESCE(NULLIF(regexp_replace(ag.nombre_fantasia,'^[[:space:]]+|[[:space:]]+$','','g'),''),NULLIF(btrim(ag.razon_social),'')) AS agency_name,
        r.reservation_code,rm.room_number,
        NULLIF(concat_ws(', ',NULLIF(btrim(g.last_name),''),NULLIF(btrim(g.first_name),'')),'') AS guest_name
      FROM sales_invoices si LEFT JOIN companies c ON si.recipient_entity_type='company' AND c.id=si.recipient_entity_id
      LEFT JOIN agencies ag ON si.recipient_entity_type='agency' AND ag.id=si.recipient_entity_id
      LEFT JOIN reservations r ON r.id=si.reserva_id LEFT JOIN rooms rm ON rm.id=r.room_id LEFT JOIN guests g ON g.id=r.guest_id
      WHERE si.tipo_comprobante LIKE 'F%' AND si.estado IN ('emitida','anulada')
        AND ${activeSalesRecord("invoice", sql`si.id`)}
`)
    ).rows as any[];
    const invoiceById = new Map(invoices.map((i) => [i.id, i]));
    const byPayment = new Map<string, any[]>(),
      byGroup = new Map<string, any[]>(),
      byReference = new Map<string, any[]>();
    for (const i of invoices) {
      if (i.payment_id)
        byPayment.set(i.payment_id, [
          ...(byPayment.get(i.payment_id) || []),
          i,
        ]);
      if (i.group_payment_id)
        byGroup.set(i.group_payment_id, [
          ...(byGroup.get(i.group_payment_id) || []),
          i,
        ]);
      const refs = [
        `${i.tipo_comprobante}-${String(i.numero).padStart(8, "0")}`,
        `${i.tipo_comprobante}-${String(i.punto_venta).padStart(4, "0")}-${String(i.numero).padStart(8, "0")}`,
        `${i.tipo_comprobante} ${String(i.punto_venta).padStart(4, "0")}-${String(i.numero).padStart(8, "0")}`,
        `${i.tipo_comprobante}-${String(i.punto_venta).padStart(5, "0")}-${String(i.numero).padStart(8, "0")}`,
        `invoice:${i.id}:${i.tipo_comprobante}:${i.punto_venta}:${i.numero}`,
        ...(i.credit_reapplication_intent?.operationId
          ? [`credit-operation:${i.credit_reapplication_intent.operationId}`]
          : []),
      ];
      for (const ref of refs)
        byReference.set(ref, [...(byReference.get(ref) || []), i]);
    }
    const allocations = (
      await db.execute(sql`SELECT a.cargo_id,sum(a.amount)::text AS amount FROM account_movement_allocations a
      JOIN account_movements m ON m.id=a.cargo_id JOIN account_movements p ON p.id=a.pago_id
      WHERE ${scope} AND NOT a.voided AND NOT p.voided AND p.reversal_of_movement_id IS NULL
        AND p.entity_type=m.entity_type AND p.entity_id=m.entity_id AND ${activeSalesRecord("account_movement", sql`p.id`)}
      GROUP BY a.cargo_id`)
    ).rows as any[];
    // Credit-note recovery uses an explicit [cargo:id] marker rather than an
    // allocation row. Count only its portion not already allocated to any charge.
    const credits = (
      await db.execute(sql`SELECT m.id AS cargo_id,
      sum(GREATEST(0,abs(p.amount)-COALESCE((SELECT sum(a.amount) FROM account_movement_allocations a
        WHERE a.pago_id=p.id AND NOT a.voided),0)))::text AS amount
      FROM account_movements m JOIN account_movements p ON p.entity_type=m.entity_type AND p.entity_id=m.entity_id
        AND position('[cargo:' || m.id || ']' in p.description)>0
      WHERE ${scope} AND m.type='cargo' AND p.type IN ('pago','nota_credito') AND p.amount<0 AND NOT p.voided
        AND p.reversal_of_movement_id IS NULL AND ${activeSalesRecord("account_movement", sql`p.id`)} GROUP BY m.id`)
    ).rows as any[];
    const allocated = new Map(
      allocations.map((a) => [a.cargo_id, Number(a.amount)]),
    );
    const creditByCargo = new Map(
      credits.map((a) => [a.cargo_id, Number(a.amount)]),
    );
    const invoiceTracking = (
      await db.execute(sql`SELECT * FROM cc_invoice_tracking`)
    ).rows as any[];
    const movementTracking = (
      await db.execute(sql`SELECT * FROM cc_movement_tracking`)
    ).rows as any[];
    const trackingByInvoice = new Map(
      invoiceTracking.map((t) => [t.sales_invoice_id, t]),
    );
    const trackingByMovement = new Map(
      movementTracking.map((t) => [t.account_movement_id, t]),
    );
    const manual = await getCcManualTrackingRows();
    const groups = new Map<
      string,
      { invoice: any; movements: any[]; ambiguous: boolean }
    >();
    const coveredInvoices = new Set<number>();
    for (const m of movements) {
      const explicit = [
        invoiceRefId(m.reference),
        invoiceRefId(m.payment_invoice_ref),
        invoiceRefId(m.group_invoice_ref),
        Number(m.group_invoice_id) || null,
      ]
        .filter((id): id is number => !!id)
        .map((id) => invoiceById.get(id))
        .filter(Boolean);
      const durable = [
        ...explicit,
        ...(byPayment.get(m.payment_id) || []),
        ...(byGroup.get(m.group_payment_id) || []),
      ];
      const referenceMatches = (byReference.get(m.reference) || []).filter(
        (i) =>
          (!i.recipient_entity_type ||
            (i.recipient_entity_type === m.entity_type &&
              i.recipient_entity_id === m.entity_id)) &&
          (!i.reserva_id ||
            !m.reservation_id ||
            i.reserva_id === m.reservation_id),
      );
      const candidates = [
        ...new Map(
          [...durable, ...referenceMatches].map((i) => [i.id, i]),
        ).values(),
      ];
      const live = candidates.filter((i) => i.estado === "emitida");
      const options = live.length ? live : candidates;
      const inv = options.length === 1 ? options[0] : null;
      for (const i of candidates) coveredInvoices.add(i.id);
      const key = inv
        ? `invoice:${inv.id}:${m.entity_type}:${m.entity_id}`
        : `movement:${m.id}`;
      const group = groups.get(key) || {
        invoice: inv,
        movements: [],
        ambiguous: options.length > 1,
      };
      group.movements.push(m);
      groups.set(key, group);
    }
    const ownersByInvoice = new Map<number, Set<string>>();
    for (const group of groups.values())
      if (group.invoice) {
        const owners =
          ownersByInvoice.get(group.invoice.id) || new Set<string>();
        owners.add(
          `${group.movements[0].entity_type}:${group.movements[0].entity_id}`,
        );
        ownersByInvoice.set(group.invoice.id, owners);
      }
    for (const group of groups.values())
      if (
        group.invoice &&
        (ownersByInvoice.get(group.invoice.id)?.size || 0) > 1
      )
        group.ambiguous = true;
    const rows: CcInvoiceTrackingRow[] = [];
    const usedManual = new Set<number>();
    for (const [key, group] of groups) {
      const inv = group.invoice,
        ms = group.movements,
        first = ms[0];
      const related = manual.filter(
        (t) =>
          (inv && t.salesInvoiceId === inv.id) ||
          ms.some((m) => m.id === t.accountMovementId),
      );
      related.forEach((t) => usedManual.add(t.manualId));
      const invoiceState = inv && trackingByInvoice.get(inv.id);
      const movementStates = ms
        .map((m) => trackingByMovement.get(m.id))
        .filter(Boolean);
      const states = [
        ...related,
        ...(invoiceState
          ? [{ ...invoiceState, updatedAt: invoiceState.updated_at }]
          : []),
        ...movementStates.map((t) => ({ ...t, updatedAt: t.updated_at })),
      ].sort((a, b) => stamp(b.updatedAt).localeCompare(stamp(a.updatedAt)));
      const state = states[0];
      const original = money(ms.reduce((s, m) => s + Number(m.amount), 0));
      const balance = money(
        ms.reduce(
          (s, m) =>
            s +
            Math.max(
              0,
              Number(m.amount) -
                (allocated.get(m.id) || 0) -
                (creditByCargo.get(m.id) || 0),
            ),
          0,
        ),
      );
      const refs = [
        ...new Set(
          ms.map(
            (m) =>
              text(m.linked_guest_name, m.guest_name) +
              (m.room_number ? ` — habitación ${m.room_number}` : ""),
          ),
        ),
      ].filter(Boolean);
      const observations = [
        ...new Set(states.map((s) => s.observaciones).filter(Boolean)),
      ].join("\n");
      rows.push({
        recordId: key,
        accountMovementIds: ms.map((m) => m.id),
        manualId: related.length === 1 ? related[0].manualId : undefined,
        salesInvoiceId: inv?.id || 0,
        numeroFactura: inv
          ? `${String(inv.punto_venta).padStart(5, "0")}-${String(inv.numero).padStart(8, "0")}`
          : "Sin factura vinculada",
        tipoComprobante: inv?.tipo_comprobante || "Cargo CC",
        fecha: inv?.fecha_emision || first.date,
        entityType: first.entity_type,
        entityId: first.entity_id,
        entityName:
          text(first.company_name, first.agency_name) || "Titular sin nombre",
        motivo: refs.join(" · ") || null,
        referencia: ms
          .map((m) =>
            text(m.linked_reservation_code, m.reservation_code, m.reference),
          )
          .join(" · "),
        conceptos: ms.map((m) => m.description).join(" · "),
        monto: original,
        saldoPendiente: balance,
        motivoGestion: related
          .map((t) => t.motivo)
          .filter(Boolean)
          .join(" · "),
        importeSinFactura:
          !inv && !group.ambiguous
            ? original
            : inv?.estado === "emitida"
              ? money(Math.max(0, original - Number(inv.monto_total)))
              : 0,
        importeFacturado:
          !group.ambiguous && inv && inv.estado === "emitida"
            ? money(
                Math.max(
                  0,
                  Number(inv.monto_total) - Number(inv.monto_acreditado || 0),
                ),
              )
            : 0,
        documentStatus: group.ambiguous
          ? "revision_vinculo"
          : !inv
            ? "sin_factura"
            : inv.estado === "anulada"
              ? "factura_anulada"
              : original > Number(inv.monto_total) + 0.009
                ? "facturacion_parcial"
                : "facturada",
        estado: state?.estado || "pendiente",
        observaciones: observations || null,
        updatedAt: state?.updatedAt ? stamp(state.updatedAt) : null,
        gestionAdicional:
          related.length > 1
            ? related.map((t) => ({
                id: t.manualId,
                estado: t.estado,
                observaciones: t.observaciones,
              }))
            : undefined,
      });
    }
    for (const inv of invoices) {
      if (coveredInvoices.has(inv.id) || inv.estado !== "emitida") continue;
      const related = manual.find((m) => m.salesInvoiceId === inv.id);
      if (related) usedManual.add(related.manualId);
      if (
        !related &&
        (inv.cash_forma_pago !== "cuenta_corriente" ||
          !["company", "agency"].includes(inv.recipient_entity_type))
      )
        continue;
      const state = related || trackingByInvoice.get(inv.id);
      rows.push({
        recordId: `invoice:${inv.id}`,
        manualId: related?.manualId,
        salesInvoiceId: inv.id,
        numeroFactura: `${String(inv.punto_venta).padStart(5, "0")}-${String(inv.numero).padStart(8, "0")}`,
        tipoComprobante: inv.tipo_comprobante,
        fecha: inv.fecha_emision,
        entityType:
          inv.recipient_entity_type || related?.entityType || "company",
        entityId: inv.recipient_entity_id || "",
        entityName:
          text(
            inv.company_name,
            inv.agency_name,
            related?.entityName,
            inv.cliente_razon_social,
          ) || "Titular sin nombre",
        motivo: inv.guest_name
          ? inv.guest_name +
            (inv.room_number ? ` — habitación ${inv.room_number}` : "")
          : related?.motivo || null,
        referencia: inv.reservation_code || "",
        monto: Number(inv.monto_total),
        saldoPendiente: null,
        documentStatus: "facturada",
        importeFacturado: money(
          Math.max(
            0,
            Number(inv.monto_total) - Number(inv.monto_acreditado || 0),
          ),
        ),
        amountPending: related?.amountPending,
        estado: state?.estado || "pendiente",
        observaciones: state?.observaciones || null,
        updatedAt:
          state?.updatedAt || state?.updated_at
            ? stamp(state.updatedAt || state.updated_at)
            : null,
      });
    }
    // Unmerged manual tasks have no verified active debt identity. Preserve them as tasks,
    // explicitly outside monetary debt totals; never fuzzy-match names/amounts.
    for (const m of manual) {
      if (usedManual.has(m.manualId)) continue;
      rows.push({
        ...m,
        recordId: `manual:${m.manualId}`,
        documentStatus: "manual",
        saldoPendiente: null,
        importeFacturado: 0,
      });
    }
    return rows
      .filter((r) => {
        if (
          (filters.from && r.fecha < filters.from) ||
          (filters.to && r.fecha > filters.to)
        )
          return false;
        if (
          (filters.entityType && r.entityType !== filters.entityType) ||
          (filters.entityId && r.entityId !== filters.entityId)
        )
          return false;
        if (
          (filters.salesInvoiceId &&
            r.salesInvoiceId !== filters.salesInvoiceId) ||
          (filters.estado && r.estado !== filters.estado)
        )
          return false;
        if (
          filters.documentStatus &&
          r.documentStatus !== filters.documentStatus
        )
          return false;
        if (filters.search) {
          const needle = normalizeSearch(filters.search);
          if (
            !normalizeSearch(
              [
                r.entityName,
                `${r.tipoComprobante} ${r.numeroFactura}`,
                r.numeroFactura,
                r.tipoComprobante,
                r.motivo,
                r.referencia,
                r.conceptos,
                r.observaciones,
              ].join(" "),
            ).includes(needle)
          )
            return false;
        }
        return true;
      })
      .sort(
        (a, b) =>
          b.fecha.localeCompare(a.fecha) ||
          a.recordId!.localeCompare(b.recordId!),
      );
  });
}

/** Stores administrative follow-up only; never changes ledger or fiscal rows. */
export async function upsertCcMovementTracking(
  id: string,
  input: { estado?: unknown; observaciones?: unknown },
  user: string | null,
) {
  if (
    ![
      "pendiente",
      "enviada",
      "reclamada",
      "pagada",
      "cargada_extranet",
    ].includes(String(input.estado)) ||
    (input.observaciones !== null && typeof input.observaciones !== "string") ||
    String(input.observaciones ?? "").length > 5000
  )
    throw new Error("Datos de seguimiento inválidos");
  await withDatabaseTransaction(async () => {
    const found =
      await db.execute(sql`SELECT m.id FROM account_movements m WHERE m.id=${id} AND m.type='cargo'
      AND m.entity_type IN ('company','agency') AND NOT m.voided AND m.reversal_of_movement_id IS NULL
      AND ${activeSalesRecord("account_movement", sql`m.id`)} FOR SHARE`);
    if (!found.rows.length)
      throw new Error("El cargo no existe o ya no está vigente");
    await db.execute(sql`INSERT INTO cc_movement_tracking(account_movement_id,estado,observaciones,updated_by)
      VALUES(${id},${String(input.estado)},${input.observaciones as string | null},${user})
      ON CONFLICT(account_movement_id) DO UPDATE SET estado=excluded.estado,observaciones=excluded.observaciones,updated_by=excluded.updated_by,updated_at=now()`);
    await db.execute(sql`INSERT INTO audit_logs(action,module,entity_type,entity_id,description,details,user_name,timestamp)
      VALUES('update','admin','cc_movement_tracking',${id},'Seguimiento de cargo CC actualizado',${JSON.stringify(input)},${user},now())`);
  });
}
