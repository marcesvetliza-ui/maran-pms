import { beforeEach, describe, expect, it, vi } from "vitest";
import { createRef } from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { useQuery } from "@tanstack/react-query";
import { ReservationFolioSummary, ReservationNightlyPricing, type ReservationNightlyPricingHandle } from "./reservation-nightly-pricing";
import { ReservationFolioHeader } from "./reservation-folio-header";
import { Dialog, DialogContent } from "@/components/ui/dialog";

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
  vi.mocked(useQuery).mockClear();
  vi.mocked(useQuery).mockImplementation(({ queryKey }: any) => ({
    data: queryKey[0] === "/api/reservation-pricing/activation"
      ? { activatedAt, timeZone: "America/Argentina/Buenos_Aires" }
      : queryKey[0] === "/api/reservation-edit-permission" ? {canEdit:true} : data,
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
    const ref = createRef<ReservationNightlyPricingHandle>();
    render(<ReservationNightlyPricing ref={ref} reservationId="saved-reservation" role="reception" />);
    expect(screen.getByRole("table")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Editar tarifas" })).toBeEnabled();
    expect(screen.queryByText("Importe de la estadía")).not.toBeInTheDocument();
    act(() => ref.current?.openStay());
    expect(screen.getByRole("dialog", { name: "Modificar estadía" })).toBeInTheDocument();
    expect(screen.getByLabelText("Seleccionar noche 20/10/2026")).not.toBeChecked();
  });

  it("no exige habilitación para usar el folio", () => {
    activatedAt = null;
    render(<ReservationNightlyPricing reservationId="saved-reservation" role="admin" />);
    expect(screen.getByText("Importe de la estadía")).toBeInTheDocument();
    expect(screen.queryByRole("button", {name: /Habilitar tarifas/})).not.toBeInTheDocument();
    expect(vi.mocked(useQuery).mock.calls.every(([options]:any)=>options.queryKey[0] !== "/api/reservation-pricing/activation")).toBe(true);
  });

  it("muestra el saldo real sin instrucciones técnicas permanentes", () => {
    render(<ReservationFolioSummary lodging={180} consumptions={0} payments={200} total={180} pendingCollection={0} pendingBilling={180} />);
    expect(screen.getByText("Saldo a favor")).toBeInTheDocument();
    expect(screen.getByText(/\$\s*20,00/)).toBeInTheDocument();
    expect(screen.queryByText(/Caja automáticamente|no descuentan las tarifas/i)).not.toBeInTheDocument();
  });

  it("conecta la selección de noches con el descuento real del editor", () => {
    data.reservation.pricingScheme = "nightly_v1";
    data.reservation.nightlyPricing = [{ date: "2026-10-20", rateCents: 18000, discountCents: 0 }];
    render(<ReservationNightlyPricing reservationId="saved-reservation" role="reception" />);
    fireEvent.click(screen.getByRole("checkbox", { name: "Seleccionar noche 20/10/2026" }));
    expect(screen.getByText("1 noche seleccionada")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Aplicar descuento" }));
    expect(screen.getByRole("combobox", { name: "Tipo de descuento" })).toHaveValue("percent");
    expect(screen.getByRole("button", { name: "Confirmar cambios" })).toBeDisabled();
  });

  it("usa la cabecera aprobada con datos y acciones de la reserva, sin ejemplo", () => {
    const close = vi.fn(), edit = vi.fn();
    render(<Dialog open><DialogContent><ReservationFolioHeader
      reservation={{ ...data.reservation, reservationCode: "RES-REAL", guest: { firstName: "Ana", lastName: "Test" }, room: { roomNumber: "205", roomType: { name: "Doble" } } }}
      status={<span>Confirmada</span>} onClose={close} onEditStay={edit}
    /></DialogContent></Dialog>);
    expect(screen.getByRole("heading", { name: "Ana Test" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Habitación 205" })).toBeInTheDocument();
    expect(screen.queryByText(/Prototipo|Datos de ejemplo|Sofía Álvarez|Restablecer ejemplo/i)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Modificar estadía" }));
    expect(edit).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole("button", { name: "Cerrar detalle de reserva" }));
    expect(close).toHaveBeenCalledOnce();
  });
});


it("labels a fully paid non-fiscal room closure as documented, not as a fiscal invoice", () => {
  render(<ReservationFolioSummary lodging={144000} consumptions={0} payments={144000} total={144000} pendingCollection={0} pendingBilling={0} hasRoomVoucher />);
  expect(screen.getByText("Documentado")).toBeInTheDocument();
  expect(screen.getByText("Pendiente de comprobante")).toBeInTheDocument();
  expect(screen.queryByText("Facturado")).not.toBeInTheDocument();
});
