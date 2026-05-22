import { getBillingConfig } from "./billingConfig";
import { getTokenAuth } from "./wsaaClient";
import { feCAESolicitar } from "./wsfevClient";

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

export async function callARCA(invoiceData: ARCAInvoiceData): Promise<ARCAResult> {
  const config = await getBillingConfig();
  const ambiente = ((config as any).arcaAmbiente ?? "ficticio") as string;

  if (ambiente === "ficticio") {
    throw new Error("ARCA está en modo ficticio. Cambiar a homologación o producción en Configuración → Facturación.");
  }

  if (!config.arcaCert || !config.arcaKey) {
    throw new Error("Faltan credenciales ARCA. Configurar certificado (.crt) y clave privada (.key) en Configuración → Facturación.");
  }

  const cuitAuth = config.arcaCuit || config.cuit || "";

  const { token, sign } = await getTokenAuth(
    config.arcaCert,
    config.arcaKey,
    ambiente as "homologacion" | "produccion"
  );

  const now = new Date();
  const fecha =
    `${now.getFullYear()}` +
    `${String(now.getMonth() + 1).padStart(2, "0")}` +
    `${String(now.getDate()).padStart(2, "0")}`;

  return feCAESolicitar(
    {
      tipo: invoiceData.tipo,
      puntoVenta: invoiceData.puntoVenta,
      numero: invoiceData.numero,
      cuitEmisor: cuitAuth,
      token,
      sign,
      montoTotal: invoiceData.montoTotal,
      montoNeto: invoiceData.montoNeto,
      montoIva21: invoiceData.montoIva21,
      montoIva105: invoiceData.montoIva105,
      montoExento: invoiceData.montoExento,
      montoNoGravado: invoiceData.montoNoGravado,
      clienteCuit: invoiceData.cliente.cuit,
      clienteCondicionIva: invoiceData.cliente.condicionIva,
      fecha,
    },
    ambiente as "homologacion" | "produccion"
  );
}
