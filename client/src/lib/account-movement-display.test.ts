import { describe, expect, it } from "vitest";
import { cleanAccountMovementDescription, cleanCashMovementLabel } from "./account-movement-display";

describe("cleanAccountMovementDescription", () => {
  it("saca el código de reserva de la descripción, dejando el resto legible", () => {
    expect(cleanAccountMovementDescription(
      "Estadía RES-1788973054690-614 — Hab. 903",
      "RES-1788973054690-614",
    )).toBe("Estadía — Hab. 903");
  });

  it("funciona igual con el código corto", () => {
    expect(cleanAccountMovementDescription(
      "Estadía RS-001304 — Hab. 506",
      "RS-001304",
    )).toBe("Estadía — Hab. 506");
  });

  it("sin reservationCode, deja la descripción intacta", () => {
    expect(cleanAccountMovementDescription("Ajuste manual", null)).toBe("Ajuste manual");
    expect(cleanAccountMovementDescription("Ajuste manual", undefined)).toBe("Ajuste manual");
  });

  it("si el código no aparece en la descripción, no rompe nada", () => {
    expect(cleanAccountMovementDescription("Nota de crédito", "RS-001304")).toBe("Nota de crédito");
  });
});

describe("cleanCashMovementLabel", () => {
  it("saca el código feo con timestamp, dejando habitación, huésped y método", () => {
    expect(cleanCashMovementLabel(
      "Reserva RES-1789673588249-724 — Hab. 205 — Cardoso, Angel — Pago tarjeta_credito",
    )).toBe("Hab. 205 — Cardoso, Angel — Pago tarjeta_credito");
  });

  it("saca el código corto también", () => {
    expect(cleanCashMovementLabel(
      "Reserva RS-001304 — Hab. 506 — Pérez, Juan — Pago efectivo",
    )).toBe("Hab. 506 — Pérez, Juan — Pago efectivo");
  });

  it("funciona igual para una anulación", () => {
    expect(cleanCashMovementLabel(
      "Anulación RES-1788973054690-614 — Hab. 903 — Pago tarjeta_credito",
    )).toBe("Hab. 903 — Pago tarjeta_credito");
  });

  it("sin código de reserva, deja la etiqueta intacta", () => {
    expect(cleanCashMovementLabel("Apertura de caja")).toBe("Apertura de caja");
  });

  it("con null o vacío, no rompe", () => {
    expect(cleanCashMovementLabel(null)).toBe("");
    expect(cleanCashMovementLabel(undefined)).toBe("");
    expect(cleanCashMovementLabel("")).toBe("");
  });
});
