import {getCcManualTrackingRows} from './ccManualTracking';
import { and, desc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { db } from "./db";
import {
  salesInvoices, ccInvoiceTracking, companies, agencies, reservations, guests,
  type CcInvoiceTrackingEstado,
} from "@shared/schema";

const ESTADOS: CcInvoiceTrackingEstado[] = ["pendiente", "enviada", "reclamada", "pagada", "cargada_extranet"];

export type CcInvoiceTrackingRow = {
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
  from?: string;
  to?: string;
  entityType?: "company" | "agency";
  entityId?: string;
  estado?: CcInvoiceTrackingEstado;
  search?: string;
  salesInvoiceId?: number;
};

/**
 * Facturas "subidas a Cuenta Corriente": emitidas (no anuladas) a una
 * Empresa o Agencia, facturadas en CC, excluyendo Notas de Crédito/Débito
 * (tipoComprobante empieza con F) — son las que de verdad hay que enviar y
 * cobrar, no ajustes posteriores.
 */
export async function getCcInvoiceTrackingList(filters: CcInvoiceTrackingFilters = {}): Promise<CcInvoiceTrackingRow[]> {
  const conditions = [
    eq(salesInvoices.estado, "emitida"),
    eq(salesInvoices.cashFormaPago, "cuenta_corriente"),
    sql`${salesInvoices.tipoComprobante} LIKE 'F%'`,
    sql`${salesInvoices.recipientEntityType} IN ('company', 'agency')`,
  ];
  if (filters.from) conditions.push(gte(salesInvoices.fechaEmision, filters.from));
  if (filters.to) conditions.push(lte(salesInvoices.fechaEmision, filters.to));
  if (filters.entityType) conditions.push(eq(salesInvoices.recipientEntityType, filters.entityType));
  if (filters.entityId) conditions.push(eq(salesInvoices.recipientEntityId, filters.entityId));
  if (filters.salesInvoiceId) conditions.push(eq(salesInvoices.id, filters.salesInvoiceId));

  const invoices = await db.select().from(salesInvoices).where(and(...conditions)).orderBy(desc(salesInvoices.fechaEmision), desc(salesInvoices.id));


  const companyIds = [...new Set(invoices.filter(i => i.recipientEntityType === "company").map(i => i.recipientEntityId!))];
  const agencyIds = [...new Set(invoices.filter(i => i.recipientEntityType === "agency").map(i => i.recipientEntityId!))];
  const reservaIds = [...new Set(invoices.map(i => i.reservaId).filter((id): id is string => !!id))];
  const invoiceIds = invoices.map(i => i.id);

  const [companyRows, agencyRows, reservationRows, trackingRows] = await Promise.all([
    companyIds.length ? db.select({ id: companies.id, name: sql<string>`COALESCE(${companies.nombreFantasia}, ${companies.razonSocial})` }).from(companies).where(inArray(companies.id, companyIds)) : Promise.resolve([]),
    agencyIds.length ? db.select({ id: agencies.id, name: sql<string>`COALESCE(${agencies.nombreFantasia}, ${agencies.razonSocial})` }).from(agencies).where(inArray(agencies.id, agencyIds)) : Promise.resolve([]),
    reservaIds.length ? db.select({ id: reservations.id, guestId: reservations.guestId }).from(reservations).where(inArray(reservations.id, reservaIds)) : Promise.resolve([]),
    invoiceIds.length ? db.select().from(ccInvoiceTracking).where(inArray(ccInvoiceTracking.salesInvoiceId, invoiceIds)) : Promise.resolve([]),
  ]);

  const guestIds = [...new Set(reservationRows.map(r => r.guestId).filter((id): id is string => !!id))];
  const guestRows = guestIds.length
    ? await db.select({ id: guests.id, firstName: guests.firstName, lastName: guests.lastName }).from(guests).where(inArray(guests.id, guestIds))
    : [];

  const companyNameById = new Map(companyRows.map(c => [c.id, c.name]));
  const agencyNameById = new Map(agencyRows.map(a => [a.id, a.name]));
  const guestNameById = new Map(guestRows.map(g => [g.id, `${g.lastName}${g.firstName ? ", " + g.firstName : ""}`]));
  const reservationGuestById = new Map(reservationRows.map(r => [r.id, r.guestId ? guestNameById.get(r.guestId) ?? null : null]));
  const trackingByInvoiceId = new Map(trackingRows.map(t => [t.salesInvoiceId, t]));

  const rows: CcInvoiceTrackingRow[] = invoices.map(inv => {
    const tracking = trackingByInvoiceId.get(inv.id);
    const estado = tracking?.estado ?? "pendiente";
    const entityType = inv.recipientEntityType as "company" | "agency";
    const entityName = entityType === "company"
      ? companyNameById.get(inv.recipientEntityId!) ?? inv.clienteRazonSocial
      : agencyNameById.get(inv.recipientEntityId!) ?? inv.clienteRazonSocial;
    return {
      salesInvoiceId: inv.id,
      numeroFactura: String(inv.numero).padStart(8, "0"),
      tipoComprobante: inv.tipoComprobante,
      fecha: inv.fechaEmision,
      entityType,
      entityId: inv.recipientEntityId!,
      entityName,
      motivo: inv.reservaId ? reservationGuestById.get(inv.reservaId) ?? null : null,
      monto: parseFloat(String(inv.montoTotal)),
      estado,
      observaciones: tracking?.observaciones ?? null,
      updatedAt: tracking?.updatedAt ? tracking.updatedAt.toISOString() : null,
    };
  });

  const manual = await getCcManualTrackingRows();
  const manualInvoiceIds=new Set(manual.filter(r=>r.salesInvoiceId>0).map(r=>r.salesInvoiceId));
  const merged=[...rows.filter(r=>!manualInvoiceIds.has(r.salesInvoiceId)),...manual];
  const filtered = merged.filter(r => {
    if(filters.from && r.fecha<filters.from)return false;
    if(filters.to && r.fecha>filters.to)return false;
    if(filters.entityType && r.entityType!==filters.entityType)return false;
    if(filters.entityId && r.entityId!==filters.entityId)return false;
    if(filters.salesInvoiceId && r.salesInvoiceId!==filters.salesInvoiceId)return false;
    if (filters.estado && r.estado !== filters.estado) return false;
    if (filters.search) {
      const needle = filters.search.toLowerCase();
      const haystack = `${r.numeroFactura} ${r.entityName} ${r.motivo ?? ""} ${r.observaciones ?? ""}`.toLowerCase();
      if (!haystack.includes(needle)) return false;
    }
    return true;
  });

  return filtered.sort((a,b)=>b.fecha.localeCompare(a.fecha));
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
  const candidates = await db.select({
    id: salesInvoices.id,
    numero: salesInvoices.numero,
    clienteCuit: salesInvoices.clienteCuit,
  }).from(salesInvoices).where(and(
    eq(salesInvoices.estado, "emitida"),
    eq(salesInvoices.cashFormaPago, "cuenta_corriente"),
    sql`${salesInvoices.tipoComprobante} LIKE 'F%'`,
    sql`${salesInvoices.recipientEntityType} IS NULL`,
  ));

  const details: CcInvoiceRecipientBackfillResult["details"] = [];
  let updated = 0;

  for (const inv of candidates) {
    const numeroFactura = String(inv.numero).padStart(8, "0");
    const cuitDigits = String(inv.clienteCuit || "").replace(/\D/g, "");
    if (!cuitDigits) {
      details.push({ salesInvoiceId: inv.id, numeroFactura, status: "unmatched" });
      continue;
    }
    const [companyMatches, agencyMatches] = await Promise.all([
      db.select({ id: companies.id, name: sql<string>`COALESCE(${companies.nombreFantasia}, ${companies.razonSocial})` })
        .from(companies).where(sql`regexp_replace(${companies.cuilCuit}, '\D', '', 'g') = ${cuitDigits}`),
      db.select({ id: agencies.id, name: sql<string>`COALESCE(${agencies.nombreFantasia}, ${agencies.razonSocial})` })
        .from(agencies).where(sql`regexp_replace(${agencies.cuilCuit}, '\D', '', 'g') = ${cuitDigits}`),
    ]);
    const allMatches = [
      ...companyMatches.map(m => ({ ...m, type: "company" as const })),
      ...agencyMatches.map(m => ({ ...m, type: "agency" as const })),
    ];
    if (allMatches.length !== 1) {
      details.push({ salesInvoiceId: inv.id, numeroFactura, status: allMatches.length === 0 ? "unmatched" : "ambiguous" });
      continue;
    }
    const match = allMatches[0];
    await db.update(salesInvoices)
      .set({ recipientEntityType: match.type, recipientEntityId: match.id } as any)
      .where(eq(salesInvoices.id, inv.id));
    updated += 1;
    details.push({ salesInvoiceId: inv.id, numeroFactura, status: "matched", entityType: match.type, entityName: match.name });
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
  const [invoice] = await db.select({ id: salesInvoices.id }).from(salesInvoices).where(eq(salesInvoices.id, salesInvoiceId));
  if (!invoice) throw new Error("La factura no existe");

  const [existing] = await db.select().from(ccInvoiceTracking).where(eq(ccInvoiceTracking.salesInvoiceId, salesInvoiceId));
  const next = {
    estado: data.estado ?? existing?.estado ?? "pendiente",
    observaciones: data.observaciones !== undefined ? data.observaciones : existing?.observaciones ?? null,
  };

  await db.insert(ccInvoiceTracking).values({
    salesInvoiceId, ...next, updatedAt: new Date(), updatedBy,
  } as any).onConflictDoUpdate({
    target: ccInvoiceTracking.salesInvoiceId,
    set: { ...next, updatedAt: new Date(), updatedBy },
  });
}

export type CcInvoiceTrackingMonthSummary = {
  totalFacturado: number;
  totalFacturas: number;
  porEstado: Array<{ estado: CcInvoiceTrackingEstado; cantidad: number; monto: number }>;
  porEmpresa: Array<{ entityType: "company" | "agency"; entityId: string; entityName: string; cantidad: number; monto: number }>;
};

export async function getCcInvoiceTrackingMonthReport(year: number, month: number): Promise<CcInvoiceTrackingMonthSummary> {
  const from = `${year}-${String(month).padStart(2, "0")}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const to = `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;

  const rows = (await getCcInvoiceTrackingList({ from, to })).filter(row=>row.salesInvoiceId>0);

  const porEstadoMap = new Map<CcInvoiceTrackingEstado, { cantidad: number; monto: number }>();
  for (const estado of ESTADOS) porEstadoMap.set(estado, { cantidad: 0, monto: 0 });
  const porEmpresaMap = new Map<string, { entityType: "company" | "agency"; entityId: string; entityName: string; cantidad: number; monto: number }>();

  for (const row of rows) {
    const e = porEstadoMap.get(row.estado)!;
    e.cantidad += 1;
    e.monto += row.monto;

    const key = `${row.entityType}:${row.entityId || row.entityName}`;
    const existing = porEmpresaMap.get(key);
    if (existing) {
      existing.cantidad += 1;
      existing.monto += row.monto;
    } else {
      porEmpresaMap.set(key, { entityType: row.entityType, entityId: row.entityId, entityName: row.entityName, cantidad: 1, monto: row.monto });
    }
  }

  return {
    totalFacturado: rows.reduce((sum, r) => sum + r.monto, 0),
    totalFacturas: rows.length,
    porEstado: ESTADOS.map(estado => ({ estado, ...porEstadoMap.get(estado)! })),
    porEmpresa: [...porEmpresaMap.values()].sort((a, b) => b.monto - a.monto),
  };
}
