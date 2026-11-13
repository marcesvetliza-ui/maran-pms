import type { PrefacturaAttempt } from "./prefactura-submission";

const key = (reservationId: string | number) => `prefactura-selection:${reservationId}`;
const storageError = () => new Error("No se pudo conservar la selección de conceptos. No se emitió ni cobró. Habilitá el almacenamiento de esta pestaña y volvé a intentar.");

export function readPrefacturaSelection(storage: Pick<Storage, "getItem">, reservationId: string | number): Set<string> | null {
  try {
    const raw = storage.getItem(key(reservationId));
    if (raw === null) return null;
    const saved = JSON.parse(raw);
    if (saved.version !== 1 || saved.reservationId !== String(reservationId) ||
      !Array.isArray(saved.ids) || saved.ids.some((id: unknown) => typeof id !== "string")) throw storageError();
    return new Set(saved.ids);
  } catch { throw storageError(); }
}

export function savePrefacturaSelection(storage: Pick<Storage, "setItem">, reservationId: string | number, ids: Iterable<string>) {
  try {
    storage.setItem(key(reservationId), JSON.stringify({ version: 1, reservationId: String(reservationId), ids: [...new Set(ids)] }));
  } catch { throw storageError(); }
}

export function retainedPrefacturaSelection(ids: Iterable<string>, eligibleIds: Iterable<string>) {
  const eligible = new Set(eligibleIds);
  return new Set([...ids].filter(id => eligible.has(id)));
}

/** The frozen fiscal request, not a changed folio, owns a retry's composition. */
export function pendingPrefacturaSourceIds(attempt: PrefacturaAttempt | null): string[] | null {
  if (!attempt?.invoiceRequest) return null;
  const request = attempt.invoiceRequest;
  return Array.isArray(request.sourceChargeIds) ? request.sourceChargeIds.map(String)
    : request.sourceChargeAmounts && typeof request.sourceChargeAmounts === "object"
      ? Object.keys(request.sourceChargeAmounts) : [];
}

export function originalPrefacturaLines(attempt: PrefacturaAttempt | null): Array<{ description: string; amount: number }> {
  const items = attempt?.invoiceRequest?.items;
  return Array.isArray(items) ? items.map((item: any) => ({
    description: String(item.descripcion || "Concepto original"),
    amount: Number(item.subtotal ?? Number(item.precioUnitario || 0) * Number(item.cantidad ?? 1)),
  })) : [];
}
