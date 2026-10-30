import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ allowed: true }));
vi.mock("@/App", () => ({ useAuth: () => ({ hasPermission: () => state.allowed }) }));
vi.mock("@/lib/queryClient", () => ({ apiRequest: vi.fn() }));
import { apiRequest } from "@/lib/queryClient";
import { ChannexReadiness } from "./channex-readiness";
const clients: QueryClient[] = [];
afterEach(() => { cleanup(); clients.splice(0).forEach(client => client.clear()); vi.resetAllMocks(); state.allowed = true; });
function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  clients.push(client);
  return render(<QueryClientProvider client={client}><ChannexReadiness connectionId="test-connection" /></QueryClientProvider>);
}
describe("Channex staging preparation", () => {
  it("only checks on demand and explains currency blockers without claiming certification", async () => {
    vi.mocked(apiRequest).mockResolvedValue({
      json: async () => ({
        configurationReady: false, activationReady: false, floor: 2, currency: "USD", roomCount: 8,
        checks: [{ id: "reservation_currency", area: "configuration", ok: false, message: "La recepción automática admite ARS." }],
      })
    } as Response);
    mount();
    expect(apiRequest).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Revisar preparación" }));
    expect(await screen.findByText(/La recepción automática admite ARS/)).toBeInTheDocument();
    expect(screen.getByText(/no acredita la certificación/)).toBeInTheDocument();
    expect(apiRequest).toHaveBeenCalledExactlyOnceWith("GET", "/api/channex/connections/test-connection/inbound/readiness");
    fireEvent.click(screen.getByRole("button", { name: "Revisar preparación" }));
    await waitFor(() => expect(apiRequest).toHaveBeenCalledTimes(2));
  });
  it("shows a failed check without suggesting activation", async () => {
    vi.mocked(apiRequest).mockRejectedValue(new Error("Unavailable"));
    mount(); fireEvent.click(screen.getByRole("button", { name: "Revisar preparación" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("No se pudo revisar");
    expect(screen.queryByText(/Configuración local completa/)).not.toBeInTheDocument();
  });
  it("does not query or show controls without configuration permission", () => {
    state.allowed = false; mount();
    expect(screen.queryByRole("button")).not.toBeInTheDocument(); expect(apiRequest).not.toHaveBeenCalled();
  });
});
