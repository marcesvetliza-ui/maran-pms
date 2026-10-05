// React's pending state is not a synchronous lock. Keep the operation identity
// across failed/partial submissions; a new dialog session starts new operations.
export function createReservationPaymentSubmission() {
  let busy = false;
  const intents = new Map<number, { signature: string; id: string }>();
  return {
    isBusy() { return busy; },
    acquire() {
      if (busy) return false;
      busy = true;
      return true;
    },
    release() { busy = false; },
    beginSession() { if (!busy) intents.clear(); },
    requestId(row: number, payload: unknown) {
      const signature = JSON.stringify(payload);
      const previous = intents.get(row);
      if (previous?.signature === signature) return previous.id;
      const id = crypto.randomUUID();
      intents.set(row, { signature, id });
      return id;
    },
  };
}
