import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("@/lib/queryClient", () => ({ apiRequest: vi.fn() }));
import { apiRequest } from "@/lib/queryClient";
import { ChannexSettlementRate, ReservationChannexSettlement } from "./channex-settlement";
let client: QueryClient | undefined;
afterEach(() => { cleanup(); client?.clear(); vi.resetAllMocks(); });
describe("explicit USD quote and reservation origin", () => {
  it("requires a valid quote and a source before saving without a default", () => {
    const onSave = vi.fn(); render(<ChannexSettlementRate rate={null} pending={false} onSave={onSave} />);
    expect(screen.getByLabelText("Pesos por USD")).toHaveValue("");
    expect(screen.getByRole("button", { name: "Guardar cotización" })).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Pesos por USD"), { target: { value: "1250,123456" } });
    expect(screen.getByRole("button", { name: "Guardar cotización" })).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Fuente o motivo de la cotización"), { target: { value: "Cotización del hotel" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar cotización" }));
    expect(onSave).toHaveBeenCalledExactlyOnceWith("1250.123456", "Cotización del hotel");
    expect(screen.getByText(/las ya ingresadas conservan su cotización/)).toBeInTheDocument();
  });
  it("requires an audit reason to remove the quote for future bookings", () => {
    const onSave = vi.fn(); render(<ChannexSettlementRate rate="1250.000000" pending={false} onSave={onSave} />);
    expect(screen.getByRole("button", { name: "Quitar para nuevas reservas" })).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Fuente o motivo de la cotización"), { target: { value: "Pausar nuevas conversiones" } });
    fireEvent.click(screen.getByRole("button", { name: "Quitar para nuevas reservas" }));
    expect(onSave).toHaveBeenCalledExactlyOnceWith(null, "Pausar nuevas conversiones");
  });
  it("shows original USD, frozen rate and registered ARS separately from the folio balance", async () => {
    vi.mocked(apiRequest).mockResolvedValue({ json: async () => ({ source_currency: "USD", source_total: "250.00", exchange_rate: "1250.000000", settlement_currency: "ARS", settlement_total: "312500.00" }) } as Response);
    client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
    render(<QueryClientProvider client={client}><ReservationChannexSettlement reservationId="synthetic" open /></QueryClientProvider>);
    expect(await screen.findByText("Importe original de Channex")).toBeInTheDocument();
    expect(screen.getByText(/USD.*250,00/)).toBeInTheDocument();
    expect(screen.getByText(/Registrado al ingresar:.*ARS.*312.500,00/)).toBeInTheDocument();
    expect(screen.getByText(/el saldo se consultan en el folio/)).toBeInTheDocument();
    expect(apiRequest).toHaveBeenCalledExactlyOnceWith("GET", "/api/reservations/synthetic/channex-settlement");
  });
});
