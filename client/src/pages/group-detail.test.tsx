import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

const GROUP_ID = "group-payment-dialog-mode-ui-001";
const RESERVATION_ID = "reservation-payment-dialog-mode-ui-001";

const { apiRequestMock } = vi.hoisted(() => ({
  apiRequestMock: vi.fn(),
}));

let pendingFiscalCollections: any[] = [];

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

import GroupDetailPage, { calculateGroupCajaToday } from "./group-detail";
import { allocateBalanceCappedGroupRooms, resolveAutomaticGroupRoomAllocationMode } from "@shared/groupRoomAllocation";
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

const INVOICE_SNAPSHOT_FIXTURE = {
  sources: [
    { id: "room:101:accommodation", destination: "Hab. 101", concept: "Alojamiento", available: 100 },
    { id: "room:102:accommodation", destination: "Hab. 102", concept: "Alojamiento", available: 260 },
  ],
  totals: { eligible: 360, invoiced: 0, available: 360 },
  financial: { nonFiscalAdvances: 60, operationalBalance: 300 },
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
    pendingFiscalCollections = [];

    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith(`/api/groups/${GROUP_ID}/folio`)) return jsonResponse(FOLIO_FIXTURE);
      if (url.endsWith(`/api/groups/${GROUP_ID}/master-folio`)) return jsonResponse(MASTER_FOLIO_FIXTURE);
      if (url.endsWith(`/api/groups/${GROUP_ID}/invoice-snapshot`)) return jsonResponse(INVOICE_SNAPSHOT_FIXTURE);
      if (url.endsWith(`/api/groups/${GROUP_ID}/pending-fiscal-collections`)) return jsonResponse(pendingFiscalCollections);
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

  it("calculates Caja only from tender rows, excluding cuenta corriente", () => {
    expect(calculateGroupCajaToday([
      { method: "cash", amount: "100" },
      { method: "transfer", amount: "200" },
      { method: "cuenta_corriente", amount: "75" },
    ])).toBe(300);
    // Retentions are separate settlement fields and never belong in this
    // tender-only calculation.
    expect(calculateGroupCajaToday([
      { method: "cash", amount: "300" },
      { method: "cuenta_corriente", amount: "60" },
      { method: "retencion", amount: "40" },
      { method: "other", amount: "25" },
    ])).toBe(300);
  });

  it("keeps room application previews cent-exact and balance-capped", () => {
    expect(allocateBalanceCappedGroupRooms(60.01, [
      { id: "room-a", balance: 10.01 },
      { id: "room-b", balance: 100 },
      { id: "room-c", balance: 100 },
    ], "equal").allocations).toEqual({ "room-a": 10.01, "room-b": 25, "room-c": 25 });
    expect(allocateBalanceCappedGroupRooms(0.04, [
      { id: "room-a", balance: 0.01 },
      { id: "room-b", balance: 0.02 },
      { id: "room-c", balance: 100 },
    ], "proportional").allocations).toEqual({ "room-a": 0, "room-b": 0, "room-c": 0.04 });
    expect(allocateBalanceCappedGroupRooms(0.05, [
      { id: "room-a", balance: 1 },
      { id: "room-b", balance: 1 },
      { id: "room-c", balance: 1 },
    ], "proportional").allocations).toEqual({ "room-a": 0.02, "room-b": 0.02, "room-c": 0.01 });
    expect(resolveAutomaticGroupRoomAllocationMode("equal", true)).toBe("proportional");
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

  it("recovers an older emitted fiscal invoice using its advance split rather than its stale gross payment row", async () => {
    pendingFiscalCollections = [{
      id: 901,
      items: [{ descripcion: "Servicios grupales", cantidad: 1, precioUnitario: 360, subtotal: 360 }],
      intent: {
        endpoint: `/api/groups/${GROUP_ID}/payment`,
        body: {
          receiptType: "factura_b",
          paymentRows: [{ method: "cash", amount: "360.00", reference: "FINAL-360" }],
          concepts: [{ description: "Servicios grupales", amount: 360 }],
          settlementBreakdown: { documentTotal: 360, appliedAdvances: 60, newCollection: 360 },
        },
      },
    }];

    renderPage();

    await waitFor(() => expect(apiRequestMock).toHaveBeenCalledWith(
      "POST",
      `/api/groups/${GROUP_ID}/payment`,
      expect.objectContaining({
        paymentRows: [expect.objectContaining({ amount: "300.00" })],
        concepts: [{ description: "Servicios grupales", amount: 360 }],
        settlementBreakdown: {
          documentTotal: 360,
          appliedAdvances: 60,
          newCollection: 300,
        },
        invoiceData: {
          id: 901,
          groupPaymentIntent: pendingFiscalCollections[0].intent,
        },
      }),
    ));
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

  it("updates receipt concepts when manually switching destinations repeatedly", async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByTestId("text-group-name");

    await user.click(screen.getByTestId("button-group-payment"));
    await user.type(screen.getByTestId("input-group-entity-search"), "Empresa");
    await user.click(await screen.findByRole("button", { name: /Empresa Modo Anterior SA/i }));

    const amount = screen.getByTestId("input-group-payment-amount-0");
    await user.type(amount, "42");
    await user.type(screen.getByTestId("input-group-payment-reference-0"), "REC-MODES-001");

    const preview = () => screen.getByTestId("group-advance-breakdown-preview");
    const detailedConcept = "Hab. 101 — Alojamiento";
    const globalConcept = "Pago grupal — Grupo Modos de Pago";

    expect(screen.getByTestId("button-group-advance-breakdown-detallados")).toHaveAttribute("aria-pressed", "true");
    expect(preview()).toHaveTextContent(detailedConcept);
    expect(preview()).toHaveTextContent("42,00");

    await user.click(screen.getByTestId("button-group-destino-master"));
    expect(screen.getByTestId("button-group-advance-breakdown-none")).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByTestId("button-group-advance-breakdown-detallados")).toHaveAttribute("aria-pressed", "false");
    expect(preview()).toHaveTextContent(globalConcept);
    expect(preview()).not.toHaveTextContent(detailedConcept);
    expect(amount).toHaveValue(42);

    await user.click(screen.getByTestId("button-group-destino-distribute"));
    expect(screen.getByTestId("button-group-advance-breakdown-detallados")).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByTestId("button-group-advance-breakdown-none")).toHaveAttribute("aria-pressed", "false");
    expect(preview()).toHaveTextContent(detailedConcept);
    expect(preview()).not.toHaveTextContent(globalConcept);
    expect(amount).toHaveValue(42);

    await user.click(screen.getByTestId("button-group-destino-master"));
    expect(screen.getByTestId("button-group-advance-breakdown-none")).toHaveAttribute("aria-pressed", "true");
    expect(preview()).toHaveTextContent(globalConcept);
    expect(preview()).not.toHaveTextContent(detailedConcept);
    expect(preview()).toHaveTextContent("42,00");
  });

  it("keeps the gross fiscal total separate from a prior advance and returns Edit to the payment draft", async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByTestId("text-group-name");

    await user.click(screen.getByTestId("button-group-payment"));
    await user.type(screen.getByTestId("input-group-entity-search"), "Empresa");
    await user.click(await screen.findByRole("button", { name: /Empresa Modo Anterior SA/i }));
    await user.click(screen.getByTestId("button-group-con-comprobante"));

    const paymentSummary = screen.getByTestId("group-fiscal-amount-summary");
    expect(screen.getByTestId("group-room-application-preview")).toHaveTextContent("Aplicación prevista por habitación");
    expect(paymentSummary).toHaveTextContent("Total documento fiscal (bruto)");
    expect(paymentSummary).toHaveTextContent("360,00");
    expect(paymentSummary).toHaveTextContent("Anticipos no fiscales previos aplicados");
    expect(paymentSummary).toHaveTextContent("60,00");
    expect(paymentSummary).toHaveTextContent("Cobro de hoy");
    expect(paymentSummary).toHaveTextContent("300,00");

    await user.click(screen.getByTestId("button-confirm-group-payment"));
    const confirmation = await screen.findByTestId("group-invoice-settlement-summary");
    expect(confirmation).toHaveTextContent("Total documento fiscal (bruto)");
    expect(confirmation).toHaveTextContent("Anticipos no fiscales previos aplicados (ya cobrados)");
    expect(confirmation).toHaveTextContent("Cobro de hoy");
    expect(confirmation).toHaveTextContent("Total cubierto");
    expect(confirmation).toHaveTextContent("360,00");
    expect(confirmation).toHaveTextContent("300,00");

    await user.click(screen.getByTestId("button-invoice-edit"));
    expect(await screen.findByRole("heading", { name: "Pago Grupal" })).toBeInTheDocument();
    expect(screen.getByTestId("input-group-payment-amount-0")).toHaveValue(300);
  });
});