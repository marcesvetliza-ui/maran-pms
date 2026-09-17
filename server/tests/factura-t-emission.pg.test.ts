/**
 * Tests for Factura T (turismo) end-to-end emission
 *
 * Factura T (and its Nota de Crédito/Débito T) used to be hard-blocked by
 * isUnsupportedSaleType regardless of how eligible the reservation was — the
 * business rules (foreign guest + accommodation), the AFIP type codes, the
 * PDF header and even the client's folioContext payload were already built;
 * only the actual ARCA payload (document type resolution) and the switch
 * itself were missing. These tests exercise emitirFactura() directly in
 * modo ficticio (no ARCA call, no mocking needed) against a real Postgres
 * database to confirm the persisted row carries the right data end-to-end.
 */

import pg from "pg";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

const runIfDatabaseIsConfigured = process.env.DATABASE_URL ? describe : describe.skip;
const pool = process.env.DATABASE_URL
  ? new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 2 })
  : null;

const { emitirFactura, buildComprobanteAsociado } = await import("../billing/invoiceService");

const MARKER = "factura-t-emission-pg-test";

const baseItem = {
  descripcion: "Alojamiento",
  cantidad: 1,
  precioUnitario: 50000,
  alicuotaIva: "no_gravado" as const,
  subtotalNeto: 0,
  subtotal: 50000,
};

async function cleanup() {
  if (!pool) return;
  await pool.query("DELETE FROM sales_invoices WHERE observaciones = $1", [MARKER]);
}

runIfDatabaseIsConfigured("Factura T — emisión end-to-end", () => {
  beforeAll(async () => {
    if (pool) await pool.query("SELECT 1");
  });

  afterEach(cleanup);
  afterAll(async () => {
    await cleanup();
    await pool?.end();
  });

  it("emite una Factura T con receptor por pasaporte y guarda el tipo de documento", async () => {
    const invoice = await emitirFactura({
      tipoComprobante: "FT",
      cliente: {
        razonSocial: "John Foreign Tourist",
        dni: "AB123456",
        documentType: "passport",
        condicionIva: "no_categorizado",
      },
      items: [baseItem],
      observaciones: MARKER,
    });

    expect(invoice.estado).toBe("emitida");
    expect(invoice.tipoComprobante).toBe("FT");
    expect((invoice as any).clienteDocumentType).toBe("passport");
    expect((invoice as any).clienteDni).toBe("AB123456");
    // FT no discrimina IVA: todo el importe es "no gravado" a los fines de ARCA.
    expect(Number(invoice.montoNoGravado)).toBe(50000);
    expect(Number(invoice.montoIva21)).toBe(0);
    expect(invoice.cae).toBeTruthy();
  });

  it("permite emitir una Nota de Crédito T contra una Factura T", async () => {
    const original = await emitirFactura({
      tipoComprobante: "FT",
      cliente: {
        razonSocial: "Jane Foreign Tourist",
        dni: "CD654321",
        documentType: "passport",
        condicionIva: "no_categorizado",
      },
      items: [baseItem],
      observaciones: MARKER,
    });

    const nc = await emitirFactura({
      tipoComprobante: "NCT",
      cliente: {
        razonSocial: "Jane Foreign Tourist",
        dni: "CD654321",
        documentType: "passport",
        condicionIva: "no_categorizado",
      },
      items: [baseItem],
      facturaOriginalId: original.id,
      comprobanteAsociado: buildComprobanteAsociado(original),
      observaciones: MARKER,
    });

    expect(nc.estado).toBe("emitida");
    expect(nc.tipoComprobante).toBe("NCT");
    expect((nc as any).clienteDocumentType).toBe("passport");
  });

  it("sigue bloqueando Factura C (no implementada)", async () => {
    await expect(emitirFactura({
      tipoComprobante: "FC",
      cliente: {
        razonSocial: "Monotributista SRL",
        dni: "30111222",
        condicionIva: "monotributista",
      },
      items: [baseItem],
      observaciones: MARKER,
    })).rejects.toThrow(/no está habilitado para emisión/);
  });
});
