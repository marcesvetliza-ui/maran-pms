/**
 * Tests for PrefacturaDialog — Notas de la reserva at check-out
 *
 * Recepción needs to see the reservation's notes (e.g. "PAGA ALOJA GERMAN
 * DEL TORNEO" — who's covering the bill) at the moment they do the
 * check-out, not just buried in the Planning detail popup. The data was
 * already delivered to the client (reservations.notes is never stripped),
 * this only adds the missing render.
 */

import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";

vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: vi.fn(), toasts: [], dismiss: vi.fn() }),
}));

vi.mock("@/lib/queryClient", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@/lib/queryClient")>();
  return {
    ...mod,
    queryClient: new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    }),
  };
});

const { PrefacturaDialog } = await import("./PrefacturaDialog");

const RESERVATION_ID = "res-notes-test-1";

const FAKE_FOLIO = {
  reservationCode: "R-001",
  guestName: "Test Guest",
  roomNumber: "206",
  checkInDate: "2026-09-16",
  checkOutDate: "2026-09-20",
  nights: 4,
  roomRate: "0.00",
  roomTotal: 0,
  charges: [],
  totalCharges: 0,
  payments: [],
  totalPayments: 0,
  grandTotal: 0,
  balance: 0,
};

function buildFetchMock() {
  return vi.fn(async (url: string | URL | Request) => {
    const strUrl = url.toString();
    if (strUrl.includes(`/api/reservations/${RESERVATION_ID}/folio`)) {
      return new Response(JSON.stringify(FAKE_FOLIO), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    if (strUrl.includes("/api/billing/config")) {
      return new Response(JSON.stringify({ puntoVenta: 1, arcaAmbiente: "ficticio" }), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    return new Response(JSON.stringify([]), { status: 200, headers: { "Content-Type": "application/json" } });
  });
}

function Wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

function baseReservation(overrides: Record<string, any> = {}) {
  return {
    id: RESERVATION_ID,
    status: "checked_in",
    checkOutDate: "2026-09-20",
    guest: { firstName: "Nelson", lastName: "Ledesma", vatCondition: "consumidor_final" },
    room: { roomNumber: "206" },
    ...overrides,
  } as any;
}

function renderDialog(overrides: Partial<React.ComponentProps<typeof PrefacturaDialog>> = {}) {
  return render(
    <Wrapper>
      <PrefacturaDialog
        open
        onClose={vi.fn()}
        reservationId={RESERVATION_ID}
        reservation={baseReservation()}
        mode="checkout"
        {...overrides}
      />
    </Wrapper>,
  );
}

describe("PrefacturaDialog — Notas de la reserva", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", buildFetchMock());
  });

  it("muestra las notas de la reserva al hacer check-out", async () => {
    renderDialog({ reservation: baseReservation({ notes: "PAGA ALOJA GERMAN DEL TORNEO\nEXTRA PAGA PAX" }) });

    expect(await screen.findByTestId("prefactura-reservation-notes")).toBeInTheDocument();
    expect(screen.getByText(/PAGA ALOJA GERMAN DEL TORNEO/)).toBeInTheDocument();
  });

  it("no muestra el bloque de notas cuando la reserva no tiene notas", async () => {
    renderDialog({ reservation: baseReservation({ notes: null }) });

    await screen.findByTestId("button-registrar-emitir");
    expect(screen.queryByTestId("prefactura-reservation-notes")).not.toBeInTheDocument();
  });

  it("no muestra las notas en modo billing (solo aplica al check-out)", async () => {
    renderDialog({ mode: "billing", reservation: baseReservation({ notes: "Nota que no debería verse acá" }) });

    await screen.findByTestId("button-registrar-emitir");
    expect(screen.queryByTestId("prefactura-reservation-notes")).not.toBeInTheDocument();
  });
});
