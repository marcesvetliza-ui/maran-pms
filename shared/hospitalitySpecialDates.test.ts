import { describe, it, expect } from "vitest";
import {
  birthdayEmail,
  birthdayWhatsappNumber,
  defaultBirthdayTemplate,
  renderBirthdayMessage,
  unknownBirthdayVariables,
} from "./hospitalitySpecialDates";
describe("Birthday messages", () => {
  it("personalizes the saved benefit, terms and signature without changing the guest name", () => {
    const value = renderBirthdayMessage(
      {
        ...defaultBirthdayTemplate,
        benefit: "Beneficio configurable",
        terms: "Con reserva previa",
        signature: "Maran",
      },
      { firstName: "María", lastName: "Pérez" },
    );
    expect(value.subject).toContain("María");
    expect(value.body).toContain("Beneficio configurable");
    expect(value.body).toContain("Con reserva previa");
    expect(value.body).not.toContain("{nombre}");
  });
  it("detects unknown variables and strips header line breaks from guest data", () => {
    expect(
      unknownBirthdayVariables({
        ...defaultBirthdayTemplate,
        body: "Hola {inventada}",
      }),
    ).toEqual(["inventada"]);
    expect(
      renderBirthdayMessage(defaultBirthdayTemplate, {
        firstName: "Nombre\r\nBcc: extraño",
        lastName: "",
      }).subject,
    ).not.toMatch(/[\r\n]/);
  });
  it("normalizes emails for deduplication and rejects malformed addresses", () => {
    expect(birthdayEmail(" EJEMPLO@EXAMPLE.COM ")).toBe("ejemplo@example.com");
    for (const value of [
      null,
      "",
      "no-email",
      "a@b",
      "a@b.com\nb@c.com",
      "<a@b.com>",
      "a,b@example.com",
      "a;b@example.com",
    ])
      expect(birthdayEmail(value)).toBe(null);
  });
  it("prepares explicit international WhatsApp numbers without inventing a country code", () => {
    expect(birthdayWhatsappNumber("+54 9 343 5000000")).toBe("5493435000000");
    expect(birthdayWhatsappNumber("0054 9 343 5000000")).toBe("5493435000000");
    expect(birthdayWhatsappNumber("3435000000")).toBe(null);
  });
});
