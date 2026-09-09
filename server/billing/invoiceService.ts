import { db } from "../db";
import { eq, sql } from "drizzle-orm";
import { salesInvoices, invoiceCounters } from "@shared/schema";
import { getBillingConfig } from "./billingConfig";
import { generateFakeCAE } from "./fakeArca";
import { callARCA } from "./arcaClient";
import { getArgentinaToday } from "../db-storage";
import { assertFinancialSchemaReady } from "../migrate";

export interface InvoiceItem {
  descripcion: string;
  cantidad: number;
  precioUnitario: number;
  alicuotaIva: "21" | "10.5" | "exento" | "no_gravado";
  subtotalNeto: number;
  subtotal: number;
}

export type NonFiscalTipo = "ticket" | "voucher_justo" | "voucher_pedidos_ya" | "cierre_habitacion" | "cierre_spa";

export const NON_FISCAL_TIPOS: NonFiscalTipo[] = [
  "ticket", "voucher_justo", "voucher_pedidos_ya", "cierre_habitacion", "cierre_spa",
];

export interface NewInvoiceData {
  tipoComprobante: "FA" | "FB" | "FC" | "FT" | "FM" | "NCA" | "NCB" | "NCC" | "NCT" | "NCM" | "NDA" | "NDB" | "NDT" | "NDM" | "NDC" | NonFiscalTipo;
  cliente: {
    razonSocial: string;
    cuit?: string;
    dni?: string;
    condicionIva: string;
    domicilio?: string;
  };
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
  folioId?: number;
  facturaOriginalId?: number; // para NC
  operador?: string;
  puntoVentaOverride?: number; // PV específico del área; si está presente, ignora billing_config.puntoVenta
  cashFormaPago?: string; // forma de pago para registrar en el comprobante
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
  FA: 1, FB: 6, FC: 11, FT: 195, FM: 201,
  NCA: 3, NCB: 8, NCC: 13, NCT: 197, NCM: 203,
  NDA: 2, NDB: 7, NDT: 196, NDM: 202, NDC: 12,
};

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

