import { assertExternalCommAllowed } from "../external-comms-policy";
import { randomUUID } from "node:crypto";
import {fiscalDocumentCode} from "../../shared/fiscal-document-types";
import { assertBillingPoint, BillingPreflightError, fiscalRecipientError } from "./preflight";
import { beginBillingOperation, billingOperationStage, billingOperationNumber, operationForInvoice, payloadHash, type BillingOperation, type FiscalIdentity } from "./operationJournal";
import { resolveFiscalRecipientDocument } from "./fiscalDocument";
import { nonFiscalCollectionError } from "@shared/cash-document-classification";
import { FiscalNumberLookupError, readLastAuthorizedNumber } from "./lastAuthorizedNumber";
import { db, pool } from "../db";
import { eq, sql } from "drizzle-orm";
import { salesInvoices, invoiceCounters } from "@shared/schema";
import { getBillingConfig } from "./billingConfig";
import { generateFakeCAE } from "./fakeArca";
import { callARCA } from "./arcaClient";
import { getArgentinaToday } from "../db-storage";
import { assertFinancialSchemaReady } from "../migrate";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "@shared/schema";

type BillingDatabase = Omit<typeof db, "$client">;

export interface InvoiceItem {
  descripcion: string;
  cantidad: number;
  precioUnitario: number;
  alicuotaIva: "21" | "10.5" | "exento" | "no_gravado";
  subtotalNeto: number;
  subtotal: number;
  /** Fuente elegida al emitir desde el Centro de Comprobantes. */
  catalogItem?: { source: "accommodation" | "restaurant" | "spa"; id: string };
  /** Tratamiento de spa_treatments elegido del catálogo — permite registrar
   * la venta como "turno vendido" pendiente de agendar. */
  spaTreatmentId?: string;
  /** Presente solo si este tratamiento se compra para regalar — crea un
   * gift voucher "por prestación" vinculado a la venta, a nombre de este
   * beneficiario. Requiere spaTreatmentId. */
  giftBeneficiaryName?: string;
  giftExpiresAt?: string;
}

export type NonFiscalTipo =
  | "ticket"
  | "voucher_justo"
  | "voucher_pedidos_ya"
  | "voucher_room_service"
  | "voucher_consumo_interno"
  | "cierre_habitacion"
  | "cierre_spa"
  | "cierre_spa_agustin"
  | "cierre_spa_cortesia";

export const NON_FISCAL_TIPOS: NonFiscalTipo[] = [
  "ticket", "voucher_justo", "voucher_pedidos_ya", "voucher_room_service", "voucher_consumo_interno",
  "cierre_habitacion", "cierre_spa", "cierre_spa_agustin", "cierre_spa_cortesia",
];

export function isNonFiscalTipo(tipo: string): tipo is NonFiscalTipo {
  return NON_FISCAL_TIPOS.includes(tipo as NonFiscalTipo);
}

export interface NewInvoiceData {
  operationId?: string;
  requestSnapshot?: Record<string, any>;
  tipoComprobante: "FA" | "FB" | "FC" | "FT" | "FM" | "FMB" | "NCA" | "NCB" | "NCC" | "NCT" | "NCM" | "NCMB" | "NDA" | "NDB" | "NDT" | "NDM" | "NDMB" | "NDC" | NonFiscalTipo;
  cliente: {
    razonSocial: string;
    cuit?: string;
    dni?: string;
    /** e.g. "passport" — Factura T (turismo) receptores extranjeros. */
    documentType?: string;
    condicionIva: string;
    domicilio?: string;
  };
  recipientEntity?: { type: "guest" | "company" | "agency"; id: string };
  centerSettlementArea?: string;
  items: InvoiceItem[];
  reservaId?: string;
  /** Reservation payment this document must be linked to after authorization. */
  paymentId?: string;
  /** Group that owns this invoice's fiscal sources. */
  groupId?: string;
  /** Parent group collection being invoiced, if any. */
  groupPaymentId?: string;
  groupPaymentIntent?: Record<string, any>;
  /** SPA folio claimed by this invoice at issuance time. */
  spaAccountId?: string;
  restaurantOrderId?: string;
  folioId?: string;
  facturaOriginalId?: number; // para NC
  /**
   * The original document this NC/ND corrects, exactly as ARCA needs to
   * identify it (RG 4540/19's CbtesAsoc — mandatory for every NC/ND since
   * 2021-04-01, or ARCA rejects the request with error 10197). Required
   * whenever facturaOriginalId is set and this is a real ARCA call
   * (ficticio mode never talks to ARCA, so it doesn't need this).
   */
  comprobanteAsociado?: {
    tipo: string;
    puntoVenta: number;
    numero: number;
    /** AAAAMMDD, no dashes. */
    fecha: string;
  };
  operador?: string;
  puntoVentaOverride?: number; // PV específico del área; si está presente, ignora billing_config.puntoVenta
  cashFormaPago?: string; // forma de pago para registrar en el comprobante
  cashFormaPagoDetalle?: Array<{ method: string; amount: number }>;
  sourceChargeIds?: string[]; // IDs de cargos del folio incluidos en esta factura
  sourceChargeAmounts?: Record<string, number>; // importe emitido por cada cargo del folio
  observaciones?: string;
  /**
   * Used only by reservation credit notes. A local draft is persisted before
   * requesting the CAE, so an authorization can always be reconciled later.
   */
  recoverableCreditNote?: boolean;
  /** Reservation debit notes use the same durable pre-authorization draft flow. */
  recoverableDebitNote?: boolean;
  recoveryInvoiceId?: number;
  creditReapplicationIntent?: Record<string, unknown>;
  /**
   * Internal durable-draft hook. It runs in the same transaction as the draft
   * insert and may validate locked state and complete immutable intent fields.
   */
  beforeDraftInsert?: (tx: any, draft: typeof salesInvoices.$inferInsert) => Promise<void>;
}

