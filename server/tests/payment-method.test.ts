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
});