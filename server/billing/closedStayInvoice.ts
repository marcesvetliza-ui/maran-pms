/** Document an existing closed stay without reopening it or settling money.
 * Source capacity and duplicate issuance are still checked by the normal folio
 * guard under the reservation/group invoice locks.
 */
export function assertClosedStayInvoiceRequest(reservation: { status: string } | undefined, body: Record<string, any>): void {
  const fail = (message: string, statusCode = 400): never => { throw Object.assign(new Error(message), { statusCode }); };
  if (!reservation || reservation.status !== "checked_out") fail("Esta opción corresponde a una estadía con check-out realizado.", 409);
  if (!body.reservaId || !["FA", "FB", "FC", "FM", "FMB"].includes(body.tipoComprobante) ||
      !/^[0-9a-f-]{36}$/i.test(body.creditOperationId || "") ||
      !Array.isArray(body.sourceChargeIds) || !body.sourceChargeIds.length) {
    fail("Seleccioná los conceptos pendientes de la estadía y un comprobante válido.");
  }
  const recovery = body.prefacturaRecovery;
  if (recovery?.version !== 2 || recovery.checkoutRequested !== false ||
      !Array.isArray(recovery.payments) || recovery.payments.length ||
      body.creditReapplications?.length || body.ordinaryAdvanceApplications?.length ||
      ["paymentId", "groupId", "groupPaymentId", "groupPaymentIntent", "spaAccountId", "cashArea", "cashFormaPago",
        "reservationSettlementMethod", "ccEntityType", "ccEntityId", "checkoutDiscount", "correctionOriginalInvoiceId", "recipientMode"]
        .some(key => body[key] != null) || body.cashFormaPagoDetalle != null) {
    fail("Facturar pendientes conserva los cobros, la deuda y el check-out. No admite nuevos pagos, descuentos ni traslados.");
  }
}
