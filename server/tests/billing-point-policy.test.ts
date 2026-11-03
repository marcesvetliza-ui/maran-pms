import { describe, it, expect, vi } from "vitest";
import { billingPointOptions, billingPointError, validPointNumber } from "../../shared/billing-point-of-sale";
import { assertBillingPoint, fiscalRecipientError } from "../billing/preflight";
describe("Puntos de venta fiscales", () => {
  it("espera la configuración y no ofrece un PV operativo en homologación", () => {
    expect(billingPointOptions(undefined, [{ numero: 21 }])).toEqual([]);
    const config = { arcaAmbiente: "homologacion", puntoVenta: 1, puntoVentaHomolog: 5 };
    expect(billingPointOptions(config, [{ numero: 21 }]).map(point => point.numero)).toEqual([5]);
    expect(billingPointError(config, [], 21)).toContain("homologación");
    expect(billingPointError(config, [], 5)).toBeNull();
  });
  it.each([0, -1, 1.5, 100000, "5resto", "", null, undefined, NaN])("rechaza puntos malformados: %s", point => expect(validPointNumber(point)).toBeNull());
  it("no revive un punto desactivado por el fallback de configuración", () => {
    expect(billingPointOptions({ puntoVenta: 1, arcaAmbiente: "produccion" }, [{ numero: 1, activo: false }])).toEqual([]);
  });
  it("rechaza un override inválido antes de consultas de numeración o autorización", async () => {
    const execute = vi.fn();
    await expect(assertBillingPoint({ arcaAmbiente: "homologacion", puntoVentaHomolog: 5 }, 21, { execute })).rejects.toMatchObject({ code: "BILLING_PREFLIGHT_REJECTED", authorizationRequested: false });
    expect(execute).not.toHaveBeenCalled();
  });
});
describe("Receptor fiscal previo a ARCA", () => {
  it("explica A/Exento y mantiene B para el mismo receptor", () => {
    const recipient = { razonSocial: "Institución", cuit: "30717698130", condicionIva: "Exento" };
    expect(fiscalRecipientError("FA", recipient)).toContain("Factura B");
    expect(fiscalRecipientError("FB", recipient)).toBeNull();
  });
  it("rechaza condición desconocida y CUIT incompleto", () => {
    expect(fiscalRecipientError("FB", { razonSocial: "Cliente", condicionIva: "otra" })).toContain("condición");
    expect(fiscalRecipientError("FA", { razonSocial: "Cliente", condicionIva: "responsable_inscripto", cuit: "123" })).toContain("11 dígitos");
  });
});
