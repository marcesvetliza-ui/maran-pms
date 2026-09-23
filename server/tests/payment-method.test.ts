import { describe, expect, it } from "vitest";
import { classifyReservationPaymentMethod } from "../payment-method";

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