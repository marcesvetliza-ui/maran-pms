import { getCcDebtTrackingList } from "./ccDebtTracking";
import { activeSalesRecord } from "./salesArchive";
import { and, eq, sql } from "drizzle-orm";
import { db } from "./db";
import {
  salesInvoices,
  ccInvoiceTracking,
  companies,
  agencies,
  type CcInvoiceTrackingEstado,
} from "@shared/schema";

const ESTADOS: CcInvoiceTrackingEstado[] = [
  "pendiente",
  "enviada",
  "reclamada",
  "pagada",
  "cargada_extranet",
];

export type CcInvoiceTrackingRow = {
  recordId?: string;
  accountMovementIds?: string[];
  documentStatus?:
    | "facturada"
    | "facturacion_parcial"
    | "sin_factura"
    | "factura_anulada"
    | "revision_vinculo"
    | "manual";
  saldoPendiente?: number | null;
  importeFacturado?: number;
  importeSinFactura?: number;
  motivoGestion?: string;
  referencia?: string;
  conceptos?: string;
  gestionAdicional?: Array<{
    id: number;
    estado: string;
    observaciones: string | null;
  }>;
  manualId?: number;
  amountPending?: boolean;
  salesInvoiceId: number;
  numeroFactura: string;
  tipoComprobante: string;
  fecha: string;
  entityType: "company" | "agency";
  entityId: string;
  entityName: string;
  motivo: string | null;
  monto: number;
  estado: CcInvoiceTrackingEstado;
  observaciones: string | null;
  updatedAt: string | null;
};

export type CcInvoiceTrackingFilters = {
  documentStatus?: CcInvoiceTrackingRow["documentStatus"];
  from?: string;
  to?: string;
  entityType?: "company" | "agency";
  entityId?: string;
  estado?: CcInvoiceTrackingEstado;
  search?: string;
  salesInvoiceId?: number;
};

/** Read-only debt projection: ledger charges plus invoices/manual follow-up.
 * Documentation, account balance and administrative state stay independent. */
export async function getCcInvoiceTrackingList(
  filters: CcInvoiceTrackingFilters = {},
): Promise<CcInvoiceTrackingRow[]> {
  return getCcDebtTrackingList(filters);
}

export type CcInvoiceRecipientBackfillResult = {
  updated: number;
  unmatched: number;
  details: Array<{
    salesInvoiceId: number;
    numeroFactura: string;
    status: "matched" | "unmatched" | "ambiguous";
    entityType?: "company" | "agency";
    entityName?: string;
  }>;
};

/**
 * Factura CC emitidas antes de que recipientEntityType/Id existiera en este
 * flujo (facturas de reserva cobradas a la Cta. Cte. de una empresa/agencia,
 * ver server/billing/routes.ts) quedaron sin ese dato y por eso no aparecen
 * en "Seguimiento de Facturas CC". Esto las vincula retroactivamente
 * buscando, por CUIT exacto, una única empresa o agencia — no toca nada más
 * de la factura (montos, fechas, estado), y una factura que no tenga un
 * único match queda como estaba, sin tocar.
 */
export async function backfillCcInvoiceRecipients(): Promise<CcInvoiceRecipientBackfillResult> {
  const candidates = await db
    .select({
      id: salesInvoices.id,
      numero: salesInvoices.numero,
      clienteCuit: salesInvoices.clienteCuit,
    })
    .from(salesInvoices)
    .where(
      and(
        activeSalesRecord("invoice", salesInvoices.id),
        eq(salesInvoices.estado, "emitida"),
        eq(salesInvoices.cashFormaPago, "cuenta_corriente"),
        sql`${salesInvoices.tipoComprobante} LIKE 'F%'`,
        sql`${salesInvoices.recipientEntityType} IS NULL`,
      ),
    );

  const details: CcInvoiceRecipientBackfillResult["details"] = [];
  let updated = 0;

  for (const inv of candidates) {
    const numeroFactura = String(inv.numero).padStart(8, "0");
    const cuitDigits = String(inv.clienteCuit || "").replace(/\D/g, "");
    if (!cuitDigits) {
      details.push({
        salesInvoiceId: inv.id,
        numeroFactura,
        status: "unmatched",
      });
      continue;
    }
    const [companyMatches, agencyMatches] = await Promise.all([
      db
        .select({
          id: companies.id,
          name: sql<string>`COALESCE(NULLIF(BTRIM(${companies.nombreFantasia}), ''), ${companies.razonSocial})`,
        })
        .from(companies)
        .where(
          sql`regexp_replace(${companies.cuilCuit}, '\D', '', 'g') = ${cuitDigits}`,
        ),
      db
        .select({
          id: agencies.id,
          name: sql<string>`COALESCE(NULLIF(BTRIM(${agencies.nombreFantasia}), ''), ${agencies.razonSocial})`,
        })
        .from(agencies)
        .where(
          sql`regexp_replace(${agencies.cuilCuit}, '\D', '', 'g') = ${cuitDigits}`,
        ),
    ]);
    const allMatches = [
      ...companyMatches.map((m) => ({ ...m, type: "company" as const })),
      ...agencyMatches.map((m) => ({ ...m, type: "agency" as const })),
    ];
    if (allMatches.length !== 1) {
      details.push({
        salesInvoiceId: inv.id,
        numeroFactura,
        status: allMatches.length === 0 ? "unmatched" : "ambiguous",
      });
      continue;
    }
    const match = allMatches[0];
    await db
      .update(salesInvoices)
      .set({
        recipientEntityType: match.type,
        recipientEntityId: match.id,
      } as any)
      .where(eq(salesInvoices.id, inv.id));
    updated += 1;
    details.push({
      salesInvoiceId: inv.id,
      numeroFactura,
      status: "matched",
      entityType: match.type,
      entityName: match.name,
    });
  }

  return { updated, unmatched: details.length - updated, details };
}

