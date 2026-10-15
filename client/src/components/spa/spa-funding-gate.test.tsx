import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, expect, it, vi } from "vitest";
import { SpaFundingGate } from "./spa-funding-gate";

vi.mock("./spa-funding-connected-panel", () => ({ SpaFundingConnectedPanel: () => <p>Nuevo circuito conectado</p> }));
function mount(enabled = true) {
  return render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })}>
    <SpaFundingGate enabled={enabled} accountId="spa-test" userId="u" canWrite canAdopt>
      <button>Circuito anterior</button>
    </SpaFundingGate>
  </QueryClientProvider>);
}
afterEach(() => vi.unstubAllGlobals());
it("flag apagado mantiene el circuito anterior sin consultar ni adoptar cuentas", () => {
  const fetch = vi.fn(); vi.stubGlobal("fetch", fetch); mount(false);
  expect(screen.getByRole("button", { name: "Circuito anterior" })).toBeEnabled();
  expect(fetch).not.toHaveBeenCalled();
});
it("mantiene cuentas no vinculadas y cambia sólo después de la confirmación persistida", async () => {
  let adopted = false;
  const fetch = vi.fn(async (url: string, init?: RequestInit) => {
    if (url.endsWith("/adopt-unbilled")) {
      expect(init?.method).toBe("POST"); expect(init?.body).toBe("{}"); adopted = true;
      return new Response(JSON.stringify({ ok: true, data: { accountId: "spa-test" } }));
    }
    return new Response(JSON.stringify({ ok: true, data: { adopted } }));
  });
  vi.stubGlobal("fetch", fetch); const user = userEvent.setup(); mount();
  expect(await screen.findByRole("button", { name: "Circuito anterior" })).toBeEnabled();
  expect(fetch.mock.calls.every(([, init]) => init?.method !== "POST")).toBe(true);
  await user.click(screen.getByRole("button", { name: "Vincular cuenta al nuevo circuito" }));
  expect(await screen.findByText("Nuevo circuito conectado")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Circuito anterior" })).not.toBeInTheDocument();
});
it("una cuenta ya vinculada nunca muestra los controles legacy", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ ok: true, data: { adopted: true } }))));
  mount(); expect(await screen.findByText("Nuevo circuito conectado")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Circuito anterior" })).not.toBeInTheDocument();
});
it("si no se puede verificar la vinculación, bloquea ambos circuitos y ofrece volver a consultar", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response("unavailable", { status: 503 })));
  mount(); expect(await screen.findByRole("alert")).toHaveTextContent("No se pudo verificar");
  expect(screen.queryByRole("button", { name: "Circuito anterior" })).not.toBeInTheDocument();
  await waitFor(() => expect(screen.getByRole("button", { name: "Volver a consultar" })).toBeEnabled());
});
