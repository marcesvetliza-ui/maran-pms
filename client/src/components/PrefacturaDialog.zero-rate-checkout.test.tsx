/**
 * PrefacturaDialog — check-out de una reserva sin nada para facturar
 *
 * Bug reportado: una reserva con tarifa $0 (sin cargos) no podía hacer
 * check-out desde Prefactura — el botón "Registrar y emitir" quedaba
 * deshabilitado (no hay ningún importe seleccionado para facturar) y el
 * atajo existente para "ya cobrado y facturado" (que muestra un botón
 * "Dar check-out" y salta la emisión) exigía que hubiera existido AL MENOS
 * un ítem facturable, cosa que nunca pasa cuando la tarifa y los cargos son
 * $0 desde el principio.
 *
 * Ahora ese mismo atajo también cubre "nunca hubo nada para facturar":
 * aparece el botón "Dar check-out", que hace el check-out directo sin
 * emitir comprobante ni registrar un pago.
 */

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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

const RESERVATION_ID = "res-zero-rate-1";

// Tarifa $0 y ningún cargo — el caso reportado (Hab. 301, FARÍAS CESAR).
const ZERO_RATE_FOLIO = {
  reservationCode: "R-301",
  guestName: "Farías César",
  roomNumber: "301",
  checkInDate: "2026-09-18",
  checkOutDate: "2026-09-21",
  nights: 3,
  roomRate: "0.00",
  roomTotal: 0,
  charges: [],
  totalCharges: 0,
  payments: [],
  totalPayments: 0,
  grandTotal: 0,
  balance: 0,
};

// Con un cargo real pendiente — debe seguir exigiendo facturar como antes.
const REAL_CHARGE_FOLIO = {
  ...ZERO_RATE_FOLIO,
  charges: [{
    id: "charge-real",
    description: "Consumo restaurante",
    amount: "500.00",
    category: "otros",
    date: "2026-09-19",
  }],
  totalCharges: 500,
  grandTotal: 500,
  balance: 500,
};

const RESERVATION = {
  id: RESERVATION_ID,
  status: "checked_in",
  checkOutDate: "2026-09-21",
  guest: {
    firstName: "César",
    lastName: "Farías",
    vatCondition: "consumidor_final",
    documentNumber: undefined,
  },
  room: { roomNumber: "301" },
} as any;

function buildFetchMock(folio: typeof ZERO_RATE_FOLIO, checkoutStatus = 200) {
  return vi.fn(async (url: string | URL | Request, options?: RequestInit) => {
    const strUrl = url.toString();
    const method = options?.method?.toUpperCase() ?? "GET";

    if (strUrl.includes(`/api/reservations/${RESERVATION_ID}/folio`)) {
      return new Response(JSON.stringify(folio), {
        status: 200, headers: { "Content-Type": "application/json" },
      });
    }
    if (strUrl.includes("/api/billing/config")) {
      return new Response(JSON.stringify({ puntoVenta: 1, arcaAmbiente: "ficticio" }), {
        status: 200, headers: { "Content-Type": "application/json" },
      });
    }
    if (
      strUrl.includes(`/api/reservations/${RESERVATION_ID}/check-out`) &&
      method === "POST"
    ) {
      return new Response(JSON.stringify({ ok: true }), {
        status: checkoutStatus, headers: { "Content-Type": "application/json" },
      });
    }
    return new Response(JSON.stringify([]), {
      status: 200, headers: { "Content-Type": "application/json" },
    });
  });
}

function Wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

function renderDialog(overrides: Partial<React.ComponentProps<typeof PrefacturaDialog>> = {}) {
  const onClose = vi.fn();
  const onCheckoutComplete = vi.fn();
  render(
    <Wrapper>
      <PrefacturaDialog
        open
        onClose={onClose}
        reservationId={RESERVATION_ID}
        reservation={RESERVATION}
        mode="checkout"
        onCheckoutComplete={onCheckoutComplete}
        {...overrides}
      />
    </Wrapper>,
  );
  return { onClose, onCheckoutComplete };
}

describe("PrefacturaDialog — check-out de reserva sin nada para facturar (tarifa $0)", () => {
  beforeEach(() => {
    vi.stubGlobal("open", vi.fn());
  });

  it("muestra el botón 'Dar check-out' en vez de dejar 'Registrar y emitir' deshabilitado sin salida", async () => {
    vi.stubGlobal("fetch", buildFetchMock(ZERO_RATE_FOLIO));
    renderDialog();

    const checkoutBtn = await screen.findByRole("button", { name: /dar check-out/i });
    expect(checkoutBtn).toBeEnabled();
  });

  it("explica que no hay nada para facturar (no dice 'ya existe un comprobante emitido')", async () => {
    vi.stubGlobal("fetch", buildFetchMock(ZERO_RATE_FOLIO));
    renderDialog();

    await screen.findByText(/esta reserva no tiene nada para facturar/i);
    expect(screen.queryByText(/ya existe un comprobante emitido/i)).not.toBeInTheDocument();
  });

  it("al hacer click en 'Dar check-out' llama al check-out directo, sin emitir factura ni registrar pago", async () => {
    const fetchMock = buildFetchMock(ZERO_RATE_FOLIO);
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    const { onClose, onCheckoutComplete } = renderDialog();

    const checkoutBtn = await screen.findByRole("button", { name: /dar check-out/i });
    await user.click(checkoutBtn);

    await waitFor(() => expect(onCheckoutComplete).toHaveBeenCalled());
    expect(onClose).toHaveBeenCalled();

    const calledUrls = fetchMock.mock.calls.map(([url]) => String(url));
    expect(calledUrls.some((u) => u.includes("/api/billing/invoices"))).toBe(false);
    expect(calledUrls.some((u) => u.includes("/api/payments"))).toBe(false);
    expect(calledUrls.some((u) =>
      u.includes(`/api/reservations/${RESERVATION_ID}/check-out`))).toBe(true);
  });

  it("sigue exigiendo facturar cuando la reserva SÍ tiene un cargo real pendiente", async () => {
    vi.stubGlobal("fetch", buildFetchMock(REAL_CHARGE_FOLIO));
    renderDialog();

    // El atajo de "nada para facturar" no debe aparecer con un cargo real.
    await screen.findByTestId("button-registrar-emitir");
    expect(screen.queryByRole("button", { name: /dar check-out/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/esta reserva no tiene nada para facturar/i)).not.toBeInTheDocument();
  });
});
