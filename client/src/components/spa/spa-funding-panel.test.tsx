import { render, screen, waitFor, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { SpaFundingPanel } from "./spa-funding-panel";
import { fundingJournalKey } from "@/lib/paymentFunding";

const id = "12345678-1234-4234-a234-123456789abc";
const scope = { kind: "spa", id: "spa-1" };
function operation(status = "reserved") {
  return { id, scope, status, canAuthorize: status === "reserved", canFinalize: status === "authorized_pending_link",
    canResume: ["authorizing", "fiscal_unknown", "authorized_pending_link"].includes(status),
    fundsRetained: !["applied", "aborted"].includes(status), invoice: null, result: null, lastError: null };
}
function projection() {
  return { scope, debtCents: 0, documents: [{ id: "doc-1", totalCents: 9500000, status: "draft", snapshot: { recipient: { name: "Prueba" }, items: [] } }],
    receipts: [
      { id: "r1", sourcePaymentId: "S1", method: "tarjeta_debito", amountCents: 500000, appliedCents: 0, heldCents: 0, freeCents: 500000, version: 1 },
      { id: "r2", sourcePaymentId: "S2", method: "efectivo", amountCents: 9000000, appliedCents: 0, heldCents: 0, freeCents: 9000000, version: 1 },
    ], operations: [] as ReturnType<typeof operation>[], rectifications: [] as any[] };
}
function ok(data: unknown, status = 200) { return new Response(JSON.stringify({ ok: true, data }), { status }); }
let state: ReturnType<typeof operation> | undefined;
let view: ReturnType<typeof projection>;
let calls: Array<{ url: string; body: any }>;
let loseReservation: boolean;
function installApi() {
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    const body = init?.body ? JSON.parse(init.body as string) : undefined;
    calls.push({ url, body });
    if (url.includes("/scopes/")) return ok({ ...view, operations: state ? [state] : view.operations });
    if (url.endsWith("/previews")) return ok({ scope, documentId: body.documentId, totalCents: 9500000,
      previewHash: "a".repeat(64), request: body, fundingMode: body.newCollections.length ? "existing_and_new" : "existing_only",
      paymentMethods: [{ method: "tarjeta_debito", amountCents: 500000 }, { method: "efectivo", amountCents: 9000000 }] });
    if (url.endsWith("/operations")) {
      if (loseReservation) { loseReservation = false; throw new TypeError("Conexión interrumpida"); }
      state = operation(); return ok(state);
    }
    if (url.endsWith("/authorize")) { state = operation("fiscal_unknown"); return ok(state, 202); }
    if (url.endsWith("/resume")) { state = operation("applied"); return ok(state); }
    if (url.endsWith(id)) return state ? ok(state) : new Response(JSON.stringify({ ok: false, error: { code: "NOT_FOUND", message: "No encontrada" } }), { status: 404 });
    throw new Error(`Ruta no esperada: ${url}`);
  }));
}
async function selectExisting() {
  const user = userEvent.setup();
  await screen.findByLabelText("Usar S1");
  await waitFor(() => expect(screen.getByLabelText("Usar S1")).toBeEnabled());
  await user.click(screen.getByLabelText("Usar S1"));
  await user.click(screen.getByLabelText("Usar S2"));
  expect(screen.getByLabelText("Usar S1")).toBeChecked();
  expect(screen.getByLabelText("Usar S2")).toBeChecked();
  await user.selectOptions(screen.getByLabelText("Documento fiscal"), "doc-1");
  await user.click(screen.getByRole("button", { name: "Previsualizar financiación" }));
  await screen.findByRole("button", { name: "Confirmar y reservar fondos" });
  return user;
}
describe("SPA conectado al contrato de financiación", () => {
  beforeEach(() => {
    state = undefined; view = projection(); calls = []; loseReservation = false;
    sessionStorage.clear(); vi.spyOn(crypto, "randomUUID").mockReturnValue(id); installApi();
  });
  afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
  it("reutiliza dos cobros; un 202 se recupera con la misma operación, sin pagos legacy", async () => {
    render(<SpaFundingPanel accountId="spa-1" userId="u1" canWrite />);
    const user = await selectExisting();
    await user.click(screen.getByRole("button", { name: "Confirmar y reservar fondos" }));
    await user.click(await screen.findByRole("button", { name: "Autorizar esta operación" }));
    expect(await screen.findByText("Resultado fiscal pendiente de conciliación")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Previsualizar financiación" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Recuperar esta operación" }));
    expect(await screen.findByText("Operación finalizada")).toBeInTheDocument();
    const confirmation = calls.find(call => call.url.endsWith("/operations"))!.body;
    expect(confirmation.operationId).toBe(id);
    expect(confirmation.request.applications).toEqual([{ receiptId: "r1", amountCents: 500000 }, { receiptId: "r2", amountCents: 9000000 }]);
    expect(confirmation.request.newCollections).toEqual([]);
    expect(calls.every(call => call.url.startsWith("/api/payment-funding/"))).toBe(true);
    expect(sessionStorage.getItem(fundingJournalKey("u1", "spa-1"))).toBeNull();
  });
  it("tras perder el primer POST y recargar, reintenta el mismo UUID y contenido", async () => {
    const first = render(<SpaFundingPanel accountId="spa-1" userId="u1" canWrite />);
    const user = await selectExisting(); loseReservation = true;
    await user.click(screen.getByRole("button", { name: "Confirmar y reservar fondos" }));
    await screen.findByRole("alert");
    const original = calls.find(call => call.url.endsWith("/operations"))!.body;
    first.unmount();
    render(<SpaFundingPanel accountId="spa-1" userId="u1" canWrite />);
    const recovery = await screen.findByRole("button", { name: "Consultar misma operación" });
    await waitFor(() => expect(recovery).toBeEnabled());
    await user.click(recovery);
    await screen.findByRole("button", { name: "Autorizar esta operación" });
    expect(calls.filter(call => call.url.endsWith("/operations")).map(call => call.body)).toEqual([original, original]);
    expect(crypto.randomUUID).toHaveBeenCalledTimes(1);
  });
  it("el modo mixto sólo envía el faltante y un turno verificado", async () => {
    view.receipts = view.receipts.slice(0, 1); view.debtCents = 9000000;
    render(<SpaFundingPanel accountId="spa-1" userId="u1" canWrite collectionShifts={[{ id: "shift-real", label: "SPA abierto" }]} />);
    const user = userEvent.setup();
    await user.click(await screen.findByLabelText("Usar S1"));
    await user.selectOptions(screen.getByLabelText("Documento fiscal"), "doc-1");
    await user.type(screen.getByLabelText("Dinero nuevo"), "90000");
    await user.selectOptions(screen.getByLabelText("Turno del faltante"), "shift-real");
    await user.click(screen.getByRole("button", { name: "Previsualizar financiación" }));
    await screen.findByRole("button", { name: "Confirmar y reservar fondos" });
    expect(calls.find(call => call.url.endsWith("/previews"))!.body.newCollections).toEqual([{ rowId: "new-collection", method: "efectivo", amountCents: 9000000, shiftId: "shift-real" }]);
  });
  it("permite revisar un plan vencido sólo tras rechazo explícito y ausencia confirmada del UUID", async () => {
    const delegate = globalThis.fetch;
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith("/operations")) return new Response(JSON.stringify({ ok: false, error: { code: "PREVIEW_STALE", message: "El plan cambió." } }), { status: 409 });
      return delegate(url, init);
    }));
    render(<SpaFundingPanel accountId="spa-1" userId="u1" canWrite />);
    const user = await selectExisting();
    await user.click(screen.getByRole("button", { name: "Confirmar y reservar fondos" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("El plan cambió");
    const revise = await screen.findByRole("button", { name: "Revisar selección rechazada" });
    await waitFor(() => expect(revise).toBeEnabled());
    await user.click(revise);
    await waitFor(() => expect(screen.getByRole("button", { name: "Previsualizar financiación" })).toBeEnabled());
    expect(sessionStorage.getItem(fundingJournalKey("u1", "spa-1"))).toBeNull();
    expect(calls.filter(call => call.url.endsWith(id)).length).toBeGreaterThanOrEqual(2);
    expect(calls.some(call => call.url.endsWith("/abort"))).toBe(false);
  });

  it("un usuario de consulta no puede preparar ni recuperar escrituras", async () => {
    state = operation("fiscal_unknown");
    render(<SpaFundingPanel accountId="spa-1" userId="u1" canWrite={false} />);
    expect(await screen.findByRole("button", { name: "Recuperar esta operación" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Previsualizar financiación" })).toBeDisabled();
    expect(calls.every(call => call.body === undefined)).toBe(true);
  });
  it("sin rutas o con respuestas inválidas no ofrece un cierre alternativo", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("Not found", { status: 404 })));
    render(<SpaFundingPanel accountId="spa-1" userId="u1" canWrite />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Financiación no disponible");
    expect(screen.queryByRole("button", { name: "Confirmar y reservar fondos" })).not.toBeInTheDocument();
  });
  it("un registro de recuperación dañado bloquea todo envío", async () => {
    sessionStorage.setItem(fundingJournalKey("u1", "spa-1"), "invalid");
    render(<SpaFundingPanel accountId="spa-1" userId="u1" canWrite />);
    expect(await screen.findByRole("alert")).toHaveTextContent("No se pudo leer la operación pendiente");
    expect(calls).toHaveLength(0);
  });
  it("muestra conteo no verificable, sin convertirlo en cero", async () => {
    view.rectifications = [{ shiftId: "old-shift", revision: 1, reason: "Corrección auditada", physicalCountCents: null }];
    render(<SpaFundingPanel accountId="spa-1" userId="u1" canWrite />);
    expect(await screen.findByText(/Conteo físico: No verificable/)).toBeInTheDocument();
  });
});