export const TIPOS_CBT_WSFE: Record<string, number> = {
  FA: 1, FB: 6, FC: 11, FT: 195, FM: 201, FMB: 206,
  NCA: 3, NCB: 8, NCC: 13, NCT: 197, NCM: 203, NCMB: 208,
  NDA: 2, NDB: 7, NDT: 196, NDM: 202, NDMB: 207, NDC: 12,
};

function invoiceRowValue(doc: any, snakeCase: string, camelCase: string) {
  return doc?.[snakeCase] ?? doc?.[camelCase];
}

/**
 * Builds the `comprobanteAsociado` every NC/ND must pass to emitirFactura —
 * ARCA's CbtesAsoc (RG 4540/19, mandatory since 2021-04-01: without it ARCA
 * rejects the request with error 10197). `doc` is the sales_invoices row
 * (snake_case from a raw query, or camelCase) this NC/ND corrects.
 */
export function buildComprobanteAsociado(doc: any): NewInvoiceData["comprobanteAsociado"] {
  fiscalDocumentCode(String(invoiceRowValue(doc, "tipo_comprobante", "tipoComprobante")));
  return {
    tipo: String(invoiceRowValue(doc, "tipo_comprobante", "tipoComprobante")),
    puntoVenta: Number(invoiceRowValue(doc, "punto_venta", "puntoVenta")),
    numero: Number(invoiceRowValue(doc, "numero", "numero")),
    fecha: String(invoiceRowValue(doc, "fecha_emision", "fechaEmision") || "").replace(/-/g, ""),
  };
}

// FC/NCC/NDC (Factura C — monotributistas) siguen sin implementarse. FT y sus
// notas T ya tienen el circuito completo: reglas de elegibilidad (solo
// huésped extranjero con alojamiento), armado del pedido a ARCA con Pasaporte
// como tipo de documento, y el PDF con el encabezado correspondiente.
const UNSUPPORTED_SALE_TYPES = new Set(["FC", "NCC", "NDC"]);

export function isUnsupportedSaleType(tipo: string): boolean {
  return UNSUPPORTED_SALE_TYPES.has(tipo);
}

/**
 * Calculates fiscal fields from the gross line amounts, which are the
 * economic amounts shown to and approved by the operator. Deriving totals
 * from client-provided per-line net values can lose cents when several lines
 * are aggregated, causing the fiscal total to differ from the invoice total.
 */
