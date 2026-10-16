import { useEffect, useRef, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  FundingApiError, fundingApi, fundingJournalKey, readFundingJournal, persistFundingConfirmation,
  fundingMethods, fundingMethodLabels, fundingMoney, pesosToCents, centsToInput,
  type FundingProjection, type FundingPreview, type FundingOperation, type FundingRequest, type FundingConfirmation,
} from "@/lib/paymentFunding";

const statusLabels: Record<FundingOperation["status"], string> = {
  reserved: "Fondos reservados", authorizing: "Autorización en curso",
  fiscal_unknown: "Resultado fiscal pendiente de conciliación",
  authorized_pending_link: "Factura autorizada; vinculación pendiente",
  applied: "Operación finalizada", aborted: "Operación abortada",
};
const terminal = (operation: FundingOperation) => ["applied", "aborted"].includes(operation.status);
type Shift = { id: string; label: string };

/** Only consumes the funding API. Never invokes billing, payments, Caja or legacy settlement. */
export function SpaFundingPanel({ accountId, userId, canWrite, collectionShifts = [], onCompleted, onPrepareDocument, recipientEditor }: {
  accountId: string; userId: string; canWrite: boolean;
  // Must come from verified server data; no manual shift IDs or synthetic defaults.
  collectionShifts?: Shift[];
  onCompleted?: () => void;
  onPrepareDocument?: () => Promise<string>;
  recipientEditor?: ReactNode;
}) {
  const key = fundingJournalKey(userId, accountId);
  const [projection, setProjection] = useState<FundingProjection>();
  const [operation, setOperation] = useState<FundingOperation>();
  const [pendingId, setPendingId] = useState<string>();
  const [rejectedPlanId, setRejectedPlanId] = useState<string>();
  const [preview, setPreview] = useState<FundingPreview>();
  const [documentId, setDocumentId] = useState("");
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [newAmount, setNewAmount] = useState("");
  const [method, setMethod] = useState<typeof fundingMethods[number]>("efectivo");
  const [shiftId, setShiftId] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const fatalJournal = useRef(false);
  const alive = useRef(true);

  function acceptOperation(next: FundingOperation) {
    if (next.scope.kind !== "spa" || next.scope.id !== accountId) throw new Error("La operación no pertenece a este folio.");
    setOperation(next);
    setPendingId(terminal(next) ? undefined : next.id);
    if (terminal(next)) {
      const journal = readFundingJournal(key, accountId);
      if (journal?.operationId === next.id) sessionStorage.removeItem(key);
      setPreview(undefined);
      if (next.status === "applied") onCompleted?.();
    }
  }
  async function refresh() {
    const data = await fundingApi.scope(accountId);
    if (data.scope.kind !== "spa" || data.scope.id !== accountId) throw new Error("La respuesta no pertenece a este folio.");
    if (!alive.current) return;
    setProjection(data);
    const journal = readFundingJournal(key, accountId);
    const active = data.operations.find(item => !terminal(item));
    if (journal) {
      setPendingId(journal.operationId);
      try { acceptOperation(await fundingApi.operation(journal.operationId)); }
      catch (e) {
        // 404 after a lost first POST does not permit a new UUID: keep the confirmation.
        if (!(e instanceof FundingApiError && e.status === 404)) throw e;
      }
    } else if (active) acceptOperation(active);
    return data;
  }
  async function run(task: () => Promise<unknown>) {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true); setError("");
    try { await task(); }
    catch (e) {
      if (alive.current) {
        setError(e instanceof Error ? e.message : "No se pudo consultar la operación. No vuelva a emitir ni cobrar.");
        setPreview(undefined);
      }
    } finally {
      inFlight.current = false;
      if (alive.current) setBusy(false);
    }
  }
  useEffect(() => {
    alive.current = true;
    // A damaged/inaccessible recovery record blocks confirmation rather than losing its identity.
    try {
      const journal = readFundingJournal(key, accountId);
      if (journal) setPendingId(journal.operationId);
    } catch {
      fatalJournal.current = true;
      setError("No se pudo leer la operación pendiente. Solicite revisión antes de emitir o cobrar.");
      return;
    }
    void run(refresh);
    return () => { alive.current = false; };
  }, [accountId, key]);

  const active = pendingId || projection?.operations.find(item => !terminal(item))?.id;
  const locked = busy || !!active || !canWrite || fatalJournal.current;
  const resetPreview = () => setPreview(undefined);
  async function prepareDocument() {
    if (locked || !onPrepareDocument) return;
    const id = await onPrepareDocument();
    const data = await refresh();
    if (!data?.documents.some(doc => doc.id === id && doc.status === "draft"))
      throw new Error("El documento preparado no aparece disponible. Actualizá el folio antes de continuar.");
    setDocumentId(id);
    resetPreview();
  }
  async function prepare() {
    if (!projection || locked) return;
    const applications = Object.entries(amounts).filter(([, value]) => value !== "").map(([receiptId, value]) => ({ receiptId, amountCents: pesosToCents(value) }));
    const request: FundingRequest = {
      scope: { kind: "spa", id: accountId }, documentId, applications,
      newCollections: newAmount ? [{ rowId: "new-collection", method, amountCents: pesosToCents(newAmount), shiftId }] : [],
    };
    if (newAmount && !collectionShifts.some(shift => shift.id === shiftId)) throw new Error("Seleccioná un turno abierto verificado para registrar el faltante.");
    const next = await fundingApi.preview(request);
    if (JSON.stringify(next.request) !== JSON.stringify(request)) throw new Error("La previsualización no coincide con la selección. Actualizá el folio.");
    setPreview(next);
  }
  async function reservePlan(confirmation: FundingConfirmation) {
    try { return await fundingApi.reserve(confirmation); }
    catch (e) {
      const rejectedCodes = ["PREVIEW_STALE", "FUNDS_UNAVAILABLE", "DOCUMENT_CAPACITY", "DOCUMENT_CLAIMED", "DOCUMENT_ALREADY_ISSUED", "FUNDING_TOTAL_MISMATCH", "COLLECTION_EXCEEDS_DEBT", "SHIFT_CLOSED"];
      if (e instanceof FundingApiError && rejectedCodes.includes(e.code)) {
        try { acceptOperation(await fundingApi.operation(confirmation.operationId)); }
        catch (lookupError) {
          if (lookupError instanceof FundingApiError && lookupError.status === 404)
            setRejectedPlanId(confirmation.operationId);
        }
      }
      throw e;
    }
  }
  async function reviseRejectedPlan() {
    if (!rejectedPlanId || !canWrite) return;
    try {
      acceptOperation(await fundingApi.operation(rejectedPlanId));
      setRejectedPlanId(undefined);
      return;
    } catch (e) {
      if (!(e instanceof FundingApiError && e.status === 404)) throw e;
    }
    // Explicit rejection + confirmed absence: no funds/CAE exist for this UUID.
    const journal = readFundingJournal(key, accountId);
    if (journal?.operationId !== rejectedPlanId) throw new Error("Cambió la operación pendiente. Actualizá el folio.");
    sessionStorage.removeItem(key);
    setPendingId(undefined); setOperation(undefined); setRejectedPlanId(undefined); setPreview(undefined);
    await refresh();
  }
  async function confirm() {
    if (!preview || locked) return;
    const confirmation = persistFundingConfirmation(key, preview);
    setPendingId(confirmation.operationId);
    acceptOperation(await reservePlan(confirmation));
    await refresh();
  }
  async function recover() {
    if (!active || !canWrite || fatalJournal.current) return;
    let next: FundingOperation;
    try { next = await fundingApi.operation(active); }
    catch (e) {
      const journal = readFundingJournal(key, accountId);
      if (!(e instanceof FundingApiError && e.status === 404 && journal?.operationId === active)) throw e;
      next = await reservePlan(journal);
    }
    acceptOperation(next);
    await refresh();
  }
  async function advance(action: "authorize" | "finalize" | "resume") {
    if (!operation || !canWrite || fatalJournal.current) return;
    const current = await fundingApi.operation(operation.id);
    acceptOperation(current);
    const allowed = action === "authorize" ? current.canAuthorize : action === "finalize" ? current.canFinalize : current.canResume;
    if (!allowed || terminal(current)) return;
    acceptOperation(await fundingApi.action(current.id, action));
    await refresh();
  }

  return <section className="space-y-4" aria-label="Financiación del folio SPA">
    <h3 className="font-semibold">Facturación y cobros SPA</h3>
    <p className="text-sm text-muted-foreground">Reutiliza los cobros seleccionados. Sólo el faltante confirmado registra dinero nuevo. Una operación pendiente se recupera; no se vuelve a emitir.</p>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    <Button variant="outline" disabled={busy} onClick={() => void run(refresh)}>Actualizar financiación</Button>
    {!projection && <p>{busy ? "Consultando financiación…" : "Financiación no disponible. No se habilita el cierre desde esta pantalla."}</p>}
    {projection?.legacyHistory ? <div className="space-y-2 rounded border p-3">
      <h4 className="font-semibold">Historial anterior al cambio de motor</h4>
      <p>{projection.legacyHistory.reason}. Se conserva para consulta; estos importes no se vuelven a facturar ni cobrar.</p>
      <p>Estado registrado: {projection.legacyHistory.status}</p>
      <p>Cargos: {fundingMoney(projection.legacyHistory.totalCents)} · Pagos registrados: {fundingMoney(projection.legacyHistory.paidCents)}</p>
      {projection.legacyHistory.payments.map(p=><p key={p.id}>Pago {p.id} · {p.method} · {fundingMoney(p.amountCents)} · {p.status}</p>)}
      {projection.legacyHistory.invoices.map(i=><p key={i.id}>Comprobante {i.type} {i.point}-{i.number} · {fundingMoney(i.amountCents)} · {i.status}</p>)}
    </div> : projection && <>
      {!projection.documents.length && !projection.operations.some(o=>!terminal(o)) && recipientEditor}
      <p>Saldo pendiente de cobro: <strong>{fundingMoney(projection.debtCents)}</strong></p>
      <div className="overflow-x-auto"><table className="w-full text-sm">
        <caption className="text-left font-medium">Cobros registrados (no se suman otra vez a Caja)</caption>
        <thead><tr>{["Usar", "Medio / referencia", "Importe", "Aplicado", "Reservado", "Libre", "Aplicar (pesos)"].map(label => <th className="p-2 text-left" key={label}>{label}</th>)}</tr></thead>
        <tbody>{projection.receipts.map(receipt => <tr key={receipt.id}>
          <td className="p-2"><Checkbox aria-label={`Usar ${receipt.sourcePaymentId}`} checked={amounts[receipt.id] !== undefined && amounts[receipt.id] !== ""} disabled={locked || receipt.freeCents === 0}
            onCheckedChange={checked => { setAmounts(prev => ({ ...prev, [receipt.id]: checked ? centsToInput(receipt.freeCents) : "" })); resetPreview(); }} /></td>
          <td className="p-2">{fundingMethodLabels[receipt.method]} · {receipt.sourcePaymentId}</td>
          {[receipt.amountCents, receipt.appliedCents, receipt.heldCents, receipt.freeCents].map((value, index) => <td className="p-2 whitespace-nowrap" key={index}>{fundingMoney(value)}</td>)}
          <td><Input className="min-w-28" aria-label={`Importe ${receipt.sourcePaymentId}`} inputMode="decimal" value={amounts[receipt.id] ?? ""} disabled={locked || receipt.freeCents === 0}
            onChange={e => { const value = e.currentTarget.value; setAmounts(prev => ({ ...prev, [receipt.id]: value })); resetPreview(); }} /></td>
        </tr>)}</tbody>
      </table></div>
      <label className="block text-sm">Documento fiscal preparado por el servidor
        <select className="block w-full rounded border bg-background p-2" aria-label="Documento fiscal" value={documentId} disabled={locked} onChange={e => { setDocumentId(e.target.value); resetPreview(); }}>
          <option value="">Seleccionar documento</option>
          {projection.documents.filter(doc => doc.status === "draft").map(doc => <option key={doc.id} value={doc.id}>{doc.id} · {fundingMoney(doc.totalCents)}</option>)}
        </select>
      </label>
      {!projection.documents.some(doc => doc.status === "draft") && <div className="space-y-2">
        <p className="text-sm">Falta preparar el comprobante con los cargos y datos fiscales guardados.</p>
        {onPrepareDocument && <Button disabled={locked} onClick={() => void run(prepareDocument)}>Preparar comprobante</Button>}
      </div>}
      {projection.documents.filter(doc => doc.id === documentId).map(doc => {
        const recipient = doc.snapshot.recipient as Record<string, unknown> | undefined;
        return <div className="rounded border p-3 text-sm" key={doc.id}>
          <p>Receptor: {String(recipient?.razonSocial ?? recipient?.label ?? "Revisar ficha fiscal")}</p>
          <p>Comprobante: {({ FA: "Factura A", FB: "Factura B" } as Record<string, string>)[String(doc.snapshot.tipo ?? doc.snapshot.tipoComprobante)] ?? "Preparado por el servidor"}</p>
          <p>Documento del receptor: {String(recipient?.cuit ?? recipient?.dni ?? "Sin identificación")}</p>
          <p>Condición IVA: {String(recipient?.condicionIva ?? "Revisar ficha fiscal")}</p>
          <p>Total: {fundingMoney(doc.totalCents)}</p>
        </div>;
      })}
      {collectionShifts.length > 0 ? <fieldset disabled={locked} className="grid gap-3 rounded border p-3 md:grid-cols-3">
        <legend>Dinero nuevo (sólo el faltante)</legend>
        <label>Importe en pesos<Input aria-label="Dinero nuevo" inputMode="decimal" value={newAmount} onChange={e => { setNewAmount(e.target.value); resetPreview(); }} /></label>
        <label>Medio<select aria-label="Medio del faltante" className="block w-full rounded border bg-background p-2" value={method} onChange={e => { setMethod(e.target.value as typeof method); resetPreview(); }}>{fundingMethods.map(value => <option key={value} value={value}>{fundingMethodLabels[value]}</option>)}</select></label>
        <label>Turno abierto<select aria-label="Turno del faltante" className="block w-full rounded border bg-background p-2" value={shiftId} onChange={e => { setShiftId(e.target.value); resetPreview(); }}><option value="">Seleccionar turno</option>{collectionShifts.map(shift => <option key={shift.id} value={shift.id}>{shift.label}</option>)}</select></label>
      </fieldset> : <p className="text-sm">Sin turno abierto verificado: el cobro de dinero nuevo está deshabilitado.</p>}
      {!canWrite && <p className="text-sm">Sólo consulta. No tenés permiso para confirmar operaciones.</p>}
      <Button disabled={locked || !documentId} onClick={() => void run(prepare)}>Previsualizar financiación</Button>
      {preview && <div className="space-y-2 rounded border p-3">
        <p>Importe a facturar: <strong>{fundingMoney(preview.totalCents)}</strong></p>
        <p>{preview.fundingMode === "existing_only" ? "Se usan cobros existentes; no se registra dinero nuevo." : "Se usan cobros existentes y se registra únicamente el faltante."}</p>
        {preview.paymentMethods.map(row => <p key={row.method}>{fundingMethodLabels[row.method]}: {fundingMoney(row.amountCents)}</p>)}
        <Button disabled={locked} onClick={() => void run(confirm)}>Confirmar y reservar fondos</Button>
      </div>}
      {rejectedPlanId && <Button disabled={busy || !canWrite} onClick={() => void run(reviseRejectedPlan)}>Revisar selección rechazada</Button>}
      {(active || operation) && <div className="space-y-2 rounded border p-3">
        <p>Operación: {active ?? operation?.id}</p>
        {operation && <p>{statusLabels[operation.status]}</p>}
        {operation?.fundsRetained && <p>Los fondos permanecen reservados para esta operación.</p>}
        {active && <Button variant="outline" disabled={busy || !canWrite || fatalJournal.current} onClick={() => void run(recover)}>Consultar misma operación</Button>}
        {operation?.canAuthorize && <Button disabled={busy || !canWrite} onClick={() => void run(() => advance("authorize"))}>Autorizar esta operación</Button>}
        {operation?.canFinalize && <Button disabled={busy || !canWrite} onClick={() => void run(() => advance("finalize"))}>Finalizar esta operación</Button>}
        {operation?.canResume && <Button disabled={busy || !canWrite} onClick={() => void run(() => advance("resume"))}>Recuperar esta operación</Button>}
      </div>}
      {projection.operations.length > 0 && <details><summary>Historial de operaciones</summary>{projection.operations.map(item => <div className="py-2" key={item.id}>{item.id} · {statusLabels[item.status]} <Button variant="outline" disabled={busy || !!active} onClick={() => void run(async () => acceptOperation(await fundingApi.operation(item.id)))}>Ver operación</Button></div>)}</details>}
      {projection.rectifications.map(row => <p key={`${row.shiftId}:${row.revision}`}>Turno {row.shiftId} · Revisión {row.revision} · Conteo físico: {row.physicalCountCents === null ? "No verificable" : fundingMoney(row.physicalCountCents)} · {row.reason}</p>)}
    </>}
  </section>;
}
