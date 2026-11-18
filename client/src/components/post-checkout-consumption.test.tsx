import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { PostCheckoutConsumption } from "./post-checkout-consumption";
import { RevertCheckout } from "./revert-checkout";
vi.mock("@/App", () => ({ useAuth: () => ({ hasPermission: () => true }) }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
let client: QueryClient;
beforeEach(() => { sessionStorage.clear(); client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } }); });
afterEach(() => { cleanup(); client.clear(); sessionStorage.clear(); vi.unstubAllGlobals(); });
it("keeps the operation identity across a lost response, close and reload", async () => {
  const writes: any[] = []; let charge: any = null;
  vi.stubGlobal("fetch", vi.fn(async (_path: any, options?: RequestInit) => {
    if (options?.method === "POST") {
      const body = JSON.parse(String(options.body)); writes.push(body);
      charge = { ...body, id: `post-checkout:${body.operationId}`, date: "2026-11-17" };
      if (writes.length === 1) throw Error("Response lost after commit");
      return Response.json(charge);
    }
    return Response.json({ charges: charge ? [charge] : [] });
  }));
  const tree = () => <QueryClientProvider client={client}><PostCheckoutConsumption reservationId="old-802" onInvoice={vi.fn()} /></QueryClientProvider>;
  const view = render(tree()); const user = userEvent.setup();
  await user.type(screen.getByLabelText("Descripción del consumo"), "Cena después del egreso");
  await user.type(screen.getByLabelText("Importe en pesos"), "121,50");
  await user.click(screen.getByRole("button", { name: "Guardar consumo" }));
  await screen.findByText("Response lost after commit");
  expect(screen.getByLabelText("Descripción del consumo")).toBeDisabled();
  view.unmount(); client.clear(); render(tree());
  expect(screen.getByLabelText("Descripción del consumo")).toHaveValue("Cena después del egreso");
  await user.click(screen.getByRole("button", { name: "Reintentar mismo consumo" }));
  await waitFor(() => expect(screen.getByLabelText("Descripción del consumo")).toHaveValue(""));
  expect(writes).toHaveLength(2); expect(writes[1]).toEqual(writes[0]);
  expect(writes[0]).toMatchObject({ amount: "121.50", category: "otros" });
  expect(sessionStorage.getItem("post-checkout-charge:old-802")).toBeNull();
});
it("requires an explicit physical reinstatement confirmation and keeps a room conflict visible", async () => {
  const writes: any[] = [];
  vi.stubGlobal("fetch", vi.fn(async (path: any, options?: RequestInit) => {
    if (options?.method === "POST") { writes.push(path); return Response.json({ error: "La habitación ya tiene otro huésped." }, { status: 409 }); }
    return Response.json({ allowed: true });
  }));
  const onComplete = vi.fn(); const user = userEvent.setup();
  render(<QueryClientProvider client={client}><RevertCheckout reservationId="old-802" onComplete={onComplete} /></QueryClientProvider>);
  await user.click(await screen.findByRole("button", { name: "Revertir check-out" }));
  expect(screen.getByRole("alertdialog")).toHaveTextContent("Cuenta y facturación");
  expect(writes).toHaveLength(0);
  await user.click(screen.getByRole("button", { name: "Confirmar reversión" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("La habitación ya tiene otro huésped.");
  expect(onComplete).not.toHaveBeenCalled(); expect(screen.getByRole("alertdialog")).toBeInTheDocument();
});
