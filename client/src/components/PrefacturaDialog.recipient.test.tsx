import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

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

const reservation = {
  id: "reservation-recipient-test",
  status: "checked_in",
  checkOutDate: "2026-08-24",
  companyId: "company-recipient-test",
  guest: {
    id: "guest-recipient-test",
    firstName: "Lucía",
    lastName: "Huésped",
    documentNumber: "12345678",
    vatCondition: "consumidor_final",
    nationality: "Argentina",
  },
  company: {
    id: "company-recipient-test",
    razonSocial: "Empresa de prueba SA",
    cuilCuit: "30-71234567-9",
    condicionIva: "responsable_inscripto",
  },
  room: { roomNumber: "101" },
} as any;

const folio = {
  reservationCode: "REC-001",
  guestName: "Huésped Lucía",
  roomNumber: "101",
  checkInDate: "2026-08-23",
  checkOutDate: "2026-08-24",
  nights: 1,
  roomRate: "200.00",
  roomTotal: 200,
  charges: [{
    id: "charge-recipient-test",
    description: "Cargo adicional",
    amount: "80.00",
    category: "otros",
    date: "2026-08-24",
  }],
  totalCharges: 80,
  payments: [],
  totalPayments: 0,
  grandTotal: 280,
  balance: 280,
};

function buildFetchMock() {
  return vi.fn(async (url: string | URL | Request, options?: RequestInit) => {
    const target = String(url);
    const method = options?.method?.toUpperCase() ?? "GET";
    if (target.includes("/api/billing/invoices") && method === "POST") {
      return Response.json({
        id: 900,
        tipoComprobante: "FB",
        puntoVenta: 1,
        numero: 900,
        cae: "CAE-FICTICIO-900",
        montoTotal: "100.00",
      }, { status: 201 });
    }
    if (target.includes("/api/payments") && method === "POST") {
      return Response.json({ id: "payment-partial-test" }, { status: 201 });
    }
    if (target.includes(`/api/billing/reservations/${reservation.id}/operations/`) ||
        target.includes(`/api/billing/reservations/${reservation.id}/legacy-cc/recover`)) {
      return Response.json({ error: "No hay liquidación pendiente" }, { status: 404 });
    }
    if (target.includes("/folio")) return Response.json(folio);
    if (target.includes("/api/billing/config")) return Response.json({ puntoVenta: 1, arcaAmbiente: "ficticio" });
    if (target.includes("/api/companies")) return Response.json([reservation.company]);
    if (target.includes("/api/pos-configs")) return Response.json([]);
    if (target.includes("/invoices")) return Response.json([]);
    if (target.includes("/transfer-remaining")) return Response.json({ accommodation: 200, charges: { "charge-recipient-test": 80 } });
    return Response.json([]);
  });
}

function Wrapper({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider client={new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
          queryFn: async ({ queryKey }) => {
            const response = await fetch(queryKey.join("/") as string);
            return response.json();
          },
        },
        mutations: { retry: false },
      },
    })}>
      {children}
    </QueryClientProvider>
  );
}

