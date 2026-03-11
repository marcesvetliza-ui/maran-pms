import { getBillingConfig } from "./billingConfig";

export interface ARCAInvoiceData {
  tipo: string;
  puntoVenta: number;
  numero: number;
  montoTotal: number;
  montoNeto: number;
  montoIva21: number;
  montoIva105: number;
  montoExento: number;
  montoNoGravado: number;
  cliente: {
    cuit?: string;
    condicionIva: string;
  };
}

export interface ARCAResult {
  cae: string;
  caeFechaVto: Date;
}

// Códigos de tipo de comprobante ARCA
const TIPOS_COMPROBANTE: Record<string, number> = {
  FA: 1,
  FB: 6,
  FC: 11,
  NCA: 3,
  NCB: 8,
};

const CONDICION_IVA: Record<string, number> = {
  "Responsable Inscripto": 1,
  Monotributista: 6,
  Exento: 4,
  "Consumidor Final": 5,
};

export async function callARCA(invoiceData: ARCAInvoiceData): Promise<ARCAResult> {
  const config = await getBillingConfig();

  if (!config.modoArca) {
    throw new Error("ARCA está desactivado. Activar en Configuración → Facturación.");
  }

  if (!config.arcaCert || !config.arcaKey) {
    throw new Error("Faltan credenciales ARCA. Configurar certificado y clave privada.");
  }

  // Placeholder — implementar cuando se active modo ARCA
  throw new Error(
    "Integración ARCA no implementada. El modo ficticio está disponible para pruebas."
  );
}
