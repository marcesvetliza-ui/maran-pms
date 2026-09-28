import { describe, expect, it } from "vitest";
import { classifyReservationPaymentMethod, normalizeToSpanishPaymentMethod } from "../payment-method";

describe("reservation payment method classification", () => {
  it.each(["cargo_habitacion", "room_charge"])(
    "normalizes %s as a room charge",
    (method) => {
      expect(classifyReservationPaymentMethod(method)).toMatchObject({
        method: "room_charge",
        informational: false,
      });
    },
  );

  it.each(["retencion_iibb", "retencion_ganancias", "retencion_iva"])(
    "treats %s as informational — it settles the balance but never reached Caja",
    (method) => {
      expect(classifyReservationPaymentMethod(method)).toMatchObject({
        method,
        informational: true,
      });
    },
  );
});

describe("normalizeToSpanishPaymentMethod", () => {
  // Un anticipo cargado desde el flujo de pagos de grupo (group-detail.tsx,
  // GROUP_CAJA_TENDER_METHODS) guarda la grafía en inglés — es un alias
  // válido en todo el sistema salvo en el validador de la factura fiscal,
  // que rompía con "Forma de pago inválida: transfer" al intentar aplicarlo.
  it.each([
    ["cash", "efectivo"],
    ["transfer", "transferencia"],
    ["credit_card", "tarjeta_credito"],
    ["debit_card", "tarjeta_debito"],
    ["current_account", "cuenta_corriente"],
    ["check", "cheque"],
  ])("traduce el alias en inglés %s a %s", (english, spanish) => {
    expect(normalizeToSpanishPaymentMethod(english)).toBe(spanish);
  });

  it("deja intacta una grafía en español ya válida", () => {
    expect(normalizeToSpanishPaymentMethod("tarjeta_credito")).toBe("tarjeta_credito");
    expect(normalizeToSpanishPaymentMethod("mercadopago")).toBe("mercadopago");
  });

  it("no toca un valor sin alias conocido (ej. una retención)", () => {
    expect(normalizeToSpanishPaymentMethod("retencion_iibb")).toBe("retencion_iibb");
  });
});