describe("PrefacturaDialog recipient selection", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", buildFetchMock());
  });

  it("keeps a linked company optional and restores the guest receiver after switching", async () => {
    const user = userEvent.setup();
    render(
      <Wrapper>
        <PrefacturaDialog
          open
          onClose={vi.fn()}
          reservationId={reservation.id}
          reservation={reservation}
          mode="billing"
        />
      </Wrapper>,
    );

    await screen.findByText(/Alojamiento Hab\. 101/);
    const receiverSelect = await screen.findByTestId("select-billing-target");
    expect(receiverSelect).toHaveTextContent("Huésped");
    expect(screen.getAllByText("Factura B").length).toBeGreaterThan(0);
    await user.click(screen.getByTestId("select-receipt-type"));
    expect(screen.getByRole("option", { name: "Factura B" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "Factura T" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("option", { name: "Factura B" }));
    expect(screen.getByTestId("select-sale-condition")).toBeInTheDocument();

    await user.click(receiverSelect);
    await user.click(await screen.findByRole("option", { name: /Empresa/ }));

    const companySelect = await screen.findByTestId("select-billing-company");
    await user.click(companySelect);
    await user.click(await screen.findByRole("option", { name: /Empresa de prueba SA/ }));

    await waitFor(() => {
      expect(screen.getByTestId("select-billing-target")).toHaveTextContent("Empresa");
      expect(screen.getAllByText("Factura A").length).toBeGreaterThan(0);
    });

    await user.click(screen.getByTestId("select-billing-target"));
    await user.click(await screen.findByRole("option", { name: /Huésped/ }));

    await waitFor(() => {
      expect(screen.getByTestId("select-billing-target")).toHaveTextContent("Huésped");
      expect(screen.getAllByText("Factura B").length).toBeGreaterThan(0);
    });

    await user.click(screen.getByRole("button", { name: /Agregar forma de pago/ }));
    expect(screen.getByTestId("select-payment-method-0")).toHaveTextContent("Efectivo");
    expect(screen.getByTestId("select-payment-method-1")).toHaveTextContent("Tarjeta Débito");
  });

  it("allows charging the selected guest account without creating a cash payment", async () => {
    const fetchMock = buildFetchMock();
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(
      <Wrapper>
        <PrefacturaDialog
          open
          onClose={vi.fn()}
          reservationId={reservation.id}
          reservation={reservation}
          mode="billing"
        />
      </Wrapper>,
    );

    await screen.findByText(/Alojamiento Hab\. 101/);
    await user.click(screen.getByTestId("select-sale-condition"));
    await user.click(await screen.findByRole("option", { name: "Cuenta Corriente" }));
    await user.click(screen.getByTestId("button-registrar-emitir"));

    await waitFor(() => {
      expect(fetchMock.mock.calls.some(([url, options]) =>
        String(url).includes("/api/billing/invoices") &&
        String((options as RequestInit | undefined)?.method).toUpperCase() === "POST",
      )).toBe(true);
    });

    const invoiceCall = fetchMock.mock.calls.find(([url, options]) =>
      String(url).includes("/api/billing/invoices") &&
      String((options as RequestInit | undefined)?.method).toUpperCase() === "POST",
    );
    const invoiceBody = JSON.parse(String((invoiceCall![1] as RequestInit).body));
    expect(invoiceBody.cashFormaPago).toBe("cuenta_corriente");
    expect(invoiceBody.ccEntityType).toBe("guest");
    expect(invoiceBody.ccEntityId).toBe("guest-recipient-test");
    expect(fetchMock.mock.calls.some(([url, options]) =>
      String(url).includes("/api/payments") &&
      String((options as RequestInit | undefined)?.method).toUpperCase() === "POST",
    )).toBe(false);
  });

  it("allows Cuenta Corriente as a payment method for the reservation guest", async () => {
    const fetchMock = buildFetchMock();
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(
      <Wrapper>
        <PrefacturaDialog
          open
          onClose={vi.fn()}
          reservationId={reservation.id}
          reservation={reservation}
          mode="billing"
        />
      </Wrapper>,
    );

    await screen.findByText(/Alojamiento Hab\. 101/);
    await user.click(screen.getByTestId("select-payment-method-0"));
    await user.click(await screen.findByRole("option", { name: "Cuenta Corriente" }));
    await user.click(screen.getByTestId("button-registrar-emitir"));

    await waitFor(() => {
      expect(fetchMock.mock.calls.some(([url, options]) =>
        String(url).includes("/api/payments") &&
        String((options as RequestInit | undefined)?.method).toUpperCase() === "POST",
      )).toBe(true);
    });

    const paymentCall = fetchMock.mock.calls.find(([url, options]) =>
      String(url).includes("/api/payments") &&
      String((options as RequestInit | undefined)?.method).toUpperCase() === "POST",
    );
    const paymentBody = JSON.parse(String((paymentCall![1] as RequestInit).body));
    expect(paymentBody.method).toBe("cuenta_corriente");
    expect(paymentBody.billingTarget).toBe("guest");
    expect(paymentBody.companyId).toBeNull();
    expect(paymentBody.agencyId).toBeNull();
  });

  it("emits only the covered accommodation amount and links one payment to it", async () => {
    const fetchMock = buildFetchMock();
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(
      <Wrapper>
        <PrefacturaDialog
          open
          onClose={vi.fn()}
          reservationId={reservation.id}
          reservation={reservation}
          mode="billing"
        />
      </Wrapper>,
    );

    await screen.findByText(/Alojamiento Hab\. 101/);
    const chargeCheckbox = screen.getAllByRole("checkbox").find((checkbox) =>
      checkbox.closest("tr")?.textContent?.includes("Cargo adicional"),
    );
    expect(chargeCheckbox).toBeDefined();
    await user.click(chargeCheckbox!);
    const amount = screen.getByTestId("input-payment-amount-0");
    await user.clear(amount);
    await user.type(amount, "100.00");
    await user.click(screen.getByTestId("button-registrar-emitir"));
    await screen.findByText("Saldo sin abonar");
    await user.click(screen.getByRole("button", { name: /Sí, continuar con saldo pendiente/ }));

    await waitFor(() => {
      expect(fetchMock.mock.calls.some(([url, options]) =>
        String(url).includes("/api/billing/invoices") &&
        String((options as RequestInit | undefined)?.method).toUpperCase() === "POST",
      )).toBe(true);
    });

    const invoiceCall = fetchMock.mock.calls.find(([url, options]) =>
      String(url).includes("/api/billing/invoices") &&
      String((options as RequestInit | undefined)?.method).toUpperCase() === "POST",
    );
    const paymentCalls = fetchMock.mock.calls.filter(([url, options]) =>
      String(url).includes("/api/payments") &&
      String((options as RequestInit | undefined)?.method).toUpperCase() === "POST",
    );
    expect(invoiceCall).toBeDefined();
    expect(paymentCalls).toHaveLength(1);

    const invoiceBody = JSON.parse(String((invoiceCall![1] as RequestInit).body));
    const paymentBody = JSON.parse(String((paymentCalls[0][1] as RequestInit).body));
    expect(invoiceBody.sourceChargeIds).toEqual(["accommodation"]);
    expect(invoiceBody.sourceChargeAmounts).toEqual({ accommodation: 100 });
    expect(invoiceBody.items).toEqual([
      expect.objectContaining({ subtotal: 100 }),
    ]);
    expect(paymentBody).toMatchObject({
      amount: "100.00",
      invoiceData: expect.objectContaining({ id: 900, total: "100.00" }),
    });
  });
});