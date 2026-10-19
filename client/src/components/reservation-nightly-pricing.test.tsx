import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { useQuery } from "@tanstack/react-query";
import { ReservationFolioSummary, ReservationNightlyPricing } from "./reservation-nightly-pricing";

vi.mock("@tanstack/react-query", () => ({
  useQuery: vi.fn(),
  useMutation: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock("@/lib/queryClient", () => ({
  queryClient: { invalidateQueries: vi.fn(), setQueryData: vi.fn() },
  apiRequest: vi.fn(),
  apiRequestWithGroupInventoryWarning: vi.fn(),
}));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));

let data: any;
let activatedAt: string | null;
beforeEach(() => {
  data = {
    reservation: {
      id: "saved-reservation", status: "confirmed", pricingScheme: "legacy",
      totalRoomAmount: "180.00", nights: 1, checkInDate: "2026-10-20",
      checkOutDate: "2026-10-21", discountType: "none", discountValue: "0",
    },
    blocked: null,
    fiscal: { state: "pendiente", coveredCents: 0, pendingCents: 18000 },
  };
  activatedAt = "2026-10-19T12:00:00Z";
  vi.mocked(useQuery).mockImplementation(({ queryKey }: any) => ({
    data: queryKey[0] === "/api/reservation-pricing/activation"
      ? { activatedAt, timeZone: "America/Argentina/Buenos_Aires" } : data,
    isLoading: false, isError: false, refetch: vi.fn(),
  }) as any);
});

describe("Folio con información operativa", () => {
  it("presenta el importe guardado sin avisos de migración ni noches inventadas", () => {
    const edit = vi.fn();
    render(<ReservationNightlyPricing reservationId="saved-reservation" role="reception" onLegacyEdit={edit} />);
    expect(screen.getByText("Importe de la estadía")).toBeInTheDocument();
    expect(screen.getByText(/1 noche · 20\/10\/2026 → 21\/10\/2026/)).toBeInTheDocument();
    expect(screen.getAllByText(/\$\s*180,00/).length).toBeGreaterThan(0);
    expect(screen.queryByText(/esquema anterior|circuito anterior|conserva sus importes|promedio no representa/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Editar alojamiento" }));
    expect(edit).toHaveBeenCalledOnce();
  });

  it("conserva la información del descuento registrado", () => {
    data.reservation.discountType = "percent";
    data.reservation.discountValue = "10";
    render(<ReservationNightlyPricing reservationId="saved-reservation" />);
    expect(screen.getByText("Descuento aplicado: 10%")).toBeInTheDocument();
  });

  it("mantiene el bloqueo fiscal en la edición de alojamiento", () => {
    data.blocked = "El alojamiento tiene cobertura fiscal.";
    render(<ReservationNightlyPricing reservationId="saved-reservation" onLegacyEdit={vi.fn()} />);
    expect(screen.getByText(data.blocked)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Editar alojamiento" })).toBeDisabled();
  });

  it("conserva la tabla y las acciones de las tarifas nocturnas reales", () => {
    data.reservation.pricingScheme = "nightly_v1";
    data.reservation.nightlyPricing = [{ date: "2026-10-20", rateCents: 18000, discountCents: 0 }];
    render(<ReservationNightlyPricing reservationId="saved-reservation" role="reception" />);
    expect(screen.getByRole("table")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Editar tarifas" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Modificar estadía" })).toBeEnabled();
    expect(screen.queryByText("Importe de la estadía")).not.toBeInTheDocument();
  });

  it("mantiene la habilitación explícita para las altas nuevas", () => {
    activatedAt = null;
    render(<ReservationNightlyPricing reservationId="saved-reservation" role="admin" />);
    expect(screen.getByRole("button", { name: "Habilitar tarifas por noche" })).toBeInTheDocument();
    expect(screen.queryByText(/nuevo esquema|no convierte/i)).not.toBeInTheDocument();
  });

  it("muestra el saldo real sin instrucciones técnicas permanentes", () => {
    render(<ReservationFolioSummary lodging={180} consumptions={0} payments={200} total={180} pendingCollection={0} pendingBilling={180} />);
    expect(screen.getByText("Saldo a favor")).toBeInTheDocument();
    expect(screen.getByText(/\$\s*20,00/)).toBeInTheDocument();
    expect(screen.queryByText(/Caja automáticamente|no descuentan las tarifas/i)).not.toBeInTheDocument();
  });
});
