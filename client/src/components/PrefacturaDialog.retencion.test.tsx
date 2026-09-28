/**
 * Tests for PrefacturaDialog — retención impositiva en el cobro
 *
 * Bug real: cuando una empresa/agencia paga reteniendo IIBB/Ganancias, el
 * sistema mandaba UN solo POST /api/payments por el bruto (neto + retención)
 * bajo el método real elegido — Caja y el PDF mostraban plata que nunca
 * entró al banco. El arreglo separa el cobro en dos POST: uno por el neto
 * bajo el método real, y otro por la retención bajo su propio método
 * informativo "retencion_<tipo>" (no cuenta como caja física, pero sigue
 * saldando el folio — mismo tratamiento que Cuenta Corriente/Voucher).
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

const RESERVATION_ID = "res-retencion-test-1";

const FAKE_FOLIO = {
  reservationCode: "R-002",
  guestName: "Empresa de Prueba",
  roomNumber: "202",
  checkInDate: "2026-07-28",
  checkOutDate: "2026-08-02",
  nights: 5,
  roomRate: "0.00",
  roomTotal: 0,
  charges: [{
    id: "charge-retencion",
    description: "Cargo a facturar",
    amount: "100.00",
    category: "otros",
    date: "2026-08-01",
  }],
  totalCharges: 100,
  payments: [],
  totalPayments: 0,
  grandTotal: 100,
  balance: 100,
};

const RESERVATION = {
  id: RESERVATION_ID,
  status: "checked_in",
  checkOutDate: "2026-08-02",
  guest: {
    firstName: "Empresa",
    lastName: "de Prueba",
    vatCondition: "consumidor_final",
    documentNumber: "12345678",
  },
  room: { roomNumber: "202" },
} as any;

function buildFetchMock() {
  return vi.fn(async (url: string | URL | Request, options?: RequestInit) => {
    const strUrl = url.toString();
    const method = options?.method?.toUpperCase() ?? "GET";

    if (strUrl.includes(`/api/reservations/${RESERVATION_ID}/folio`)) {
      return new Response(JSON.stringify(FAKE_FOLIO), {
        status: 200, headers: { "Content-Type": "application/json" },
      });
    }
    if (strUrl.includes("/api/billing/config")) {
      return new Response(JSON.stringify({ puntoVenta: 1, arcaAmbiente: "ficticio" }), {
        status: 200, headers: { "Content-Type": "application/json" },
      });
    }
    if (strUrl.includes("/api/billing/invoices") && method === "POST") {
      return new Response(JSON.stringify({
        id: 900, tipoComprobante: "FB", puntoVenta: 1, numero: 900,
        cae: "CAE-TEST-900", montoTotal: "100.00",
      }), {
        status: 201, headers: { "Content-Type": "application/json" },
      });
    }
    if (strUrl.includes("/api/payments") && method === "POST") {
      return new Response(JSON.stringify({ id: `payment-${Math.random()}` }), {
        status: 201, headers: { "Content-Type": "application/json" },
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

function renderDialog() {
  render(
    <Wrapper>
      <PrefacturaDialog
        open
        onClose={vi.fn()}
        reservationId={RESERVATION_ID}
        reservation={RESERVATION}
        mode="billing"
      />
    </Wrapper>,
  );
}

function paymentPosts(fetchMock: ReturnType<typeof buildFetchMock>) {
  return fetchMock.mock.calls
    .filter(([url, options]) =>
      String(url).includes("/api/payments") &&
      String((options as RequestInit | undefined)?.method).toUpperCase() === "POST")
    .map(([, options]) => JSON.parse(String((options as RequestInit).body)));
}

describe("PrefacturaDialog — retención impositiva en el cobro", () => {
  let fetchMock: ReturnType<typeof buildFetchMock>;

  beforeEach(() => {
    fetchMock = buildFetchMock();
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("open", vi.fn());
  });

  it("separa el neto y la retención en dos POST /api/payments distintos", async () => {
    const user = userEvent.setup();
    renderDialog();

    const amountInput = await screen.findByTestId("input-payment-amount-0");
    await user.clear(amountInput);
    await user.type(amountInput, "98");

    await user.click(screen.getByTestId("btn-add-retencion-0"));
    await user.type(screen.getByTestId("input-retencion-monto-0"), "2");

    const submitBtn = await screen.findByTestId("button-registrar-emitir");
    await waitFor(() => expect(submitBtn).toBeEnabled());
    await user.click(submitBtn);

    await waitFor(() => expect(paymentPosts(fetchMock).length).toBe(2));
    const posts = paymentPosts(fetchMock);

    const netPost = posts.find(p => p.method === "efectivo");
    const retPost = posts.find(p => p.method === "retencion_iibb");
    expect(netPost).toMatchObject({ amount: "98.00" });
    expect(retPost).toMatchObject({ amount: "2.00" });
    // La retención nunca es plata real: nunca debe viajar bajo el método de
    // pago elegido para el neto.
    expect(posts.every(p => p.method !== "efectivo" || p.amount === "98.00")).toBe(true);
  });

  it("no manda ningún POST de retención cuando no se activa el toggle", async () => {
    const user = userEvent.setup();
    renderDialog();

    const submitBtn = await screen.findByTestId("button-registrar-emitir");
    await waitFor(() => expect(submitBtn).toBeEnabled());
    await user.click(submitBtn);

    await waitFor(() => expect(paymentPosts(fetchMock).length).toBe(1));
    const posts = paymentPosts(fetchMock);
    expect(posts[0]).toMatchObject({ method: "efectivo", amount: "100.00" });
  });
});
