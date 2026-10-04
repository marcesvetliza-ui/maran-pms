/**
 * PrefacturaDialog — punto de venta en ambiente de homologación
 *
 * El selector de "Punto de venta" mostraba y sugería por defecto los PV
 * operativos del hotel (Recepción, Restaurant, etc. — son de producción),
 * incluso con el ambiente ARCA en homologación. Al enviar la factura, ese
 * PV operativo pisaba el fallback correcto del servidor (puntoVentaHomolog,
 * el PV dedicado a pruebas), haciendo que las facturas de prueba terminaran
 * numerándose contra el PV de producción — exactamente lo que ese PV
 * dedicado existe para evitar.
 *
 * En homologación, el selector ahora solo ofrece (y solo sugiere) el PV de
 * homologación configurado, sin importar qué PV operativos existan.
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

const RESERVATION_ID = "res-homolog-pv-1";

const FOLIO = {
  reservationCode: "R-202",
  guestName: "Svetliza Marcelo",
  roomNumber: "202",
  checkInDate: "2026-10-01",
  checkOutDate: "2026-10-04",
  nights: 3,
  roomRate: "70000.00",
  roomTotal: 70000,
  charges: [{
    id: "charge-room",
    description: "Alojamiento",
    amount: "70000.00",
    category: "alojamiento",
    date: "2026-10-01",
  }],
  totalCharges: 70000,
  payments: [],
  totalPayments: 0,
  grandTotal: 70000,
  balance: 70000,
};

const RESERVATION = {
  id: RESERVATION_ID,
  status: "checked_in",
  checkOutDate: "2026-10-04",
  guest: {
    firstName: "Marcelo",
    lastName: "Svetliza",
    vatCondition: "consumidor_final",
    documentNumber: "23232323",
  },
  room: { roomNumber: "202" },
} as any;

// Varios PV operativos activos — ninguno debe terminar usándose en homologación.
const OPERATIONAL_POS_CONFIGS = [
  { id: "pos-20", numero: 20, nombre: "NO ELECTRÓNICO", activo: true },
  { id: "pos-21", numero: 21, nombre: "Recepción", activo: true },
  { id: "pos-22", numero: 22, nombre: "Recepcion 2", activo: true },
];

function buildFetchMock() {
  return vi.fn(async (url: string | URL | Request, options?: RequestInit) => {
    const strUrl = url.toString();
    const method = options?.method?.toUpperCase() ?? "GET";

    if (strUrl.includes(`/api/reservations/${RESERVATION_ID}/folio`)) {
      return new Response(JSON.stringify(FOLIO), {
        status: 200, headers: { "Content-Type": "application/json" },
      });
    }
    if (strUrl.includes(`/api/reservations/${RESERVATION_ID}/invoices`)) {
      return new Response(JSON.stringify([]), {
        status: 200, headers: { "Content-Type": "application/json" },
      });
    }
    if (strUrl.includes("/api/billing/config")) {
      return new Response(JSON.stringify({
        puntoVenta: 1,
        puntoVentaHomolog: 5,
        arcaAmbiente: "homologacion",
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    if (strUrl.includes("/api/pos-configs")) {
      return new Response(JSON.stringify(OPERATIONAL_POS_CONFIGS), {
        status: 200, headers: { "Content-Type": "application/json" },
      });
    }
    if (strUrl.includes("/api/billing/invoices") && method === "POST") {
      return new Response(JSON.stringify({
        id: 900,
        tipoComprobante: "FB",
        puntoVenta: 5,
        numero: 11,
        cae: "CAE-TEST-900",
        montoTotal: "70000.00",
      }), { status: 201, headers: { "Content-Type": "application/json" } });
    }
    if (strUrl.includes("/api/payments") && method === "POST") {
      return new Response(JSON.stringify({ id: "payment-homolog-1" }), {
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
    defaultOptions: {
      queries: {
        retry: false,
        // Mirrors @/lib/queryClient's real getQueryFn — queries like
        // billingConfig/posConfigs here don't pass their own queryFn.
        queryFn: async ({ queryKey }) => {
          const res = await fetch((queryKey as string[]).join("/"));
          if (!res.ok) throw new Error(`${res.status}`);
          return res.json();
        },
      },
      mutations: { retry: false },
    },
  });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

function renderDialog() {
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
      />
    </Wrapper>,
  );
}

describe("PrefacturaDialog — Punto de venta en homologación", () => {
  let fetchMock: ReturnType<typeof buildFetchMock>;

  beforeEach(() => {
    fetchMock = buildFetchMock();
    vi.stubGlobal("fetch", fetchMock);
  });

  it("envía puntoVentaOverride con el PV de homologación, no con un PV operativo", async () => {
    const user = userEvent.setup();
    renderDialog();

    // Esperar a que la config ARCA haya resuelto, para que el efecto de
    // auto-sugerencia de PV ya haya corrido (solo depende de billingConfig
    // en homologación, no de los PV operativos).
    await waitFor(() => {
      expect(fetchMock.mock.calls.some(([url]) => String(url).includes("/api/billing/config"))).toBe(true);
    });

    const submitBtn = await screen.findByTestId("button-registrar-emitir");
    await waitFor(() => expect(submitBtn).toBeEnabled());
    await user.click(submitBtn);

    await waitFor(() => {
      expect(fetchMock.mock.calls.some(([url, options]) =>
        String(url).includes("/api/billing/invoices") &&
        String((options as RequestInit | undefined)?.method).toUpperCase() === "POST"
      )).toBe(true);
    });

    const invoicePost = fetchMock.mock.calls.find(([url, options]) =>
      String(url).includes("/api/billing/invoices") &&
      String((options as RequestInit | undefined)?.method).toUpperCase() === "POST"
    );
    const body = JSON.parse(String((invoicePost?.[1] as RequestInit).body));
    expect(body.puntoVentaOverride).toBe(5);
  });
});
