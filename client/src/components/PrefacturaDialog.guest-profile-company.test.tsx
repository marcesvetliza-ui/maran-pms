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

const profileCompany = {
  id: "company-on-guest-profile",
  razonSocial: "Empresa del Perfil SA",
  cuilCuit: "30-71234567-9",
  condicionIva: "responsable_inscripto",
};

const otherCompany = {
  id: "company-picked-at-checkout",
  razonSocial: "Empresa Elegida al Pagar SA",
  cuilCuit: "30-70000000-1",
  condicionIva: "responsable_inscripto",
};

const folio = {
  reservationCode: "REC-002",
  guestName: "Huésped Sin Empresa En Reserva",
  roomNumber: "102",
  checkInDate: "2026-08-23",
  checkOutDate: "2026-08-24",
  nights: 1,
  roomRate: "200.00",
  roomTotal: 200,
  charges: [],
  totalCharges: 0,
  payments: [],
  totalPayments: 0,
  grandTotal: 200,
  balance: 200,
};

function buildFetchMock() {
  return vi.fn(async (url: string | URL | Request, options?: RequestInit) => {
    const target = String(url);
    const method = options?.method?.toUpperCase() ?? "GET";
    if (target.includes("/api/billing/invoices") && method === "POST") {
      return Response.json({ id: 901, tipoComprobante: "FB", puntoVenta: 1, numero: 901, cae: "CAE-901", montoTotal: "100.00" }, { status: 201 });
    }
    if (target.includes(`/operations/`) || target.includes(`/legacy-cc/recover`)) {
      return Response.json({ error: "No hay liquidación pendiente" }, { status: 404 });
    }
    if (target.includes("/folio")) return Response.json(folio);
    if (target.includes("/api/billing/config")) return Response.json({ puntoVenta: 1, arcaAmbiente: "ficticio" });
    if (target.includes("/api/companies")) return Response.json([profileCompany, otherCompany]);
    if (target.includes("/api/pos-configs")) return Response.json([]);
    if (target.includes("/invoices")) return Response.json([]);
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

describe("PrefacturaDialog — empresa asociada al perfil del huésped, no a la reserva", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", buildFetchMock());
  });

  it("precarga la empresa del perfil del huésped cuando la reserva no tiene una propia", async () => {
    const reservation = {
      id: "reservation-guest-company-test",
      status: "checked_in",
      checkOutDate: "2026-08-24",
      // No companyId/company on the reservation itself — only the guest's
      // profile has one on file.
      guest: {
        id: "guest-with-profile-company",
        firstName: "Lucía",
        lastName: "Huésped",
        documentNumber: "12345678",
        vatCondition: "consumidor_final",
        nationality: "Argentina",
        companyId: profileCompany.id,
      },
      room: { roomNumber: "102" },
    } as any;

    render(
      <Wrapper>
        <PrefacturaDialog open onClose={vi.fn()} reservationId={reservation.id} reservation={reservation} mode="billing" />
      </Wrapper>,
    );

    await screen.findByText(/Alojamiento Hab\. 102/);
    const receiverSelect = await screen.findByTestId("select-billing-target");
    await waitFor(() => {
      expect(receiverSelect).toHaveTextContent("Empresa");
    });
    expect(await screen.findByDisplayValue("Empresa del Perfil SA")).toBeInTheDocument();
  });

  it("deja elegir Empresa aunque ni la reserva ni el perfil del huésped tengan una cargada", async () => {
    const reservation = {
      id: "reservation-no-company-anywhere-test",
      status: "checked_in",
      checkOutDate: "2026-08-24",
      guest: {
        id: "guest-no-company",
        firstName: "Marcos",
        lastName: "Sin Datos",
        documentNumber: "87654321",
        vatCondition: "consumidor_final",
        nationality: "Argentina",
      },
      room: { roomNumber: "102" },
    } as any;

    const user = userEvent.setup();
    render(
      <Wrapper>
        <PrefacturaDialog open onClose={vi.fn()} reservationId={reservation.id} reservation={reservation} mode="billing" />
      </Wrapper>,
    );

    await screen.findByText(/Alojamiento Hab\. 102/);
    const receiverSelect = await screen.findByTestId("select-billing-target");
    await waitFor(() => expect(receiverSelect).toHaveTextContent("Huésped"));

    // Nothing preloaded anywhere — "Empresa" must still be a pickable option,
    // for the guest who only gives billing details at the moment they pay.
    await user.click(receiverSelect);
    expect(await screen.findByRole("option", { name: /Empresa/ })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: /Agencia/ })).toBeInTheDocument();
    await user.click(screen.getByRole("option", { name: /Empresa/ }));

    const companySelect = await screen.findByTestId("select-billing-company");
    await user.click(companySelect);
    await user.click(await screen.findByRole("option", { name: /Empresa Elegida al Pagar SA/ }));

    await waitFor(() => {
      expect(screen.getByTestId("select-billing-target")).toHaveTextContent("Empresa");
    });
    expect(screen.getByDisplayValue("Empresa Elegida al Pagar SA")).toBeInTheDocument();
  });
});
