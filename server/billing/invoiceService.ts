import { db } from "../db";
import { sql } from "drizzle-orm";
import { salesInvoices, invoiceCounters } from "@shared/schema";
import { getBillingConfig } from "./billingConfig";
import { generateFakeCAE } from "./fakeArca";
import { callARCA } from "./arcaClient";
import { getArgentinaToday } from "../db-storage";

export interface InvoiceItem {
  descripcion: string;
  cantidad: number;
  precioUnitario: number;
  alicuotaIva: "21" | "10.5" | "exento" | "no_gravado";
  subtotalNeto: number;
  subtotal: number;
}

export interface NewInvoiceData {
  tipoComprobante: "FA" | "FB" | "FC" | "NCA" | "NCB";
  cliente: {
    razonSocial: string;
    cuit?: string;
    dni?: string;
    condicionIva: string;
    domicilio?: string;
  };
  items: InvoiceItem[];
  reservaId?: number;
  folioId?: number;
  facturaOriginalId?: number; // para NC
  operador?: string;
}

const TIPOS_CBT_WSFE: Record<string, number> = { FA: 1, FB: 6, FC: 11, NCA: 3, NCB: 8 };

function calcularMontos(items: InvoiceItem[], tipo: string) {
  let montoNeto = 0;
  let montoIva21 = 0;
  let montoIva105 = 0;
  let montoExento = 0;
  let montoNoGravado = 0;

  for (const item of items) {
    switch (item.alicuotaIva) {
      case "21":
        montoNeto += item.subtotalNeto;
        montoIva21 += item.subtotalNeto * 0.21;
        break;
      case "10.5":
        montoNeto += item.subtotalNeto;
        montoIva105 += item.subtotalNeto * 0.105;
        break;
      case "exento":
        montoExento += item.subtotal;
        break;
      case "no_gravado":
        montoNoGravado += item.subtotal;
        break;
    }
  }

  const montoTotal = montoNeto + montoIva21 + montoIva105 + montoExento + montoNoGravado;
  return {
    montoNeto: round2(montoNeto),
    montoIva21: round2(montoIva21),
    montoIva105: round2(montoIva105),
    montoExento: round2(montoExento),
    montoNoGravado: round2(montoNoGravado),
    montoTotal: round2(montoTotal),
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

  const puntoVenta =
    ambiente === "homologacion"
      ? ((config as any).puntoVentaHomolog ?? 99)
      : config.puntoVenta!;

  const montos = calcularMontos(data.items, data.tipoComprobante);

  let cae: string;
  let caeFechaVto: Date;
  let modoFicticio: boolean;
  let numero: number;

  if (ambiente === "homologacion" || ambiente === "produccion") {
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
    numero = await getNextInvoiceNumberFromAfip(
      data.tipoComprobante, puntoVenta, token, sign, cuitAuth, wsfeUrl
    );

    const { feCAESolicitar } = await import("./wsfevClient");
    const now = new Date();
    const fecha =
      `${now.getFullYear()}` +
      `${String(now.getMonth() + 1).padStart(2, "0")}` +
      `${String(now.getDate()).padStart(2, "0")}`;

    const resultado = await feCAESolicitar(
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
    modoFicticio = false;
  } else {
    // Modo ficticio: usa contador local, CAE simulado
    numero = await getNextInvoiceNumber(data.tipoComprobante, puntoVenta);
    const fake = generateFakeCAE();
    cae = fake.cae;
    caeFechaVto = fake.vencimiento;
    modoFicticio = true;
  }

  const today = getArgentinaToday();

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
    ...Object.fromEntries(
      Object.entries(montos).map(([k, v]) => [k, String(v)])
    ),
    cae,
    caeFechaVto: caeFechaVto.toISOString().split("T")[0],
    modoFicticio,
    estado: "emitida",
    reservaId: data.reservaId || null,
    folioId: data.folioId || null,
    notaCreditoId: data.facturaOriginalId || null,
    concepto: "2",
    items: data.items as any,
    operador: data.operador || null,
  }).returning();

  return factura;
}
