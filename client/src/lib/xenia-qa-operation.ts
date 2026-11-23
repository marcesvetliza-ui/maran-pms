type Storage = Pick<globalThis.Storage, "getItem" | "setItem" | "removeItem">;
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value)
    .filter(([, v]) => v !== undefined).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => [k, canonical(v)]));
  return value;
}
/** Keep an uncertain operation across reloads; a confirmed save starts the next one. */
export function qaOperationId(storage: Storage, scope: string, payload: unknown): string {
  const key = "xenia-qa-operation:" + scope;
  const fingerprint = JSON.stringify(canonical(payload));
  const raw = storage.getItem(key);
  if (raw) {
    let previous;
    try { previous = JSON.parse(raw); } catch { throw Error("No se pudo recuperar la operación pendiente. Revisá el folio antes de continuar."); }
    if (previous.fingerprint === fingerprint && typeof previous.id === "string" &&
        /^[0-9a-f-]{36}$/i.test(previous.id)) return previous.id;
  }
  const id = crypto.randomUUID();
  storage.setItem(key, JSON.stringify({ id, fingerprint }));
  return id;
}
export function confirmQaOperation(storage: Storage, scope: string) {
  storage.removeItem("xenia-qa-operation:" + scope);
}
