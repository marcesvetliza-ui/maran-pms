import { describe, expect, it } from "vitest";
import { resolveBillingPoint } from "./billing-point-of-sale";

const restaurant = [{ numero: 24, activo: true, tipo: "electronico" }];
describe("Resolución del punto para nuevas solicitudes fiscales", () => {
  it.each([24, 23])(
    "usa exclusivamente el punto homologado, no el operativo %s", operationalPoint => {
      const result = resolveBillingPoint({ arcaAmbiente: "homologacion", puntoVentaHomolog: 5 }, [{ numero: operationalPoint }], operationalPoint);
      expect(result.point).toBe(5);
      expect(result.options.map(p => p.numero)).toEqual([5]);
      expect(result.error).toBeNull();
    });
  it.each([undefined, null, 0, -1, 100000])("no sustituye una configuración homologada inválida: %s", point => {
    const result = resolveBillingPoint({ arcaAmbiente: "homologacion", puntoVentaHomolog: point }, restaurant, 24);
    expect(result.point).toBeNull();
    expect(result.error).toBeTruthy();
  });
  it("espera la configuración en lugar de enviar el punto operativo", () => {
    expect(resolveBillingPoint(undefined, restaurant, 24)).toMatchObject({ error: expect.any(String), options: [] });
  });
  it("conserva el punto electrónico elegido en producción", () => {
    expect(resolveBillingPoint({ arcaAmbiente: "produccion" }, restaurant, 24)).toMatchObject({ point: 24, error: null });
  });
  it("rechaza puntos manuales, deshabilitados y selecciones de otra área", () => {
    for (const points of [[{ numero: 24, tipo: "manual" }], [{ numero: 24, activo: false }]]) {
      expect(resolveBillingPoint({ arcaAmbiente: "produccion" }, points, 24).error).toBeTruthy();
    }
    expect(resolveBillingPoint({ arcaAmbiente: "produccion" }, restaurant, 21).error).toBeTruthy();
  });
  it("no altera los objetos originales ni una solicitud retenida", () => {
    const config = Object.freeze({ arcaAmbiente: "homologacion", puntoVentaHomolog: 5 });
    const retained = Object.freeze({ puntoVenta: 24 });
    resolveBillingPoint(config, restaurant, retained.puntoVenta);
    expect(retained.puntoVenta).toBe(24);
    expect(restaurant[0].numero).toBe(24);
  });
});
