// Tipos de comprobante unificados en todo el sistema (Restaurant, SPA, Grupos, Recepción, Administración).
// Referencia: unificación de comprobantes acordada con el usuario (2026).
//
// Reglas generales:
// - Factura C queda eliminada de TODOS los selectores de venta (el hotel es Responsable Inscripto
//   y no puede emitirla). Sigue existiendo solo del lado de Compras/Administración (facturas de
//   proveedores), que no se toca acá.
// - "Cuenta Corriente" es una condición/método de pago, no un tipo de comprobante — no vive en este archivo.
// - "Nota de Crédito" nunca se ofrece en el selector de cierre/cobro: es una acción separada
//   ("Emitir Comprobante" → Nota de Crédito) que se dispara sobre una factura ya emitida.

export type ReceiptType =
  | "ticket"
  | "factura_a"
  | "factura_b"
  | "factura_c"
  | "nota_credito"
  | "voucher_justo"
  | "voucher_pedidos_ya"
  | "cierre_habitacion"
  | "cierre_spa";

export const RECEIPT_TYPE_LABELS: Record<ReceiptType, string> = {
  ticket: "Ticket",
  factura_a: "Factura A",
  factura_b: "Factura B",
  factura_c: "Factura C",
  nota_credito: "Nota de Crédito",
  voucher_justo: "Voucher Justo",
  voucher_pedidos_ya: "Voucher Pedidos Ya",
  cierre_habitacion: "Cierre de Habitación",
  cierre_spa: "Cierre de SPA",
};

// Comprobantes universales: disponibles en Recepción, Restaurant, SPA y en la emisión final de Grupos.
export const UNIVERSAL_RECEIPT_TYPES: ReceiptType[] = ["factura_a", "factura_b"];

// Comprobantes ofrecidos al momento de cerrar/cobrar una cuenta (sin Nota de Crédito) por sector.
export const RESTAURANT_SALE_RECEIPT_TYPES: ReceiptType[] = [
  "ticket",
  "factura_a",
  "factura_b",
  "voucher_justo",
  "voucher_pedidos_ya",
];

export const SPA_SALE_RECEIPT_TYPES: ReceiptType[] = ["cierre_spa", "factura_a", "factura_b"];

export const RECEPCION_SALE_RECEIPT_TYPES: ReceiptType[] = ["cierre_habitacion", "factura_a", "factura_b"];

export const GRUPOS_SALE_RECEIPT_TYPES: ReceiptType[] = ["factura_a", "factura_b"];

// Comprobantes disponibles en el botón "Emitir Comprobante" de cada sector (incluye Nota de Crédito).
export const RESTAURANT_EMITIR_RECEIPT_TYPES: ReceiptType[] = [...RESTAURANT_SALE_RECEIPT_TYPES, "nota_credito"];
export const SPA_EMITIR_RECEIPT_TYPES: ReceiptType[] = [...SPA_SALE_RECEIPT_TYPES, "nota_credito"];
export const RECEPCION_EMITIR_RECEIPT_TYPES: ReceiptType[] = [...RECEPCION_SALE_RECEIPT_TYPES, "nota_credito"];

// Códigos cortos usados por el motor real de AFIP (EmitirFacturaDialog / invoiceService).
export type FiscalTipoCorto = "FA" | "FB" | "FC";

// Tipos habilitados para venta (sin Factura C) — usar como `allowedTipos` en EmitirFacturaDialog
// desde Restaurant, SPA, Grupos y Recepción.
export const FISCAL_TIPOS_VENTA: FiscalTipoCorto[] = ["FA", "FB"];

export function receiptTypeLabel(type: string): string {
  return RECEIPT_TYPE_LABELS[type as ReceiptType] ?? type;
}
