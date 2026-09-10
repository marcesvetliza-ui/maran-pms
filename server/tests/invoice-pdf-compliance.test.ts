import { describe, expect, it } from "vitest";
import { buildArcaQrUrl, getInvoicePaymentAmounts, getInvoiceRecipientDocument } from "../billing/invoicePdf";
import { isUnsupportedSaleType } from "../billing/invoiceService";
import { resolveFiscalRecipientDocument } from "../billing/fiscalDocument";
import { buildIvaBlock } from "../billing/wsfevClient";
import { calcularMontos } from "../billing/invoiceService";

function decodeQrPayload(url: string) {
  const encoded = new URL(url).searchParams.get("p");
  if (!encoded) throw new Error("QR payload missing");
  return JSON.parse(Buffer.from(encoded, "base64").toString("utf8"));
}

describe("ARCA invoice PDF compliance", () => {
  it("builds the official QR payload for Factura B with CUIT recipient", () => {
    const url = buildArcaQrUrl({
      tipo_comprobante: "FB",
      punto_venta: 4,
      numero: 123,
      fecha_emision: "2026-09-10",
      cliente_cuit: "30-12345678-9",
      monto_total: "1210.50",
      cae: "74123456789012",
    }, {
      cuit: "33-68110008-9",
    });

    expect(url).toMatch(/^https:\/\/www\.afip\.gob\.ar\/fe\/qr\/\?p=/);
    expect(decodeQrPayload(url!)).toEqual({
      ver: 1,
      fecha: "2026-09-10",
      cuit: 33681100089,
      ptoVta: 4,
      tipoCmp: 6,
      nroCmp: 123,
      importe: 1210.5,
      moneda: "PES",
      ctz: 1,
      tipoDocRec: 80,
      nroDocRec: 30123456789,
      tipoCodAut: "E",
      codAut: 74123456789012,
    });
  });

  it("uses DNI or consumidor final identification consistently", () => {
    expect(getInvoiceRecipientDocument({ cliente_dni: "12.345.678" }))
      .toEqual({ tipoDocRec: 96, nroDocRec: 12345678 });
    expect(getInvoiceRecipientDocument({}))
      .toEqual({ tipoDocRec: 99, nroDocRec: 0 });
    expect(resolveFiscalRecipientDocument({ dni: "12.345.678" }))
      .toEqual({ tipo: 96, numero: "12345678" });
  });

  it("keeps A and B enabled while blocking unsupported C and tourism sales", () => {
    expect(isUnsupportedSaleType("FA")).toBe(false);
    expect(isUnsupportedSaleType("FB")).toBe(false);
    expect(isUnsupportedSaleType("FC")).toBe(true);
    expect(isUnsupportedSaleType("FT")).toBe(true);
    expect(isUnsupportedSaleType("NCT")).toBe(true);
  });

  it("preserves separate WSFE bases for mixed 21% and 10.5% VAT", () => {
    const totals = calcularMontos([
      { descripcion: "Servicio 21", cantidad: 1, precioUnitario: 121, alicuotaIva: "21", subtotalNeto: 100, subtotal: 121 },
      { descripcion: "Servicio 10.5", cantidad: 1, precioUnitario: 110.5, alicuotaIva: "10.5", subtotalNeto: 100, subtotal: 110.5 },
    ], "FB");
    expect(totals).toMatchObject({
      montoNeto21: 100,
      montoNeto105: 100,
      montoIva21: 21,
      montoIva105: 10.5,
    });
    expect(buildIvaBlock(
      totals.montoNeto21,
      totals.montoIva21,
      totals.montoNeto105,
      totals.montoIva105,
    )).toContain("<ar:Id>5</ar:Id><ar:BaseImp>100.00</ar:BaseImp>");
    expect(buildIvaBlock(
      totals.montoNeto21,
      totals.montoIva21,
      totals.montoNeto105,
      totals.montoIva105,
    )).toContain("<ar:Id>4</ar:Id><ar:BaseImp>100.00</ar:BaseImp>");
  });

  it("renders legacy single-payment invoices under their actual payment method", () => {
    expect(getInvoicePaymentAmounts("efectivo", null, 125000)).toMatchObject({
      efectivo: 125000,
      transferencia: 0,
      cuenta_corriente: 0,
    });
    expect(getInvoicePaymentAmounts("cuenta_corriente", null, 125000)).toMatchObject({
      efectivo: 0,
      transferencia: 0,
      cuenta_corriente: 125000,
    });
  });

  it("distributes split invoice payments across their PDF cells", () => {
    expect(getInvoicePaymentAmounts("pago_dividido", [
      { method: "adelanto", amount: 20000 },
      { method: "efectivo", amount: 50000 },
      { method: "tarjeta_credito", amount: 75000 },
    ], 145000)).toMatchObject({
      adelanto: 20000,
      efectivo: 50000,
      tarjeta: 75000,
      transferencia: 0,
      cuenta_corriente: 0,
    });
  });
});