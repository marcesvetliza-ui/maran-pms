type Payload = Record<string, any>;
export type PrefacturaAttempt = {
  ownerReservationId?: string;
  invoiceRequest: Payload | null;
  invoice: Payload | null;
  payments: Payload[];
  checkoutRequested: boolean;
  acknowledgedPaymentIds?: string[];
  checkoutDebtAccount?: { operationId: string; entityType: string; entityId: string; entityName: string; maximumBalance: number };
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
export function createPrefacturaSubmission(storage: Pick<Storage, "getItem" | "setItem" | "removeItem">, namespace = "prefactura-pending") {
  let busy = false;
  const key = (reservationId: string | number) => `${namespace}:${reservationId}`;
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
    prepare(reservationId: string | number, invoiceRequest: Payload | null, payments: Payload[], checkoutRequested = false, checkoutDebtAccount?: PrefacturaAttempt['checkoutDebtAccount']) {
      const previous = this.pending(reservationId);
      if (previous) { assertReservation(reservationId, previous); return previous; }
      const attempt: PrefacturaAttempt = {
        ownerReservationId: String(reservationId),
        invoiceRequest,
        invoice: null,
        payments: payments.map(payment => ({ ...payment, paymentRequestId: crypto.randomUUID() })),
        checkoutRequested,
        ...(checkoutDebtAccount ? { checkoutDebtAccount } : {}),
      };
      assertReservation(reservationId, attempt);
      if (attempt.invoiceRequest?.creditOperationId) {
        attempt.invoiceRequest = { ...attempt.invoiceRequest, prefacturaRecovery: { version: 2, payments: attempt.payments, checkoutRequested, ...(checkoutDebtAccount ? {checkoutDebtAccount} : {}) } };
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
    synchronizeVerified(reservationId: string | number, operationId: string, attempt: PrefacturaAttempt) {
      const current = this.pending(reservationId);
      if (!current || current.invoiceRequest?.creditOperationId !== operationId ||
          attempt.invoiceRequest?.creditOperationId !== operationId ||
          attempt.invoiceRequest?.prefacturaRecovery?.version !== 2) throw new Error("La operación cambió. Se conserva el pedido original.");
      assertReservation(reservationId, attempt);
      // The server's immutable snapshot, never current form values, is the
      // authority for amounts, CC settlement, acknowledged rows and checkout.
      storage.setItem(key(reservationId), JSON.stringify({ ...attempt, ownerReservationId: String(reservationId) }));
    },
    replaceUnissued(reservationId: string | number, originalOperationId: string, replacement: PrefacturaAttempt) {
      const current = this.pending(reservationId);
      if (!current || current.invoice || current.acknowledgedPaymentIds?.length || current.invoiceRequest?.creditOperationId !== originalOperationId ||
          replacement.invoice || replacement.invoiceRequest?.excessCollection?.originalOperationId !== originalOperationId) throw new Error('La operación cambió. Conservamos su recuperación.');
      assertReservation(reservationId, replacement);
      storage.setItem(key(reservationId), JSON.stringify(replacement));
    },
    confirmCheckoutDebt(reservationId: string | number, account: NonNullable<PrefacturaAttempt['checkoutDebtAccount']>) {
      const attempt = this.pending(reservationId);
      if (!attempt?.checkoutRequested || attempt.accountCheckout) throw new Error('La operación no solicita el cierre de esta estadía.');
      assertReservation(reservationId, attempt);
      if (attempt.checkoutDebtAccount) return;
      // Departure authorization is separate from the frozen fiscal request.
      attempt.checkoutDebtAccount = account;
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
        attempt.payments = attempt.payments.map(payment => payment.unlinkedAdvance ? payment : ({ ...payment, invoiceData }));
        storage.setItem(key(reservationId), JSON.stringify(attempt));
      }
      // Replay every row with its original key and payload. An acknowledged row
      // and a committed row with a lost response both return the same payment.
      for (const payment of attempt.payments) {
        assertActive();
        const {unlinkedAdvance, ...payload} = payment;
        if (!attempt.acknowledgedPaymentIds?.includes(payment.paymentRequestId)) await post("/api/payments", payload);
      }
      assertActive();
      return { invoice: attempt.invoice, paymentCount: attempt.payments.length, checkoutRequested: attempt.checkoutRequested };
    },
    complete(reservationId: string | number) { storage.removeItem(key(reservationId)); },
  };
}
