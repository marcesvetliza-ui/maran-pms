/**
 * Tests for PrefacturaDialog — Factura T (turismo)
 *
 * Factura T used to be excluded from TIPO_OPTIONS entirely, regardless of the
 * guest's nationality — nobody could ever select it. The server already
 * validated it correctly (foreign guest + accommodation, billingTarget
 * "guest") and the client already tracked and sent nationality/nationalityCode
 * in folioContext on every submission; only the selector itself never offered
 * it. These tests cover the client side of unblocking it: it must appear only
 * for a foreign guest with accommodation selected, and the submission must
 * carry the guest's documentType (e.g. "passport") so the server can resolve
 * the correct AFIP DocTipo.
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

const RESERVATION_ID = "res-ft-test-1";

const FAKE_FOLIO = {
  reservationCode: "R-204",
  guestName: "John Foreign",
  roomNumber: "204",
  checkInDate: "2026-09-16",
  checkOutDate: "2026-09-20",
  nights: 4,
  roomRate: "12500.00",
  roomTotal: 50000,
  charges: [],
  totalCharges: 0,
  payments: [],
  totalPayments: 0,
  grandTotal: 50000,
  balance: 50000,
};

function buildFetchMock() {
  return vi.fn(async (url: string | URL | Request, options?: RequestInit) => {
    const strUrl = url.toString();
    if (strUrl.includes(`/api/reservations/${RESERVATION_ID}/folio`)) {
      return new Response(JSON.stringify(FAKE_FOLIO), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    if (strUrl.includes("/api/billing/config")) {
      return new Response(JSON.stringify({ puntoVenta: 1, arcaAmbiente: "ficticio" }), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    if (strUrl.includes("/api/billing/invoices") && options?.method?.toUpperCase() === "POST") {
      return new Response(JSON.stringify({
        id: 900, tipoComprobante: "FT", puntoVenta: 1, numero: 900, cae: "CAE-TEST-900", montoTotal: "50000.00",
      }), { status: 201, headers: { "Content-Type": "application/json" } });
    }
    return new Response(JSON.stringify([]), { status: 200, headers: { "Content-Type": "application/json" } });
  });
}

function Wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

function foreignReservation(overrides: Record<string, any> = {}) {
  return {
    id: RESERVATION_ID,
    status: "checked_in",
    checkOutDate: "2026-09-20",
    guest: {
      firstName: "John", lastName: "Foreign",
      vatCondition: "no_categorizado",
      documentType: "passport",
      documentNumber: "AB123456",
      nationality: "Brasil",
      nationalityCode: "BRA",
    },
    room: { roomNumber: "204" },
    ...overrides,
  } as any;
}

function argentineReservation() {
  return {
    id: RESERVATION_ID,
    status: "checked_in",
    checkOutDate: "2026-09-20",
    guest: {
      firstName: "Juan", lastName: "Argentino",
      vatCondition: "consumidor_final",
      documentType: "dni",
      documentNumber: "30111222",
      nationality: "Argentina",
      nationalityCode: "ARG",
    },
    room: { roomNumber: "204" },
  } as any;
}

function renderDialog(overrides: Partial<React.ComponentProps<typeof PrefacturaDialog>> = {}) {
  return render(
    <Wrapper>
      <PrefacturaDialog
        open
        onClose={vi.fn()}
        reservationId={RESERVATION_ID}
        reservation={foreignReservation()}
        mode="checkout"
        {...overrides}
      />
    </Wrapper>,
  );
}

describe("PrefacturaDialog — Factura T", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", buildFetchMock());
    vi.stubGlobal("open", vi.fn());
  });

  it('ofrece "Factura T" cuando el huésped es extranjero y hay alojamiento seleccionado', async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.click(await screen.findByTestId("select-receipt-type"));
    expect(await screen.findByRole("option", { name: /Factura T/i })).toBeInTheDocument();
  });

  it('no ofrece "Factura T" para un huésped argentino', async () => {
    const user = userEvent.setup();
    renderDialog({ reservation: argentineReservation() });

    await user.click(await screen.findByTestId("select-receipt-type"));
    expect(screen.queryByRole("option", { name: /Factura T/i })).not.toBeInTheDocument();
  });

  it('al elegir "Factura T", el importe a facturar/cobrar baja al neto sin el 21% (Decreto 1043/2016)', async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.click(await screen.findByTestId("select-receipt-type"));
    await user.click(await screen.findByRole("option", { name: /Factura T/i }));

    // 50000 (tarifa con IVA, igual que le cobrarían a un huésped local) / 1.21 = 41322.31
    await screen.findByTestId("text-factura-t-reintegro-note");
    expect(screen.getByTestId("text-importe-a-facturar")).toHaveTextContent("$41.322,31");
  });

  it("factura y cobra el neto sin IVA, no la tarifa completa que paga un huésped local", async () => {
    const capture: { body: any } = { body: undefined };
    vi.stubGlobal("fetch", vi.fn(async (url: string | URL | Request, options?: RequestInit) => {
      const strUrl = url.toString();
      if (strUrl.includes(`/api/reservations/${RESERVATION_ID}/folio`)) {
        return new Response(JSON.stringify(FAKE_FOLIO), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      if (strUrl.includes("/api/billing/config")) {
        return new Response(JSON.stringify({ puntoVenta: 1, arcaAmbiente: "ficticio" }), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      if (strUrl.includes("/api/billing/invoices") && options?.method?.toUpperCase() === "POST") {
        capture.body = JSON.parse(String(options?.body ?? "{}"));
        return new Response(JSON.stringify({
          id: 900, tipoComprobante: "FT", puntoVenta: 1, numero: 900, cae: "CAE-TEST-900", montoTotal: "41322.31",
        }), { status: 201, headers: { "Content-Type": "application/json" } });
      }
      return new Response(JSON.stringify([]), { status: 200, headers: { "Content-Type": "application/json" } });
    }));
    const user = userEvent.setup();
    renderDialog();

    await user.click(await screen.findByTestId("select-receipt-type"));
    await user.click(await screen.findByRole("option", { name: /Factura T/i }));

    await user.click(await screen.findByTestId("button-registrar-emitir"));
    await waitFor(() => expect(capture.body).toBeTruthy());

    expect(capture.body.items).toHaveLength(1);
    expect(capture.body.items[0].subtotal).toBe(41322.31);
    expect(capture.body.sourceChargeAmounts.accommodation).toBe(41322.31);
  });

  it("al emitirla, manda tipoComprobante FT y el documentType del huésped para que ARCA reciba el tipo de documento correcto", async () => {
    const capture: { body: any } = { body: undefined };
    vi.stubGlobal("fetch", vi.fn(async (url: string | URL | Request, options?: RequestInit) => {
      const strUrl = url.toString();
      if (strUrl.includes(`/api/reservations/${RESERVATION_ID}/folio`)) {
        return new Response(JSON.stringify(FAKE_FOLIO), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      if (strUrl.includes("/api/billing/config")) {
        return new Response(JSON.stringify({ puntoVenta: 1, arcaAmbiente: "ficticio" }), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      if (strUrl.includes("/api/billing/invoices") && options?.method?.toUpperCase() === "POST") {
        capture.body = JSON.parse(String(options?.body ?? "{}"));
        return new Response(JSON.stringify({
          id: 900, tipoComprobante: "FT", puntoVenta: 1, numero: 900, cae: "CAE-TEST-900", montoTotal: "50000.00",
        }), { status: 201, headers: { "Content-Type": "application/json" } });
      }
      return new Response(JSON.stringify([]), { status: 200, headers: { "Content-Type": "application/json" } });
    }));
    const user = userEvent.setup();
    renderDialog();

    await user.click(await screen.findByTestId("select-receipt-type"));
    await user.click(await screen.findByRole("option", { name: /Factura T/i }));

    await user.click(await screen.findByTestId("button-registrar-emitir"));
    await waitFor(() => expect(capture.body).toBeTruthy());

    expect(capture.body.tipoComprobante).toBe("FT");
    expect(capture.body.cliente.documentType).toBe("passport");
    expect(capture.body.cliente.dni).toBe("AB123456");
    expect(capture.body.folioContext.nationalityCode).toBe("BRA");
    expect(capture.body.folioContext.hasAccommodation).toBe(true);
  });
});
