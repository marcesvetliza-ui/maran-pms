import { expect, it, vi } from "vitest";
vi.mock("../billing/billingConfig", () => ({
  getBillingConfig: vi.fn(async () => ({
    arcaAmbiente: "produccion",
    arcaCuit: "30-12345678-9",
    puntoVenta: 7,
    puntoVentaHomolog: 5,
  })),
}));
import { emitirFactura } from "../billing/invoiceService";
it("refuses a changed fiscal environment before calling ARCA or creating a replacement document", async () => {
  await expect(
    emitirFactura({
      tipoComprobante: "FB",
      expectedFiscalIdentity: {
        environment: "homologacion",
        issuer: "30123456789",
        pointOfSale: 5,
      },
      puntoVentaOverride: 5,
      cliente: {
        razonSocial: "Synthetic Guest",
        condicionIva: "consumidor_final",
      },
      items: [
        {
          descripcion: "Anticipo",
          cantidad: 1,
          precioUnitario: 100,
          alicuotaIva: "21",
          subtotalNeto: 100,
          subtotal: 121,
        },
      ],
    }),
  ).rejects.toMatchObject({
    code: "BILLING_IDENTITY_CHANGED",
    statusCode: 409,
  });
});
