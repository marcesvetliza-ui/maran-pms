import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, expect, it, vi } from "vitest";
import { PaymentOrderEditDialog } from "./payment-order-edit-dialog";
import { OrdenesDePagoTab } from "@/pages/purchase-invoices";
import { getQueryFn } from "@/lib/queryClient";

const { permission } = vi.hoisted(() => ({ permission: { allowed: true } }));
vi.mock("@/App", () => ({ useAuth: () => ({ user: { id: "operator", role: "admin" }, hasPermission: () => permission.allowed }) }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
const op = { id: 9, numero: "000-00000509", supplier_nombre: "Proveedor sintético", fecha: "2026-11-30", forma_pago: "transferencia", observaciones: "Original", total_abonado: "1312578.57", edit_version: "1200", non_fiscal: false, history: [] };
const clients: QueryClient[] = [];
// Submit the form event in JSDOM; the Chromium fixture also clicks the actual
// submit button and verifies the native form workflow end to end.
const submitEditor = () => fireEvent.submit(screen.getByLabelText("Motivo de la corrección").closest("form")!);
function mount(element: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, queryFn: getQueryFn({ on401: "throw" }) }, mutations: { retry: false } } }); clients.push(client);
  return render(<QueryClientProvider client={client}>{element}</QueryClientProvider>);
}
afterEach(() => { cleanup(); clients.forEach(client => client.clear()); clients.length = 0; vi.unstubAllGlobals(); permission.allowed = true; });

it("abre la edición desde el historial y guarda solo los tres datos, motivo y versión", async () => {
  const changes: any[] = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, options?: RequestInit) => {
    if (options?.method === "PATCH") { changes.push(JSON.parse(String(options.body))); return Response.json(op); }
    return Response.json(url.endsWith("/edit") ? op : [op]);
  }));
  const user = userEvent.setup(); mount(<OrdenesDePagoTab />);
  await user.click(await screen.findByRole("button", { name: "Editar" }));
  const dialog = await screen.findByRole("dialog");
  await within(dialog).findByText(/OP 000-00000509/);
  expect(screen.getByLabelText("Fecha de la OP")).toHaveValue("2026-11-30");
  expect(screen.getByRole("button", { name: "Guardar cambios" })).toBeDisabled();
  await user.clear(screen.getByLabelText("Fecha de la OP")); await user.type(screen.getByLabelText("Fecha de la OP"), "2026-11-17");
  await user.clear(screen.getByLabelText("Observaciones")); await user.type(screen.getByLabelText("Observaciones"), "Corregida");
  expect(screen.getByRole("button", { name: "Guardar cambios" })).toBeDisabled();
  await user.type(screen.getByLabelText("Motivo de la corrección"), "Fecha cargada por error");
  submitEditor();
  await waitFor(() => expect(changes).toEqual([{ fecha: "2026-11-17", formaPago: "transferencia", observaciones: "Corregida", motivo: "Fecha cargada por error", expectedVersion: "1200" }]));
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
});

it("explica el cambio de distribución de pago y conserva el borrador si el servidor rechaza una versión vieja", async () => {
  const close = vi.fn();
  vi.stubGlobal("fetch", vi.fn(async (_url: string, options?: RequestInit) => options?.method === "PATCH" ? Response.json({ error: "La OP cambió desde que abriste la edición." }, { status: 409 }) : Response.json(op)));
  const user = userEvent.setup(); mount(<PaymentOrderEditDialog id={9} onClose={close} />);
  await screen.findByLabelText("Forma de pago");
  await user.click(screen.getByLabelText("Forma de pago")); await user.click(await screen.findByRole("option", { name: "Efectivo" }));
  expect(screen.getByRole("status")).toHaveTextContent("Si había varios medios de pago");
  await user.type(screen.getByLabelText("Motivo de la corrección"), "Medio incorrecto");
  submitEditor();
  await waitFor(() => expect(fetch).toHaveBeenCalledWith('/api/payment-orders/9', expect.objectContaining({method:'PATCH'})));
  expect(await screen.findByRole("alert")).toHaveTextContent("La OP cambió");
  expect(screen.getByLabelText("Motivo de la corrección")).toHaveValue("Medio incorrecto"); expect(close).not.toHaveBeenCalled();
});

it("cancelar cierra sin enviar cambios", async () => {
  const fetcher = vi.fn(async () => Response.json(op)), close = vi.fn(); vi.stubGlobal("fetch", fetcher);
  const user = userEvent.setup(); mount(<PaymentOrderEditDialog id={9} onClose={close} />);
  await screen.findByLabelText("Observaciones"); await user.type(screen.getByLabelText("Observaciones"), " sin guardar");
  await user.click(screen.getByRole("button", { name: "Cancelar" }));
  expect(close).toHaveBeenCalledTimes(1); expect(fetcher.mock.calls.every(call => (call as any[])[1]?.method !== "PATCH")).toBe(true);
});

it("preserva un medio antiguo al editar notas y muestra la auditoría guardada", async () => {
  const changes: any[] = [], close = vi.fn();
  vi.stubGlobal("fetch", vi.fn(async (_url: string, options?: RequestInit) => {
    if (options?.method === "PATCH") { changes.push(JSON.parse(String(options.body))); return Response.json(op); }
    return Response.json({ ...op, forma_pago: "tarjeta_credito", history: [{ user_name: "Administración", timestamp: "2026-11-17T15:00:00Z", details: JSON.stringify({ reason: "Corrección anterior" }) }] });
  }));
  const user = userEvent.setup(); mount(<PaymentOrderEditDialog id={9} onClose={close} />);
  expect(await screen.findByLabelText("Forma de pago")).toHaveTextContent("tarjeta credito (actual)"); await user.click(screen.getByText("Últimas correcciones (1)"));
  expect(screen.getByText("Corrección anterior")).toBeInTheDocument();
  await user.type(screen.getByLabelText("Observaciones"), " revisada"); await user.type(screen.getByLabelText("Motivo de la corrección"), "Nota agregada");
  submitEditor();
  await waitFor(() => expect(changes[0]?.formaPago).toBe("tarjeta_credito"));
});

it("mantiene efectivo para compras no fiscales", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => Response.json({ ...op, forma_pago: "efectivo", non_fiscal: true })));
  mount(<PaymentOrderEditDialog id={9} onClose={vi.fn()} />);
  expect(await screen.findByLabelText("Forma de pago")).toBeDisabled();
  expect(screen.getByLabelText("Fecha de la OP")).toBeEnabled(); expect(screen.getByLabelText("Observaciones")).toBeEnabled();
});

it("oculta Editar sin permiso de compras y mantiene la descarga de la OP", async () => {
  permission.allowed = false; vi.stubGlobal("fetch", vi.fn(async () => Response.json([op])));
  mount(<OrdenesDePagoTab />); await screen.findByText("000-00000509");
  expect(screen.queryByRole("button", { name: "Editar" })).not.toBeInTheDocument();
  expect(screen.getByTitle("Descargar Orden de Pago")).toBeInTheDocument();
});
