type Payload = Record<string, any>;
export type PrefacturaAttempt = {
  ownerReservationId?: string;
  invoiceRequest: Payload | null;
  invoice: Payload | null;
  payments: Payload[];
  checkoutRequested: boolean;
  acknowledgedPaymentIds?: string[];
  accountCheckout?: { operationId: string; entityType: string; entityId: string; expectedBalance: string; entityName: string };
};

function assertReservation(reservationId: string | number, attempt: PrefacturaAttempt) {
  const expected = String(reservationId);
  const ids = [attempt.ownerReservationId, attempt.invoiceRequest?.reservaId,
    ...attempt.payments.map(payment => payment.reservationId),
    attempt.invoice?.reservaId, attempt.invoice?.reserva_id];
  // Some legacy responses omit their reservation. Never accept an explicit
  // mismatch, and bind every newly prepared attempt to its storage owner.
  if (ids.some(id => id != null && String(id) !== expected)) {
    throw new Error("La operación o su factura pertenece a otra reserva. No se registrarán pagos; revisá el intento original.");
  }
}

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
      const attempt = raw ? JSON.parse(raw) : null;
      return attempt;
    },
    prepare(reservationId: string | number, invoiceRequest: Payload | null, payments: Payload[], checkoutRequested = false) {
      const previous = this.pending(reservationId);
      if (previous) { assertReservation(reservationId, previous); return previous; }
      const attempt: PrefacturaAttempt = {
        ownerReservationId: String(reservationId),
        invoiceRequest,
        invoice: null,
        payments: payments.map(payment => ({ ...payment, paymentRequestId: crypto.randomUUID() })),
        checkoutRequested,
      };
      assertReservation(reservationId, attempt);
      if (attempt.invoiceRequest?.creditOperationId) {
        attempt.invoiceRequest = { ...attempt.invoiceRequest, prefacturaRecovery: { version: 2, payments: attempt.payments, checkoutRequested } };
      }
      // Serialize now, not after awaiting issuance; storage errors stop the write.
      storage.setItem(key(reservationId), JSON.stringify(attempt));
      return this.pending(reservationId)!;
    },
    prepareAccountCheckout(reservationId: string | number, request: NonNullable<PrefacturaAttempt["accountCheckout"]>) {
      const previous = this.pending(reservationId);
      if (previous) { assertReservation(reservationId, previous); return previous; }
      const attempt: PrefacturaAttempt = { ownerReservationId: String(reservationId), invoiceRequest: null, invoice: null,
        payments: [], checkoutRequested: true, accountCheckout: { ...request } };
      storage.setItem(key(reservationId), JSON.stringify(attempt));
      return this.pending(reservationId)!;
    },
    restore(reservationId: string | number, attempt: PrefacturaAttempt) {
      if (this.pending(reservationId)) return false;
      if (!attempt?.invoiceRequest || String(attempt.invoiceRequest.reservaId) !== String(reservationId) ||
          typeof attempt.invoiceRequest.creditOperationId !== "string" || !Array.isArray(attempt.payments) ||
          attempt.payments.some(payment => String(payment.reservationId) !== String(reservationId) || typeof payment.paymentRequestId !== "string")) return false;
      try { assertReservation(reservationId, attempt); } catch { return false; }
      storage.setItem(key(reservationId), JSON.stringify(attempt));
      return true;
    },
    acknowledge(reservationId: string | number, ids: string[]) {
      const attempt = this.pending(reservationId);
      if (!attempt || !Array.isArray(ids)) return;
      const ownIds = new Set(attempt.payments.map(payment => payment.paymentRequestId));
      attempt.acknowledgedPaymentIds = ids.filter(id => ownIds.has(id));
      storage.setItem(key(reservationId), JSON.stringify(attempt));
    },
    acceptInvoice(reservationId: string | number, invoice: Payload) {
      const attempt = this.pending(reservationId);
      if (!attempt || !invoice?.id || attempt.invoice && Number(attempt.invoice.id) !== Number(invoice.id)) return;
      assertReservation(reservationId, { ...attempt, invoice });
      attempt.invoice = invoice;
      storage.setItem(key(reservationId), JSON.stringify(attempt));
    },
    async run(reservationId: string | number, post: (url: string, body: Payload) => Promise<Payload>, assertActive: () => void = () => {}) {
      const attempt = this.pending(reservationId);
      if (!attempt) throw new Error("No hay una operación pendiente de Prefactura.");
      assertReservation(reservationId, attempt);
      assertActive();
      if (attempt.accountCheckout) {
        await post(`/api/reservations/${reservationId}/check-out-to-account`, attempt.accountCheckout);
        assertActive();
        return { invoice: null, paymentCount: 0, checkoutRequested: true, checkoutCompleted: true };
      }
      if (attempt.invoiceRequest && !attempt.invoice) {
        const invoice = await post("/api/billing/invoices", attempt.invoiceRequest);
        assertReservation(reservationId, { ...attempt, invoice });
        attempt.invoice = invoice;
      }
      if (attempt.invoice) {
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
      for (const payment of attempt.payments) {
        assertActive();
        if (!attempt.acknowledgedPaymentIds?.includes(payment.paymentRequestId)) await post("/api/payments", payment);
      }
      assertActive();
      return { invoice: attempt.invoice, paymentCount: attempt.payments.length, checkoutRequested: attempt.checkoutRequested };
    },
    complete(reservationId: string | number) { storage.removeItem(key(reservationId)); },
  };
}
