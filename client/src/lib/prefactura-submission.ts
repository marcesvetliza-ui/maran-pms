type Payload = Record<string, any>;
export type PrefacturaAttempt = {
  invoiceRequest: Payload | null;
  invoice: Payload | null;
  payments: Payload[];
  checkoutRequested: boolean;
};

// Save the complete intent before the first write. Reopening or refreshing must
// not reconstruct amounts, dates, instruments or fiscal sources from a new folio.
export function createPrefacturaSubmission(storage: Pick<Storage, "getItem" | "setItem" | "removeItem">) {
  let busy = false;
  const key = (reservationId: string | number) => `prefactura-pending:${reservationId}`;
  return {
    acquire() {
      if (busy) return false;
      busy = true;
      return true;
    },
    release() { busy = false; },
    isBusy() { return busy; },
    pending(reservationId: string | number): PrefacturaAttempt | null {
      const raw = storage.getItem(key(reservationId));
      return raw ? JSON.parse(raw) : null;
    },
    prepare(reservationId: string | number, invoiceRequest: Payload | null, payments: Payload[], checkoutRequested = false) {
      const previous = this.pending(reservationId);
      if (previous) return previous;
      const attempt: PrefacturaAttempt = {
        invoiceRequest,
        invoice: null,
        payments: payments.map(payment => ({ ...payment, paymentRequestId: crypto.randomUUID() })),
        checkoutRequested,
      };
      // Serialize now, not after awaiting issuance; storage errors stop the write.
      storage.setItem(key(reservationId), JSON.stringify(attempt));
      return this.pending(reservationId)!;
    },
    async run(reservationId: string | number, post: (url: string, body: Payload) => Promise<Payload>) {
      const attempt = this.pending(reservationId);
      if (!attempt) throw new Error("No hay una operación pendiente de Prefactura.");
      if (attempt.invoiceRequest && !attempt.invoice) {
        attempt.invoice = await post("/api/billing/invoices", attempt.invoiceRequest);
        const invoice = attempt.invoice;
        const invoiceData = {
          id: invoice.id,
          tipoComprobante: invoice.tipoComprobante ?? invoice.tipo_comprobante,
          puntoVenta: invoice.puntoVenta ?? invoice.punto_venta,
          numero: invoice.numero,
          cae: invoice.cae,
          total: invoice.montoTotal ?? invoice.monto_total,
        };
        attempt.payments = attempt.payments.map(payment => ({ ...payment, invoiceData }));
        storage.setItem(key(reservationId), JSON.stringify(attempt));
      }
      // Replay every row with its original key and payload. An acknowledged row
      // and a committed row with a lost response both return the same payment.
      for (const payment of attempt.payments) await post("/api/payments", payment);
      return { invoice: attempt.invoice, paymentCount: attempt.payments.length, checkoutRequested: attempt.checkoutRequested };
    },
    async discardRejectedInvoice(reservationId: string | number, error: Error, hasClaim: (operationId: string) => Promise<boolean>) {
      const attempt = this.pending(reservationId);
      // Only a definitive validation/authorization rejection is correctable.
      // Timeouts, missing responses and server errors always retain the intent.
      if (!/^4(?:00|03|09):/.test(error.message) || !attempt?.invoiceRequest || attempt.invoice) return false;
      const operationId = attempt.invoiceRequest.creditOperationId;
      if (typeof operationId !== "string" || await hasClaim(operationId)) return false;
      this.complete(reservationId);
      return true;
    },
    complete(reservationId: string | number) { storage.removeItem(key(reservationId)); },
  };
}