/** Contador local — solo se usa en modo ficticio y homologación */
async function getNextInvoiceNumber(tipo: string, puntoVenta: number): Promise<number> {
  const result = await db.execute(sql`
    INSERT INTO invoice_counters (tipo_comprobante, punto_venta, ultimo_numero)
    VALUES (${tipo}, ${puntoVenta}, 1)
    ON CONFLICT (tipo_comprobante, punto_venta)
    DO UPDATE SET ultimo_numero = invoice_counters.ultimo_numero + 1
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
  wsfeUrl: string
): Promise<number> {
  const cbteTipo = TIPOS_CBT_WSFE[tipo] ?? 6;
  const cuitLimpio = cuit.replace(/-/g, "");

  const envelope =
    `<?xml version="1.0" encoding="utf-8"?>` +
    `<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ar="http://ar.gov.afip.dif.FEV1/">` +
    `<soapenv:Body><ar:FECompUltimoAutorizado>` +
    `<ar:Auth><ar:Token>${token}</ar:Token><ar:Sign>${sign}</ar:Sign><ar:Cuit>${cuitLimpio}</ar:Cuit></ar:Auth>` +
    `<ar:PtoVta>${puntoVenta}</ar:PtoVta><ar:CbteTipo>${cbteTipo}</ar:CbteTipo>` +
    `</ar:FECompUltimoAutorizado></soapenv:Body></soapenv:Envelope>`;

  const resp = await fetch(wsfeUrl, {
    method: "POST",
    headers: {
      "Content-Type": "text/xml; charset=utf-8",
      SOAPAction: '"http://ar.gov.afip.dif.FEV1/FECompUltimoAutorizado"',
    },
    body: envelope,
    signal: AbortSignal.timeout(10000),
  });
  const text = await resp.text();
  const nroM = text.match(/<CbteNro>(\d+)<\/CbteNro>/);
  const ultimoAfip = nroM ? Number(nroM[1]) : 0;
  const proximo = ultimoAfip + 1;

  // Sincronizar contador local con AFIP
  await db.execute(sql`
    INSERT INTO invoice_counters (tipo_comprobante, punto_venta, ultimo_numero)
    VALUES (${tipo}, ${puntoVenta}, ${proximo})
    ON CONFLICT (tipo_comprobante, punto_venta)
    DO UPDATE SET ultimo_numero = ${proximo}
  `);

  return proximo;
}

export async function emitirFactura(data: NewInvoiceData): Promise<typeof salesInvoices.$inferSelect> {
  const config = await getBillingConfig();
  const ambiente = ((config as any).arcaAmbiente ?? "ficticio") as string;
  const esNoFiscal = (NON_FISCAL_TIPOS as string[]).includes(data.tipoComprobante);
  const recoverableFiscalAdjustment = Boolean(data.recoverableCreditNote || data.recoverableDebitNote || data.recoveryInvoiceId);
  // All operational owners are captured in the local draft before ARCA.  The
  // later link is deliberately idempotent, but must never be the only place
  // where ownership is recorded.
  const recoverableBeforeAuthorization = recoverableFiscalAdjustment
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
      puntoVenta,
      numero,
      fechaEmision: getArgentinaToday(),
      clienteRazonSocial: data.cliente.razonSocial,
      clienteCuit: data.cliente.cuit || null,
      clienteDni: data.cliente.dni || null,
      clienteCondicionIva: data.cliente.condicionIva,
      clienteDomicilio: data.cliente.domicilio || null,
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
    return draft;
  };

  if (data.recoveryInvoiceId) {
    const existing = await db.execute(sql`
      SELECT * FROM sales_invoices
      WHERE id = ${data.recoveryInvoiceId}
        AND estado = 'autorizacion_pendiente'
        AND reconciliation_status = 'pendiente'
      LIMIT 1
    `);
    if (!existing.rows.length) {
      throw new Error("La NC pendiente ya no está disponible para reintentar su autorización");
    }
    const draft = existing.rows[0] as any;
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
    if (!pendingInvoice) numero = await getNextInvoiceNumber(data.tipoComprobante, puntoVenta);
    modoFicticio = false;
  } else if (ambiente === "homologacion" || ambiente === "produccion") {
    // En producción/homologación: obtener token primero para poder
    // consultar el último número directamente de AFIP
    const { getTokenAuth } = await import("./wsaaClient");
    const cuitAuth = config.arcaCuit || config.cuit || "";
    const { token, sign } = await getTokenAuth(
      config.arcaCert!,
      config.arcaKey!,
      ambiente as "homologacion" | "produccion"
    );

    const wsfeUrl = ambiente === "produccion"
      ? "https://servicios1.afip.gov.ar/wsfev1/service.asmx"
      : "https://wswhomo.afip.gov.ar/wsfev1/service.asmx";

    // Número sincronizado con AFIP (evita desfasaje por uso previo de modo ficticio)
    if (!pendingInvoice) {
      numero = await getNextInvoiceNumberFromAfip(
        data.tipoComprobante, puntoVenta, token, sign, cuitAuth, wsfeUrl
      );
    }

    // The draft must exist before the outbound ARCA call. If the process stops
    // after ARCA authorizes it, the original invoice, its exact charge mapping
    // and a resolvable pending NC are already stored locally.
    if (recoverableBeforeAuthorization && !pendingInvoice) {
      await insertPendingInvoice();
    }

    const now = new Date();
    const fecha =
      `${now.getFullYear()}` +
      `${String(now.getMonth() + 1).padStart(2, "0")}` +
      `${String(now.getDate()).padStart(2, "0")}`;

    try {
      const { feCAESolicitar, feCompConsultar } = await import("./wsfevClient");
      // A pending draft may have been authorized just before a network/process
      // failure. Query ARCA by its already persisted number first; only an
      // explicit "not found" allows a new authorization request.
      const recovered = data.recoveryInvoiceId
        ? await feCompConsultar(
            { tipo: data.tipoComprobante, puntoVenta, numero, cuitEmisor: cuitAuth, token, sign },
            ambiente as "homologacion" | "produccion"
          )
        : null;
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
            clienteCondicionIva: data.cliente.condicionIva,
            fecha,
          },
          ambiente as "homologacion" | "produccion"
        );
      cae = resultado.cae;
      caeFechaVto = resultado.caeFechaVto;
    } catch (error: any) {
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
    if (!pendingInvoice) numero = await getNextInvoiceNumber(data.tipoComprobante, puntoVenta);
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
    return finalized;
  }

  const [factura] = await db.insert(salesInvoices).values({
    tipoComprobante: data.tipoComprobante,
    puntoVenta,
    numero,
    fechaEmision: today,
    clienteRazonSocial: data.cliente.razonSocial,
    clienteCuit: data.cliente.cuit || null,
    clienteDni: data.cliente.dni || null,
    clienteCondicionIva: data.cliente.condicionIva,
    clienteDomicilio: data.cliente.domicilio || null,
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
    // See the comment on the other insert above: jsonb columns must receive
    // the raw object/array, not a pre-stringified value.
    sourceChargeIds: data.sourceChargeIds ?? null,
    sourceChargeAmounts: data.sourceChargeAmounts ?? null,
    observaciones: data.observaciones || null,
  }).returning();

  return factura;
}