export function calcularMontos(items: InvoiceItem[], tipo: string) {
  let bruto21 = 0;
  let bruto105 = 0;
  let montoExento = 0;
  let montoNoGravado = 0;

  // Factura C (monotributista) y Factura T (turismo) no discriminan IVA:
  // todo el importe se considera "no gravado" a los fines de ARCA.
  if (tipo === "FC" || tipo === "FT" || tipo === "NCC" || tipo === "NCT") {
    for (const item of items) montoNoGravado += round2(item.subtotal);
    const montoTotal = round2(montoNoGravado);
    return {
      montoNeto: 0,
      montoNeto21: 0,
      montoNeto105: 0,
      montoIva21: 0,
      montoIva105: 0,
      montoExento: 0,
      montoNoGravado: montoTotal,
      montoTotal,
    };
  }

  for (const item of items) {
    const bruto = round2(item.subtotal);
    switch (item.alicuotaIva) {
      case "21":
        bruto21 += bruto;
        break;
      case "10.5":
        bruto105 += bruto;
        break;
      case "exento":
        montoExento += bruto;
        break;
      case "no_gravado":
        montoNoGravado += bruto;
        break;
    }
  }

  const neto21 = round2(bruto21 / 1.21);
  const neto105 = round2(bruto105 / 1.105);
  const montoIva21 = round2(bruto21 - neto21);
  const montoIva105 = round2(bruto105 - neto105);
  const montoNeto = round2(neto21 + neto105);
  // Preserve the exact sum of gross line cents. This is authoritative for
  // availability claims, payment links, PDFs and the ARCA payload.
  const montoTotal = round2(bruto21 + bruto105 + montoExento + montoNoGravado);
  return {
    montoNeto,
    montoNeto21: neto21,
    montoNeto105: neto105,
    montoIva21,
    montoIva105,
    montoExento: round2(montoExento),
    montoNoGravado: round2(montoNoGravado),
    montoTotal,
  };
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

/**
 * Contador local — solo se usa en modo ficticio (ni AFIP ni ARCA lo conocen;
 * acá la única fuente de verdad es esta misma base).
 *
 * Siempre respeta el número más alto que sales_invoices ya tenga para ese
 * tipo+punto_venta, aunque el contador nunca se haya actualizado para llegar
 * ahí (por ejemplo: una fila cargada por otra vía — una sincronización desde
 * AFIP en homologación/producción que alcanzó a insertar la factura pero no
 * llegó a sincronizar el contador, un dato de prueba o una importación
 * manual). Sin este resguardo, el contador podía devolver un número ya
 * ocupado y chocar contra la restricción única de sales_invoices.
 */
async function getNextInvoiceNumber(tipo: string, puntoVenta: number, database: BillingDatabase = db): Promise<number> {
  const result = await database.execute(sql`
    INSERT INTO invoice_counters (tipo_comprobante, punto_venta, ultimo_numero)
    VALUES (
      ${tipo}, ${puntoVenta},
      COALESCE((SELECT MAX(numero) FROM sales_invoices WHERE tipo_comprobante = ${tipo} AND punto_venta = ${puntoVenta}), 0) + 1
    )
    ON CONFLICT (tipo_comprobante, punto_venta)
    DO UPDATE SET ultimo_numero = GREATEST(
      invoice_counters.ultimo_numero + 1,
      COALESCE((SELECT MAX(numero) FROM sales_invoices WHERE tipo_comprobante = ${tipo} AND punto_venta = ${puntoVenta}), 0) + 1
    )
    RETURNING ultimo_numero
  `);
  return (result.rows[0] as any).ultimo_numero;
}

/**
 * En producción: consulta AFIP cuál es el último número autorizado
 * y devuelve ese + 1. Actualiza el contador local para mantenerlos sincronizados.
 * Esto garantiza que siempre usamos el número correcto sin importar
 * lo que tenga el contador local (ej. si se usó modo ficticio antes).
 */
async function getNextInvoiceNumberFromAfip(
  tipo: string,
  puntoVenta: number,
  token: string,
  sign: string,
  cuit: string,
  wsfeUrl: string,
  database: BillingDatabase,
  operationId?: string,
): Promise<number> {
  // Defensa en profundidad: este punto ya queda cubierto porque
  // getTokenAuth() (llamado por el único caller, antes de esta función)
  // lanza primero, pero se repite el chequeo acá para que una futura
  // refactorización que reordene o reutilice esta función internamente no
  // pueda saltarse el bloqueo por accidente.
  assertExternalCommAllowed({
    integration: "arca",
    action: `fecomp-ultimo-autorizado-${wsfeUrl.includes("servicios1.afip.gov.ar") ? "produccion" : "homologacion"}`,
  });

  const cbteTipo = TIPOS_CBT_WSFE[tipo] ?? 6;
  const cuitLimpio = cuit.replace(/-/g, "");

  const envelope =
    `<?xml version="1.0" encoding="utf-8"?>` +
    `<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ar="http://ar.gov.afip.dif.FEV1/">` +
    `<soapenv:Body><ar:FECompUltimoAutorizado>` +
    `<ar:Auth><ar:Token>${token}</ar:Token><ar:Sign>${sign}</ar:Sign><ar:Cuit>${cuitLimpio}</ar:Cuit></ar:Auth>` +
    `<ar:PtoVta>${puntoVenta}</ar:PtoVta><ar:CbteTipo>${cbteTipo}</ar:CbteTipo>` +
    `</ar:FECompUltimoAutorizado></soapenv:Body></soapenv:Envelope>`;

  let ultimoAfip: number;
  try {
    const resp = await fetch(wsfeUrl, {
      method: "POST",
      headers: {
        "Content-Type": "text/xml; charset=utf-8",
        SOAPAction: '"http://ar.gov.afip.dif.FEV1/FECompUltimoAutorizado"',
      },
      body: envelope,
      signal: AbortSignal.timeout(10000),
    });
    ultimoAfip = await readLastAuthorizedNumber(resp, { pointOfSale: puntoVenta, documentType: cbteTipo });
  } catch (error: any) {
    if (error instanceof FiscalNumberLookupError) throw error;
    const timedOut = ["TimeoutError", "AbortError"].includes(error?.name);
    throw new FiscalNumberLookupError(timedOut ? 504 : 502, timedOut ? "tiempo de espera agotado" : "conexión no disponible");
  }
  const proximo = ultimoAfip + 1;
  if (operationId) await billingOperationNumber(database, operationId, proximo);

  const occupied = await database.execute(sql`SELECT id,estado,modo_ficticio FROM sales_invoices WHERE tipo_comprobante=${tipo} AND punto_venta=${puntoVenta} AND numero=${proximo} LIMIT 1`);
  if (occupied.rows[0]?.id) throw Object.assign(new Error(`La numeración ${tipo} PV ${puntoVenta}, número ${proximo}, está ocupada por otro registro. No se solicitó autorización. Administración debe revisar esa serie; no vuelvas a emitir ni adelantes el contador.`), {
    statusCode: 409, code: "BILLING_NUMBER_CONFLICT", authorizationRequested: false,
    conflictInvoiceId: occupied.rows[0].id, pointOfSale: puntoVenta, documentType: tipo, number: proximo,
  });
  // The counter is observational in ARCA mode and is never advanced past a conflict.
  await database.execute(sql`
    INSERT INTO invoice_counters(tipo_comprobante,punto_venta,ultimo_numero) VALUES(${tipo},${puntoVenta},${proximo})
    ON CONFLICT(tipo_comprobante,punto_venta) DO UPDATE SET ultimo_numero=${proximo}
  `);

  return proximo;
}

export async function emitirFactura(data: NewInvoiceData): Promise<typeof salesInvoices.$inferSelect> {
  if(!isNonFiscalTipo(data.tipoComprobante)&&data.comprobanteAsociado)fiscalDocumentCode(data.comprobanteAsociado.tipo);
  const collectionError = nonFiscalCollectionError(data.tipoComprobante, data.cashFormaPagoDetalle?.length ? data.cashFormaPagoDetalle.filter(row=>Number(row.amount)>0).map(row=>row.method) : [data.cashFormaPago]);
  if (collectionError) throw Object.assign(new Error(collectionError), {statusCode:400});
  const config=await getBillingConfig();
  if(isNonFiscalTipo(data.tipoComprobante)) return emitirFacturaUnlocked(data,config);
  const environment=(config as any).arcaAmbiente??"ficticio";
  if (!["ficticio", "homologacion", "produccion"].includes(environment)) throw new BillingPreflightError("El ambiente de facturación configurado no es válido. No se emitió ningún comprobante.");
  // Funding never uses ficticio. Preserve the existing synthetic emitter and
  // its independent counters without taking an operational series lock.
  if(environment==="ficticio") return emitirFacturaUnlocked(data,config);
  const issuer=String((config as any).arcaCuit??config.cuit).replace(/\D/g,"");
  const pv=data.puntoVentaOverride??(environment==="homologacion"?(config.puntoVentaHomolog??99):config.puntoVenta);
  assertFinancialSchemaReady();
  data = { ...data, operationId: data.operationId || String(data.creditReapplicationIntent?.operationId || randomUUID()) };
  const identity: FiscalIdentity = { environment, issuer, pointOfSale: Number(pv), type: data.tipoComprobante };
  const c=await pool.connect();
  let locked=false;
  try {
    // Never queue on a series while occupying a pool slot. The successful
    // owner uses THIS connection for all SQL, including WSAA and draft commits.
    const lock=await c.query("SELECT pg_try_advisory_lock(hashtextextended($1,0)) AS locked",
      [`funding-fiscal:${environment}:${issuer}:${data.tipoComprobante}:${pv}`]);
    locked=lock.rows[0]?.locked===true;
    if(!locked) throw Object.assign(new Error("La serie fiscal está ocupada. Reintentá la misma operación."),{statusCode:409});
    if((await c.query("SELECT to_regclass('payment_funding.fiscal_claims') AS table_name")).rows[0].table_name) {
      const pending=await c.query(`SELECT operation_id FROM payment_funding.fiscal_claims
        WHERE status<>'authorized' AND identity->>'environment'=$1 AND identity->>'issuer'=$2
          AND identity->>'tipo'=$3 AND identity->>'puntoVenta'=$4 LIMIT 1`,
        [environment,issuer,data.tipoComprobante,String(pv)]);
      if(pending.rowCount) throw Object.assign(new Error("La serie fiscal tiene una operación de financiación pendiente. Recuperá esa misma operación."),{statusCode:409});
    }
    const database = drizzle(c,{schema});
    let operation: BillingOperation | undefined;
    if (data.recoveryInvoiceId) {
      operation = await operationForInvoice(database, data.recoveryInvoiceId);
      if (operation?.stage === "rejected" || operation?.stage === "corrected") throw Object.assign(new Error("ARCA rechazó este intento. Verificá el rechazo y corregí los datos antes de preparar una nueva emisión."), {statusCode:409,code:"BILLING_CORRECTION_REQUIRED"});
      if (operation && payloadHash(operation.fiscal_identity) !== payloadHash(identity)) throw Object.assign(new Error("El ambiente, emisor o punto de venta cambió desde la emisión original. Conservamos el intento sin reenviarlo."), { statusCode: 409, code: "BILLING_IDENTITY_CHANGED" });
    } else {
      operation = await beginBillingOperation(database, data, identity);
      if (operation.invoice_id) data = { ...data, recoveryInvoiceId: operation.invoice_id };
    }
    try {
      if (!data.recoveryInvoiceId) {
        await assertBillingPoint(config, data.puntoVentaOverride, database);
        const recipientError = fiscalRecipientError(data.tipoComprobante, data.cliente);
        if (recipientError) throw new BillingPreflightError(recipientError);
      }
      return await emitirFacturaUnlocked(data,config,database,operation,identity);
    } catch (error: any) {
      if (operation && ["BILLING_PREFLIGHT_REJECTED", "BILLING_NUMBER_CONFLICT"].includes(error?.code) && !operation.invoice_id) {
        await billingOperationStage(database, operation.operation_id, "blocked", undefined, error.code);
      }
      throw error;
    }
  } finally {
    // Explicit unlock also on throw. Do not return a session lock to the pool.
    try {
      if(locked) await c.query("SELECT pg_advisory_unlock(hashtextextended($1,0))",
        [`funding-fiscal:${environment}:${issuer}:${data.tipoComprobante}:${pv}`]);
      c.release();
    } catch(error) {c.release(error as Error);}
  }
}

async function emitirFacturaUnlocked(data: NewInvoiceData, config: Awaited<ReturnType<typeof getBillingConfig>>, database: BillingDatabase = db, operation?: BillingOperation, fiscalIdentity?: FiscalIdentity): Promise<typeof salesInvoices.$inferSelect> {
  const db = database;
  if (isUnsupportedSaleType(data.tipoComprobante)) {
    throw Object.assign(
      new Error("Este tipo de comprobante no está habilitado para emisión. Utilice Factura A o Factura B."),
      { statusCode: 400 },
    );
  }
  const ambiente = ((config as any).arcaAmbiente ?? "ficticio") as string;
  const esNoFiscal = isNonFiscalTipo(data.tipoComprobante);
  const recoverableFiscalAdjustment = Boolean(data.recoverableCreditNote || data.recoverableDebitNote || data.recoveryInvoiceId);
  // All operational owners are captured in the local draft before ARCA.  The
  // later link is deliberately idempotent, but must never be the only place
  // where ownership is recorded.
  const recoverableBeforeAuthorization = ambiente === "homologacion" || ambiente === "produccion" || recoverableFiscalAdjustment
    || Boolean(data.paymentId)
    || Boolean(data.groupId)
    || Boolean(data.groupPaymentId)
    || Boolean(data.spaAccountId)
    || Boolean(data.groupPaymentIntent)
    || Boolean(data.creditReapplicationIntent);
  if (recoverableBeforeAuthorization) {
    // A recoverable fiscal draft depends on the live sales_invoices recovery
    // columns. Fail before numbering or contacting ARCA when a timed-out
    // incremental migration left production on an older schema.
    assertFinancialSchemaReady();
  }

  const puntoVenta =
    data.puntoVentaOverride ??
    (ambiente === "homologacion"
      ? ((config as any).puntoVentaHomolog ?? 99)
      : config.puntoVenta!);

  const montos = calcularMontos(data.items, data.tipoComprobante);

  let cae: string | null = null;
  let caeFechaVto: Date | null = null;
  let modoFicticio = false;
  let numero = 0;
  let pendingInvoice: typeof salesInvoices.$inferSelect | undefined;

  const insertPendingInvoice = async () => {
    const values: typeof salesInvoices.$inferInsert = {
      tipoComprobante: data.tipoComprobante,
      fiscalIdentity: fiscalIdentity ? { ...fiscalIdentity, operationId: operation?.operation_id } : undefined,
      puntoVenta,
      numero,
      fechaEmision: getArgentinaToday(),
      clienteRazonSocial: data.cliente.razonSocial,
      clienteCuit: data.cliente.cuit || null,
      clienteDni: data.cliente.dni || null,
      clienteDocumentType: data.cliente.documentType || null,
      clienteCondicionIva: data.cliente.condicionIva,
      clienteDomicilio: data.cliente.domicilio || null,
      recipientEntityType: data.recipientEntity?.type || null,
      recipientEntityId: data.recipientEntity?.id || null,
      centerSettlementArea: data.centerSettlementArea || null,
      centerSettlementStatus: data.centerSettlementArea ? "pending" : null,
      montoNeto: String(montos.montoNeto),
      montoIva21: String(montos.montoIva21),
      montoIva105: String(montos.montoIva105),
      montoExento: String(montos.montoExento),
      montoNoGravado: String(montos.montoNoGravado),
      montoTotal: String(montos.montoTotal),
      cae: null,
      caeFechaVto: null,
      modoFicticio,
      estado: "autorizacion_pendiente",
      reservaId: data.reservaId || null,
      paymentId: data.paymentId || null,
      groupId: data.groupId || null,
      groupPaymentId: data.groupPaymentId || null,
      groupPaymentIntent: data.groupPaymentIntent || null,
      creditReapplicationIntent: data.creditReapplicationIntent || null,
      spaAccountId: data.spaAccountId || null,
      restaurantOrderId: data.restaurantOrderId || null,
      folioId: data.folioId || null,
      notaCreditoId: data.facturaOriginalId || null,
      concepto: "2",
      items: data.items as any,
      operador: data.operador || null,
      cashFormaPago: data.cashFormaPago || null,
      cashFormaPagoDetalle: data.cashFormaPagoDetalle ?? null,
      // These are jsonb columns — drizzle-orm serializes them itself. Do NOT
      // JSON.stringify here: doing so stores a jsonb scalar string instead of
      // a jsonb object/array, which silently breaks any SQL-side jsonb_agg()
      // over this column (e.g. the group invoice snapshot's credit rollup).
      sourceChargeIds: data.sourceChargeIds ?? null,
      sourceChargeAmounts: data.sourceChargeAmounts ?? null,
      observaciones: data.observaciones || null,
      reconciliationStatus: "pendiente",
      reconciliationUpdatedAt: new Date(),
    };
    const draft = await db.transaction(async (tx) => {
      await data.beforeDraftInsert?.(tx, values);
      const [inserted] = await tx.insert(salesInvoices).values(values).returning();
      return inserted;
    });
    pendingInvoice = draft;
    if (operation) {
      await billingOperationStage(db, operation.operation_id, "numbered", draft.id);
      operation.invoice_id = draft.id;
    }
    return draft;
  };

  if (data.recoveryInvoiceId) {
    const existing = await db.execute(sql`
      SELECT * FROM sales_invoices
      WHERE id = ${data.recoveryInvoiceId}
        AND estado IN ('autorizacion_pendiente','emitida')
      LIMIT 1
    `);
    if (!existing.rows.length) {
      throw new Error("La NC pendiente ya no está disponible para reintentar su autorización");
    }
    const draft = existing.rows[0] as any;
    if (draft.estado === "emitida") {
      if (operation) await billingOperationStage(db, operation.operation_id, "authorized", Number(draft.id));
      return Object.fromEntries(Object.entries(draft).map(([key,value]) => [key.replace(/_([a-z])/g,(_match,c)=>c.toUpperCase()),value])) as any;
    }
    const storedIdentity = draft.fiscal_identity;
    if (storedIdentity && fiscalIdentity && ["environment","issuer","pointOfSale","type"].some(key => storedIdentity[key] !== (fiscalIdentity as any)[key])) throw Object.assign(new Error("La identidad fiscal del borrador no coincide con la configuración actual."), {statusCode:409,code:"BILLING_IDENTITY_CHANGED"});
    numero = Number(draft.numero);
    if (Number(draft.punto_venta) !== puntoVenta) {
      throw new Error("La NC pendiente tiene un punto de venta distinto al de la factura original");
    }
    pendingInvoice = {
      ...draft,
      id: Number(draft.id),
    } as typeof salesInvoices.$inferSelect;
  }

  if (esNoFiscal) {
    // Comprobantes no fiscales (Ticket, Vouchers, Cierres): nunca llaman a ARCA,
    // solo llevan una numeración local propia por tipo + punto de venta.
    if (!pendingInvoice) numero = await getNextInvoiceNumber(data.tipoComprobante, puntoVenta,db);
    modoFicticio = false;
    if (recoverableBeforeAuthorization && !pendingInvoice) {
      await insertPendingInvoice();
    }
  } else if (ambiente === "homologacion" || ambiente === "produccion") {
    // En producción/homologación: obtener token primero para poder
    // consultar el último número directamente de AFIP
    const { getTokenAuth } = await import("./wsaaClient");
    const cuitAuth = config.arcaCuit || config.cuit || "";
    const { token, sign } = await getTokenAuth(
      config.arcaCert!,
      config.arcaKey!,
      ambiente as "homologacion" | "produccion",
      db,
    );

    const wsfeUrl = ambiente === "produccion"
      ? "https://servicios1.afip.gov.ar/wsfev1/service.asmx"
      : "https://wswhomo.afip.gov.ar/wsfev1/service.asmx";

    // Número sincronizado con AFIP (evita desfasaje por uso previo de modo ficticio)
    if (!pendingInvoice) {
      numero = await getNextInvoiceNumberFromAfip(
        data.tipoComprobante, puntoVenta, token, sign, cuitAuth, wsfeUrl,db,operation?.operation_id
      );
    }

    // Persist every fiscal draft before authorization, including direct sales.
    // A different operation's draft is never deleted to free its number.
    if (recoverableBeforeAuthorization && !pendingInvoice) await insertPendingInvoice();

    // The fiscal dates must use the same Argentina calendar day stored on the invoice.
    const fecha = String(pendingInvoice?.fechaEmision || (pendingInvoice as any)?.fecha_emision || getArgentinaToday()).replace(/-/g, "");

    try {
      const { feCAESolicitar, feCompConsultar } = await import("./wsfevClient");
      // Since RG 4540/19 (2021-04-01), ARCA rejects every NC/ND with error
      // 10197 ("Si el comprobante es Débito o Crédito, enviar estructura
      // CbteAsoc o PeriodoAsoc") unless it can identify the original document
      // it corrects. The caller already has that row loaded (it had to, to
      // build facturaOriginalId in the first place), so it passes the fields
      // directly rather than this doing a second lookup.
      const cbteAsoc = data.comprobanteAsociado
        ? [{
            tipo: data.comprobanteAsociado.tipo,
            puntoVenta: data.comprobanteAsociado.puntoVenta,
            numero: data.comprobanteAsociado.numero,
            cuit: cuitAuth,
            fecha: data.comprobanteAsociado.fecha,
          }]
        : undefined;

      if (operation) await billingOperationStage(db, operation.operation_id, "submitting", pendingInvoice?.id);
      // A pending draft may have been authorized just before a network/process
      // failure. Query ARCA by its already persisted number first; only an
      // explicit "not found" allows a new authorization request.
      const recovered = data.recoveryInvoiceId
        ? await feCompConsultar(
            { tipo: data.tipoComprobante, puntoVenta, numero, cuitEmisor: cuitAuth, token, sign },
            ambiente as "homologacion" | "produccion",
            { total: montos.montoTotal, fecha, docTipo: resolveFiscalRecipientDocument(data.cliente).tipo, docNro: resolveFiscalRecipientDocument(data.cliente).numero },
          )
        : null;
      if (data.recoveryInvoiceId && !recovered && !(pendingInvoice as any)?.fiscalIdentity && !(pendingInvoice as any)?.fiscal_identity) throw Object.assign(new Error("El intento antiguo no tiene ambiente fiscal registrado. ARCA no confirmó una autorización en este ambiente. Requiere revisión antes de reenviarlo."), {statusCode:409,code:"BILLING_LEGACY_IDENTITY_REVIEW"});
      if (data.recoveryInvoiceId && !recovered) {
        await assertBillingPoint(config, data.puntoVentaOverride, db);
        const recipientError = fiscalRecipientError(data.tipoComprobante, data.cliente);
        if (recipientError) throw new BillingPreflightError(recipientError);
      }
      const resultado = recovered ?? await feCAESolicitar(
          {
            tipo: data.tipoComprobante,
            puntoVenta,
            numero,
            cuitEmisor: cuitAuth,
            token,
            sign,
            ...montos,
            clienteCuit: data.cliente.cuit,
            clienteDni: data.cliente.dni,
            clienteDocumentType: data.cliente.documentType,
            clienteCondicionIva: data.cliente.condicionIva,
            fecha,
            cbteAsoc,
          },
          ambiente as "homologacion" | "produccion"
        );
      cae = resultado.cae;
      caeFechaVto = resultado.caeFechaVto;
    } catch (error: any) {
      if (operation) await billingOperationStage(db, operation.operation_id, error?.code === "ARCA_AUTHORIZATION_REJECTED" ? "rejected" : "uncertain", pendingInvoice?.id, error?.code || "ARCA_RESULT_UNCERTAIN");
      if (pendingInvoice) {
        await db.execute(sql`
          UPDATE sales_invoices
          SET reconciliation_error = ${String(error?.message || "No se pudo confirmar la autorización ARCA")},
              reconciliation_updated_at = now()
          WHERE id = ${pendingInvoice.id}
        `);
      }
      throw error;
    }
    modoFicticio = false;
  } else {
    // Modo ficticio: usa contador local, CAE simulado
    if (!pendingInvoice) numero = await getNextInvoiceNumber(data.tipoComprobante, puntoVenta,db);
    modoFicticio = true;
    if (recoverableBeforeAuthorization && !pendingInvoice) {
      await insertPendingInvoice();
    }
    const fake = generateFakeCAE();
    cae = fake.cae;
    caeFechaVto = fake.vencimiento;
  }

  const today = getArgentinaToday();
  if (pendingInvoice) {
    const [finalized] = await db.update(salesInvoices).set({
      cae,
      caeFechaVto: caeFechaVto ? caeFechaVto.toISOString().split("T")[0] : null,
      modoFicticio,
      estado: "emitida",
      reconciliationError: null,
      reconciliationUpdatedAt: new Date(),
    }).where(eq(salesInvoices.id, pendingInvoice.id)).returning();
    if (operation) await billingOperationStage(db, operation.operation_id, "authorized", finalized.id);
    return finalized;
  }

  const finalValues: typeof salesInvoices.$inferInsert = {
    tipoComprobante: data.tipoComprobante,
    puntoVenta,
    numero,
    fechaEmision: today,
    clienteRazonSocial: data.cliente.razonSocial,
    clienteCuit: data.cliente.cuit || null,
    clienteDni: data.cliente.dni || null,
    clienteDocumentType: data.cliente.documentType || null,
    clienteCondicionIva: data.cliente.condicionIva,
    clienteDomicilio: data.cliente.domicilio || null,
    recipientEntityType: data.recipientEntity?.type || null,
    recipientEntityId: data.recipientEntity?.id || null,
    centerSettlementArea: data.centerSettlementArea || null,
    centerSettlementStatus: data.centerSettlementArea ? "pending" : null,
    montoNeto: String(montos.montoNeto),
    montoIva21: String(montos.montoIva21),
    montoIva105: String(montos.montoIva105),
    montoExento: String(montos.montoExento),
    montoNoGravado: String(montos.montoNoGravado),
    montoTotal: String(montos.montoTotal),
    cae,
    caeFechaVto: caeFechaVto ? caeFechaVto.toISOString().split("T")[0] : null,
    modoFicticio,
    estado: "emitida",
    reservaId: data.reservaId || null,
    paymentId: data.paymentId || null,
    groupId: data.groupId || null,
    groupPaymentId: data.groupPaymentId || null,
    groupPaymentIntent: data.groupPaymentIntent || null,
    spaAccountId: data.spaAccountId || null,
    restaurantOrderId: data.restaurantOrderId || null,
    folioId: data.folioId || null,
    notaCreditoId: data.facturaOriginalId || null,
    concepto: "2",
    items: data.items as any,
    operador: data.operador || null,
    cashFormaPago: data.cashFormaPago || null,
    cashFormaPagoDetalle: data.cashFormaPagoDetalle ?? null,
    // See the comment on the other insert above: jsonb columns must receive
    // the raw object/array, not a pre-stringified value.
    sourceChargeIds: data.sourceChargeIds ?? null,
    sourceChargeAmounts: data.sourceChargeAmounts ?? null,
    observaciones: data.observaciones || null,
  };

  try {
    const [factura] = await db.insert(salesInvoices).values(finalValues).returning();
    return factura;
  } catch (err: any) {
    if (err?.code !== "23505") throw err;
    // ARCA already handed back a real CAE for (tipo, punto_venta, numero) — this
    // is never a stale draft to clean up (this non-recoverable path only
    // inserts here, after authorization, so nothing of its own could already
    // be sitting on that number). A matching CAE means an earlier attempt's
    // response never reached the caller (timeout, dropped connection) and
    // this is the exact same invoice: return it instead of erroring out from
    // under a comprobante ARCA has already legitimately issued. Anything else
    // is a genuine anomaly — a different, unrelated invoice already holds
    // this exact number — and must surface for manual review, never be
    // guessed at.
    const existing = await db.execute(sql`
      SELECT * FROM sales_invoices
      WHERE tipo_comprobante = ${data.tipoComprobante} AND punto_venta = ${puntoVenta} AND numero = ${numero}
      LIMIT 1
    `);
    const row = existing.rows[0] as any;
    if (row && row.cae === cae) {
      return row as typeof salesInvoices.$inferSelect;
    }
    throw Object.assign(
      new Error(
        `ARCA autorizó CAE ${cae} para ${data.tipoComprobante} ${puntoVenta}-${numero}, pero ese número ya está ` +
        `ocupado localmente por otro comprobante${row ? ` (id ${row.id}, CAE ${row.cae || "sin CAE"})` : ""}. ` +
        `Requiere revisión manual antes de reintentar — no se descartó nada.`
      ),
      { statusCode: 409 },
    );
  }
}
