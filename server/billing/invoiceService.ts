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

async function getNextInvoiceNumber(tipo: string, puntoVenta: number): Promise<number> {
  // Transactional — use raw SQL with FOR UPDATE to avoid race conditions
  const result = await db.execute(sql`
    INSERT INTO invoice_counters (tipo_comprobante, punto_venta, ultimo_numero)
    VALUES (${tipo}, ${puntoVenta}, 1)
    ON CONFLICT (tipo_comprobante, punto_venta)
    DO UPDATE SET ultimo_numero = invoice_counters.ultimo_numero + 1
    RETURNING ultimo_numero
  `);
  return (result.rows[0] as any).ultimo_numero;
}

export async function emitirFactura(data: NewInvoiceData): Promise<typeof salesInvoices.$inferSelect> {
  const config = await getBillingConfig();
  const ambiente = ((config as any).arcaAmbiente ?? "ficticio") as string;

  // Use separate punto de venta for homologacion to avoid numbering collisions
  const puntoVenta =
    ambiente === "homologacion"
      ? ((config as any).puntoVentaHomolog ?? 99)
      : config.puntoVenta!;

  const numero = await getNextInvoiceNumber(data.tipoComprobante, puntoVenta);
  const montos = calcularMontos(data.items, data.tipoComprobante);

  let cae: string;
  let caeFechaVto: Date;
  let modoFicticio: boolean;

  if (ambiente === "homologacion" || ambiente === "produccion") {
    const resultado = await callARCA({
      tipo: data.tipoComprobante,
      puntoVenta,
      numero,
      ...montos,
      cliente: {
        cuit: data.cliente.cuit,
        condicionIva: data.cliente.condicionIva,
      },
    });
    cae = resultado.cae;
    caeFechaVto = resultado.caeFechaVto;
    modoFicticio = false;
  } else {
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
