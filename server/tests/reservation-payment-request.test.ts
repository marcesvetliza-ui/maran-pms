import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { assertPaymentRequestMatches, parseReservationPaymentRequest } from "../reservationPaymentRequest";

describe("reservation payment request identity", () => {
  it("preserves the legacy contract when no operation ID was sent", () => {
    expect(parseReservationPaymentRequest({ amount: "100" }, "admin")).toBeUndefined();
  });
  it("rejects malformed operation IDs", () => {
    for (const value of ["", "abc", null, {}, 123]) {
      expect(() => parseReservationPaymentRequest({ paymentRequestId: value }, "admin"))
        .toThrow("Identificador de operación");
    }
  });
  it("fingerprints content independently of object property order", () => {
    const id = randomUUID();
    const first = parseReservationPaymentRequest({ paymentRequestId: id, amount: "100", reservationId: "r" }, "admin")!;
    const retry = parseReservationPaymentRequest({ reservationId: "r", amount: "100", paymentRequestId: id }, "admin")!;
    expect(first).toEqual(retry);
    expect(() => assertPaymentRequestMatches({ paymentRequestFingerprint: first.fingerprint }, retry)).not.toThrow();
  });
  it("cannot reuse an operation ID for another amount, reservation, method, or user", () => {
    const body = { paymentRequestId: randomUUID(), amount: "100", reservationId: "r", method: "efectivo" };
    const original = parseReservationPaymentRequest(body, "admin")!;
    for (const [changed, actor] of [
      [{ ...body, amount: "200" }, "admin"],
      [{ ...body, reservationId: "another" }, "admin"],
      [{ ...body, method: "transferencia" }, "admin"],
      [body, "other-user"],
    ] as const) {
      expect(() => assertPaymentRequestMatches({ paymentRequestFingerprint: original.fingerprint },
        parseReservationPaymentRequest(changed, actor)!)).toThrow("otros datos");
    }
  });
  it("ignores a fingerprint supplied by the client and normalizes the UUID", () => {
    const body = { paymentRequestId: randomUUID(), amount: "100" };
    expect(parseReservationPaymentRequest({ ...body, paymentRequestId: body.paymentRequestId.toUpperCase(), paymentRequestFingerprint: "forged" }, "admin"))
      .toEqual(parseReservationPaymentRequest(body, "admin"));
  });
});