export async function upsertCcInvoiceTracking(
  salesInvoiceId: number,
  data: {
    estado?: CcInvoiceTrackingEstado;
    observaciones?: string | null;
  },
  updatedBy: string | null,
): Promise<void> {
  if (data.estado && !ESTADOS.includes(data.estado)) {
    throw new Error("Estado inválido");
  }
  const [invoice] = await db
    .select({ id: salesInvoices.id })
    .from(salesInvoices)
    .where(eq(salesInvoices.id, salesInvoiceId));
  if (!invoice) throw new Error("La factura no existe");

  const [existing] = await db
    .select()
    .from(ccInvoiceTracking)
    .where(eq(ccInvoiceTracking.salesInvoiceId, salesInvoiceId));
  const next = {
    estado: data.estado ?? existing?.estado ?? "pendiente",
    observaciones:
      data.observaciones !== undefined
        ? data.observaciones
        : (existing?.observaciones ?? null),
  };

  await db
    .insert(ccInvoiceTracking)
    .values({
      salesInvoiceId,
      ...next,
      updatedAt: new Date(),
      updatedBy,
    } as any)
    .onConflictDoUpdate({
      target: ccInvoiceTracking.salesInvoiceId,
      set: { ...next, updatedAt: new Date(), updatedBy },
    });
}

export type CcInvoiceTrackingMonthSummary = {
  totalFacturado: number;
  totalSinFactura: number;
  totalSaldoPendiente: number;
  totalGestionesManuales: number;
  saldosSinVerificar: number;
  totalFacturas: number;
  porEstado: Array<{
    estado: CcInvoiceTrackingEstado;
    cantidad: number;
    monto: number;
  }>;
  porEmpresa: Array<{
    entityType: "company" | "agency";
    entityId: string;
    entityName: string;
    cantidad: number;
    monto: number;
  }>;
};

export async function getCcInvoiceTrackingMonthReport(
  year: number,
  month: number,
): Promise<CcInvoiceTrackingMonthSummary> {
  const from = `${year}-${String(month).padStart(2, "0")}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const to = `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;

  const all = await getCcInvoiceTrackingList({ from, to });
  const rows = all.filter((row) =>
    ["facturada", "facturacion_parcial"].includes(row.documentStatus || ""),
  );

  const porEstadoMap = new Map<
    CcInvoiceTrackingEstado,
    { cantidad: number; monto: number }
  >();
  for (const estado of ESTADOS)
    porEstadoMap.set(estado, { cantidad: 0, monto: 0 });
  const porEmpresaMap = new Map<
    string,
    {
      entityType: "company" | "agency";
      entityId: string;
      entityName: string;
      cantidad: number;
      monto: number;
    }
  >();

  for (const row of rows) {
    const e = porEstadoMap.get(row.estado)!;
    e.cantidad += 1;
    e.monto += row.importeFacturado ?? row.monto;

    const key = `${row.entityType}:${row.entityId || row.entityName}`;
    const existing = porEmpresaMap.get(key);
    if (existing) {
      existing.cantidad += 1;
      existing.monto += row.importeFacturado ?? row.monto;
    } else {
      porEmpresaMap.set(key, {
        entityType: row.entityType,
        entityId: row.entityId,
        entityName: row.entityName,
        cantidad: 1,
        monto: row.importeFacturado ?? row.monto,
      });
    }
  }

  return {
    totalFacturado:
      Math.round(
        rows.reduce((sum, r) => sum + (r.importeFacturado ?? r.monto), 0) * 100,
      ) / 100,
    totalSinFactura:
      Math.round(
        all.reduce((sum, r) => sum + (r.importeSinFactura ?? 0), 0) * 100,
      ) / 100,
    totalSaldoPendiente:
      Math.round(
        all.reduce((sum, r) => sum + (r.saldoPendiente ?? 0), 0) * 100,
      ) / 100,
    totalGestionesManuales: all.filter((r) => r.documentStatus === "manual")
      .length,
    saldosSinVerificar: all.filter(
      (r) => r.documentStatus !== "manual" && r.saldoPendiente == null,
    ).length,
    totalFacturas: rows.length,
    porEstado: ESTADOS.map((estado) => ({
      estado,
      ...porEstadoMap.get(estado)!,
    })),
    porEmpresa: [...porEmpresaMap.values()].sort((a, b) => b.monto - a.monto),
  };
}
