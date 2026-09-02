import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

const GROUP_ID = "group-payment-dialog-mode-ui-001";
const RESERVATION_ID = "reservation-payment-dialog-mode-ui-001";

const { apiRequestMock } = vi.hoisted(() => ({
  apiRequestMock: vi.fn(),
}));

vi.mock("@/lib/queryClient", async () => {
  const actual = await vi.importActual<typeof import("@/lib/queryClient")>("@/lib/queryClient");
  return { ...actual, apiRequest: apiRequestMock };
});

vi.mock("wouter", async () => {
  const actual = await vi.importActual<typeof import("wouter")>("wouter");
  return {
    ...actual,
    useParams: () => ({ id: GROUP_ID }),
    useLocation: () => ["/groups/" + GROUP_ID, vi.fn()],
  };
});

import GroupDetailPage from "./group-detail";
import { queryClient } from "@/lib/queryClient";
import { Toaster } from "@/components/ui/toaster";

const GROUP_FIXTURE = {
  id: GROUP_ID,
  name: "Grupo Modos de Pago",
  groupCode: "GRP-MODES-001",
  status: "confirmed",
  color: null,
  checkInDate: "2026-08-20",
  checkOutDate: "2026-08-25",
  blocks: [],
  reservations: [{
    id: RESERVATION_ID,
    status: "checked_in",
    checkInDate: "2026-08-20",
    checkOutDate: "2026-08-25",
    roomId: "room-101",
    room: { id: "room-101", roomNumber: "101" },
    guestId: "guest-1",
    guest: { firstName: "Ana", lastName: "Gómez" },
  }],
  billingEntityType: null,
  billingEntityId: null,
  masterFolioConfig: "accommodation",
};

const FOLIO_FIXTURE = {
  group: GROUP_FIXTURE,
  groupCharges: [],
  groupChargesTotal: 0,
  reservations: [{
    reservationId: RESERVATION_ID,
    guestName: "Gómez Ana",
    roomNumber: "101",
    nights: 5,
    accommodationTotal: 125.5,
    extrasTotal: 0,
    paymentsTotal: 0,
    balance: 125.5,
  }],
  groupPayments: [],
  groupPaymentsTotal: 0,
  voidMovements: [],
  voidMovementsTotal: 0,
  totals: { accommodation: 125.5, groupCharges: 0, extras: 0, payments: 0, voids: 0, balance: 125.5 },
  billing: { sources: [], totals: { eligible: 0, invoiced: 0, available: 0 }, paymentDestinations: [] },
};

const MASTER_FOLIO_FIXTURE = {
  config: "accommodation",
  masterTotal: 125.5,
  masterAccommodation: 125.5,
  masterExtras: 0,
  groupChargesTotal: 0,
  masterPaid: 0,
  masterBalance: 125.5,
  rooms: [],
  groupCharges: [],
  groupPayments: [],
};

function jsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

function renderPage() {
  return render(
    <QueryClientProvider client={queryClient}>
      <GroupDetailPage />
      <Toaster />
    </QueryClientProvider>,
  );
}

describe("Pago Grupal dialog entry-point modes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    queryClient.clear();

    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith(`/api/groups/${GROUP_ID}/folio`)) return jsonResponse(FOLIO_FIXTURE);
      if (url.endsWith(`/api/groups/${GROUP_ID}/master-folio`)) return jsonResponse(MASTER_FOLIO_FIXTURE);
      if (url.endsWith(`/api/groups/${GROUP_ID}/invoice-snapshot`)) return jsonResponse({});
      if (url.endsWith(`/api/groups/${GROUP_ID}/pending-fiscal-collections`)) return jsonResponse([]);
      if (url.endsWith(`/api/groups/${GROUP_ID}/direct-invoices`)) return jsonResponse([]);
      if (url.endsWith(`/api/groups/${GROUP_ID}`)) return jsonResponse(GROUP_FIXTURE);
      if (url.endsWith("/api/bed-types")) return jsonResponse([]);
      if (url.endsWith("/api/billing/config")) return jsonResponse({});
      if (url.endsWith("/api/companies")) return jsonResponse([{
        id: "company-mode-test-1",
        razonSocial: "Empresa Modo Anterior SA",
        cuilCuit: "30712345678",
        condicionIva: "Responsable Inscripto",
      }]);
      if (url.endsWith("/api/agencies")) return jsonResponse([]);
      if (url.endsWith("/api/pos-configs")) return jsonResponse([]);
      if (url.endsWith("/api/charge-types")) return jsonResponse([]);
      if (url.endsWith("/api/room-types")) return jsonResponse([]);
      if (url.endsWith("/api/rate-plans")) return jsonResponse([]);
      return new Response("Not found", { status: 404 });
    }));

    apiRequestMock.mockImplementation(async () => jsonResponse({ success: true }));
  });

  it("opens from Pago Grupal in Detallados and clears the previous operation on reopen", async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByTestId("text-group-name");

    await user.click(screen.getByTestId("button-group-payment"));
    expect(screen.getByTestId("button-group-advance-breakdown-detallados")).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByTestId("button-group-advance-breakdown-none")).toHaveAttribute("aria-pressed", "false");

    await user.type(screen.getByTestId("input-group-entity-search"), "Empresa");
    await user.click(await screen.findByRole("button", { name: /Empresa Modo Anterior SA/i }));
    const amount = screen.getByTestId("input-group-payment-amount-0");
    await user.type(amount, "42");
    await user.click(screen.getByRole("button", { name: "Cancelar" }));

    await user.click(screen.getByTestId("tab-folio"));
    await user.click(screen.getByTestId("button-master-payment"));
    expect(screen.getByTestId("button-group-advance-breakdown-none")).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByTestId("button-group-advance-breakdown-detallados")).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByTestId("input-group-payment-amount-0")).toHaveValue(125.5);
    expect(screen.getByTestId("input-group-entity-search")).toHaveValue("");
  });

  it("opens from Pagar Folio Maestro in Sin desglose and resets before opening Pago Grupal", async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByTestId("text-group-name");

    await user.click(screen.getByTestId("tab-folio"));
    await user.click(screen.getByTestId("button-master-payment"));
    expect(screen.getByTestId("button-group-advance-breakdown-none")).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByTestId("button-group-advance-breakdown-detallados")).toHaveAttribute("aria-pressed", "false");

    await user.type(screen.getByTestId("input-group-entity-search"), "Empresa");
    await user.click(await screen.findByRole("button", { name: /Empresa Modo Anterior SA/i }));
    const amount = screen.getByTestId("input-group-payment-amount-0");
    expect(amount).toHaveValue(125.5);
    await user.clear(amount);
    await user.type(amount, "9");
    await user.click(screen.getByRole("button", { name: "Cancelar" }));

    await user.click(screen.getByTestId("button-group-payment"));
    expect(screen.getByTestId("button-group-advance-breakdown-detallados")).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByTestId("button-group-advance-breakdown-none")).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByTestId("input-group-payment-amount-0")).toHaveDisplayValue("");
    expect(screen.getByTestId("input-group-entity-search")).toHaveValue("");
  });
});