/**
 * Full-page UI regression test for the Folio Maestro retention badge
 * (Task #396 / #399).
 *
 * Drives the real "Pago Grupal" dialog (the only dialog that supports
 * retenciones — see button-group-payment / groupPaymentDestino="master")
 * to register an organizer-level (Folio Maestro) payment with a retención,
 * then asserts:
 *   1) The POST to /master-payment carries the retención in its payload.
 *   2) After the mutation invalidates the master-folio query and it
 *      refetches, the "Ret. IIBB" badge renders in "Pagos recibidos del
 *      organizador" with the correct amount.
 *
 * This is the UI-level counterpart to
 * server/tests/master-folio-retention-badge.test.ts, which covers the same
 * scenario end to end through the real HTTP routes.
 */

import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi, beforeEach } from "vitest";

const GROUP_ID = "group-retention-badge-ui-001";
const RESERVATION_ID = "reservation-retention-badge-ui-001";

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

import GroupDetailPage, { buildGroupInvoiceRecipientInitialValues } from "./group-detail";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Toaster } from "@/components/ui/toaster";

const GROUP_FIXTURE = {
  id: GROUP_ID,
  name: "Grupo Retención UI",
  groupCode: "GRP-BADGE-001",
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

describe("group invoice recipient handoff", () => {
  it("keeps a guest DNI/passport when opening the fiscal invoice dialog", () => {
    expect(buildGroupInvoiceRecipientInitialValues({
      razonSocial: "Sophie Martin",
      fallbackName: "Grupo Internacional",
      cuit: "",
      dni: "FR-789012",
      condicionIva: "consumidor_final",
      domicilio: "15 Rue de Paris",
    })).toMatchObject({
      razonSocial: "Sophie Martin",
      dni: "FR-789012",
      condicionIva: "consumidor_final",
      domicilio: "15 Rue de Paris",
    });
  });
});

const FOLIO_FIXTURE = {
  group: GROUP_FIXTURE,
  groupCharges: [],
  groupChargesTotal: 0,
  reservations: [{
    reservationId: RESERVATION_ID,
    guestName: "Gómez Ana",
    roomNumber: "101",
    nights: 5,
    accommodationTotal: 10.01,
    extrasTotal: 0,
    paymentsTotal: 0,
    balance: 10.01,
  }],
  groupPayments: [],
  groupPaymentsTotal: 0,
  voidMovements: [],
  voidMovementsTotal: 0,
  totals: { accommodation: 10.01, groupCharges: 0, extras: 0, payments: 0, voids: 0, balance: 10.01 },
  billing: { sources: [], totals: { eligible: 0, invoiced: 0, available: 0 }, paymentDestinations: [] },
};

function makeMasterFolio(groupPayments: any[]) {
  const masterPaid = groupPayments.reduce((s, gp) => s + parseFloat(gp.amount || "0"), 0);
  return {
    config: "accommodation",
    masterTotal: 10.01,
    masterAccommodation: 10.01,
    masterExtras: 0,
    groupChargesTotal: 0,
    masterPaid,
    masterBalance: Math.max(0, 10.01 - masterPaid),
    rooms: [],
    groupCharges: [],
    groupPayments,
  };
}

// Mutable "server" state for the master-folio GET query, updated by the
// mocked POST so the post-invalidation refetch reflects the new payment —
// exactly like the real API would after task #396's fix.
let masterFolioState: ReturnType<typeof makeMasterFolio>;
let invoiceSnapshotState: any;

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

describe("Folio Maestro retention badge — Pago Grupal dialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    queryClient.clear();
    masterFolioState = makeMasterFolio([]);
    invoiceSnapshotState = {};

    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith(`/api/groups/${GROUP_ID}/folio`)) return jsonResponse(FOLIO_FIXTURE);
      if (url.endsWith(`/api/groups/${GROUP_ID}/master-folio`)) return jsonResponse(masterFolioState);
      if (url.endsWith(`/api/groups/${GROUP_ID}/invoice-snapshot`)) return jsonResponse(invoiceSnapshotState);
      if (url.endsWith(`/api/groups/${GROUP_ID}/direct-invoices`)) return jsonResponse([]);
      if (url.endsWith(`/api/groups/${GROUP_ID}`)) return jsonResponse(GROUP_FIXTURE);
      if (url.endsWith("/api/bed-types")) return jsonResponse([]);
      if (url.endsWith("/api/billing/config")) return jsonResponse({});
      if (url.endsWith("/api/companies")) return jsonResponse([{
        id: "company-receiver-1",
        razonSocial: "Empresa Receptora SA",
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

    apiRequestMock.mockImplementation(async (method: string, url: string, body?: any) => {
      if (method === "POST" && url === `/api/groups/${GROUP_ID}/master-payment`) {
        const row = body.paymentRows[0];
        const grossAmount = (parseFloat(row.amount) + (row.retention?.monto ?? 0)).toFixed(2);
        const groupPaymentId = "group-payment-badge-1";
        // Mirror what recordGroupPayment persists per task #396: the
        // retención withheld on the non-room (Folio Maestro) portion lives
        // directly on the group_payments row's retentionDetail.
        masterFolioState = makeMasterFolio([{
          id: groupPaymentId,
          groupId: GROUP_ID,
          date: "2026-08-26",
          amount: grossAmount,
          method: row.method,
          reference: row.reference ?? null,
          receiptType: "none",
          billingEntityId: null,
          billingEntityType: null,
          invoiceRef: null,
          invoiceNcRef: null,
          paymentMethodDetail: null,
          retentionDetail: row.retention ? [{ tipo: row.retention.tipo, monto: row.retention.monto }] : [],
        }]);
        return jsonResponse({ success: true, groupPaymentId, distributed: 0 });
      }
      throw new Error(`Unexpected apiRequest call: ${method} ${url}`);
    });
  });

  it("registers a Folio Maestro payment with a retención through the real dialog and shows the badge", async () => {
    const user = userEvent.setup();
    renderPage();

    await screen.findByTestId("text-group-name");

    await user.click(await screen.findByTestId("button-group-payment"));

    // Receiver-first rule: every collection, including an Anticipo, must keep
    // an immutable payer snapshot before payment fields become editable.
    const receiverSearch = await screen.findByTestId("input-group-entity-search");
    await user.type(receiverSearch, "Empresa");
    await user.click(await screen.findByRole("button", { name: /Empresa Receptora SA/i }));

    // 3. Destino del cobro — send it to the Folio Maestro, not distributed
    // across rooms, so there is no real room to attach the retención to.
    await user.click(await screen.findByTestId("button-group-destino-master"));

    const amountInput = await screen.findByTestId("input-group-payment-amount-0");
    await user.clear(amountInput);
    await user.type(amountInput, "6.00");
    await user.type(await screen.findByTestId("input-group-payment-reference-0"), "REC-0001");

    await user.click(await screen.findByTestId("button-group-add-retencion-0"));
    const retentionAmountInput = await screen.findByTestId("input-group-retencion-monto-0");
    await user.type(retentionAmountInput, "4.01");

    await user.click(await screen.findByTestId("button-confirm-group-payment"));

    await waitFor(() => expect(apiRequestMock).toHaveBeenCalledWith(
      "POST",
      `/api/groups/${GROUP_ID}/master-payment`,
      expect.objectContaining({
        paymentRows: [expect.objectContaining({
          method: "cash",
          amount: "6",
          retention: { tipo: "iibb", monto: 4.01 },
        })],
      }),
    ));

    // The mutation invalidates the master-folio query on success, which
    // refetches the mocked state now carrying the persisted retentionDetail.
    await user.click(await screen.findByTestId("tab-folio"));

    const badge = await screen.findByTestId("badge-retention-master-group-payment-badge-1-0");
    expect(badge).toHaveTextContent("Ret. IIBB: $4,01");
  });

  it("does not show an availability warning when fiscal concepts open empty", async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByTestId("text-group-name");
    await user.click(screen.getByTestId("button-group-payment"));
    await user.type(await screen.findByTestId("input-group-entity-search"), "Empresa");
    await user.click(await screen.findByRole("button", { name: /Empresa Receptora SA/i }));
    await user.click(screen.getByTestId("button-group-con-comprobante"));

    expect(screen.queryByTestId("text-items-payment-mismatch")).not.toBeInTheDocument();
    expect(screen.getByTestId("button-confirm-group-payment")).toBeDisabled();
  });

  it("matches fiscal concepts against cash plus retentions to the cent", async () => {
    invoiceSnapshotState = {
      sources: [
        { id: "room:101:accommodation", destination: "Hab. 101", concept: "Alojamiento", available: 300000 },
        { id: "group-charge:1", destination: "Grupo", concept: "Salón", available: 30000 },
      ],
      totals: { eligible: 360000, invoiced: 30000, available: 330000 },
      financial: {
        operationalTotal: 360000,
        collected: 90000,
        nonFiscalAdvances: 60000,
        operationalBalance: 270000,
        invoiced: 30000,
        fiscalAvailable: 330000,
      },
    };
    const user = userEvent.setup();
    renderPage();
    await screen.findByTestId("text-group-name");
    await user.click(screen.getByTestId("button-group-payment"));
    await user.type(await screen.findByTestId("input-group-entity-search"), "Empresa");
    await user.click(await screen.findByRole("button", { name: /Empresa Receptora SA/i }));
    await user.click(screen.getByTestId("button-group-con-comprobante"));

    // A $60,000 non-fiscal advance is applied to the $330,000 invoice, so the
    // new collection must cover the exact $270,000 operational balance.
    expect(screen.getByTestId("button-confirm-group-payment")).toBeDisabled();

    const cash = screen.getByTestId("input-group-payment-amount-0");
    await user.type(cash, "240000");
    await user.click(screen.getByTestId("button-group-add-retencion-0"));
    const retention = screen.getByTestId("input-group-retencion-monto-0");
    await user.type(retention, "30000");

    expect(screen.queryByTestId("text-concepts-payment-mismatch")).not.toBeInTheDocument();
    expect(screen.getByTestId("button-confirm-group-payment")).toBeEnabled();

    await user.clear(retention);
    await user.type(retention, "29999.99");
    expect(await screen.findByTestId("text-concepts-payment-mismatch")).toHaveTextContent(
      /cobro nuevo debe ser/i,
    );
    expect(screen.getByTestId("button-confirm-group-payment")).toBeDisabled();
    expect(screen.queryByTestId("text-items-payment-mismatch")).not.toBeInTheDocument();
  });
});
