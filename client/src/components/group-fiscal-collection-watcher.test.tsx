import React from "react";
import { render, waitFor } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { apiRequestMock } = vi.hoisted(() => ({
  apiRequestMock: vi.fn(),
}));

let allGroupsPending: any[] = [];

vi.mock("@/lib/queryClient", async () => {
  const actual = await vi.importActual<typeof import("@/lib/queryClient")>("@/lib/queryClient");
  return { ...actual, apiRequest: apiRequestMock };
});

import GroupFiscalCollectionWatcher from "./group-fiscal-collection-watcher";
import { queryClient } from "@/lib/queryClient";

function jsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

describe("GroupFiscalCollectionWatcher", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    queryClient.clear();
    allGroupsPending = [];
    apiRequestMock.mockResolvedValue(jsonResponse({ success: true }));

    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/api/groups/pending-fiscal-collections")) return jsonResponse(allGroupsPending);
      return jsonResponse([]);
    }));
  });

  it("completes a pending group cobro without anyone having that group's page open", async () => {
    allGroupsPending = [{
      id: 777,
      groupId: "group-orphaned-checkout",
      items: [{ descripcion: "Alojamiento grupal", cantidad: 1, precioUnitario: 500, subtotal: 500 }],
      intent: {
        endpoint: "/api/groups/group-orphaned-checkout/payment",
        body: {
          receiptType: "factura_b",
          paymentRows: [{ method: "efectivo", amount: "500.00", reference: "COBRO-777" }],
          concepts: [{ description: "Alojamiento grupal", amount: 500 }],
          settlementBreakdown: { documentTotal: 500, appliedAdvances: 0, newCollection: 500 },
        },
      },
    }];

    render(
      <QueryClientProvider client={queryClient}>
        <GroupFiscalCollectionWatcher />
      </QueryClientProvider>,
    );

    await waitFor(() => expect(apiRequestMock).toHaveBeenCalledWith(
      "POST",
      "/api/groups/group-orphaned-checkout/payment",
      expect.objectContaining({
        paymentRows: [expect.objectContaining({ amount: "500.00" })],
        invoiceData: { id: 777, groupPaymentIntent: allGroupsPending[0].intent },
      }),
    ));
  });

  it("recovers pending cobros from two different groups independently", async () => {
    allGroupsPending = [
      {
        id: 801,
        groupId: "group-alpha",
        items: [{ descripcion: "Servicios", subtotal: 100 }],
        intent: {
          endpoint: "/api/groups/group-alpha/payment",
          body: { paymentRows: [{ method: "efectivo", amount: "100.00" }], settlementBreakdown: { appliedAdvances: 0 } },
        },
      },
      {
        id: 802,
        groupId: "group-beta",
        items: [{ descripcion: "Folio maestro", subtotal: 200 }],
        intent: {
          endpoint: "/api/groups/group-beta/master-payment",
          body: { paymentRows: [{ method: "efectivo", amount: "200.00" }], settlementBreakdown: { appliedAdvances: 0 } },
        },
      },
    ];

    render(
      <QueryClientProvider client={queryClient}>
        <GroupFiscalCollectionWatcher />
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(apiRequestMock).toHaveBeenCalledWith("POST", "/api/groups/group-alpha/payment", expect.anything());
      expect(apiRequestMock).toHaveBeenCalledWith("POST", "/api/groups/group-beta/master-payment", expect.anything());
    });
  });

  it("ignores an intent whose endpoint isn't one of the two known group payment routes", async () => {
    allGroupsPending = [{
      id: 900,
      groupId: "group-untrusted",
      items: [{ descripcion: "Servicios", subtotal: 100 }],
      intent: { endpoint: "/api/groups/some-other-group/payment", body: { paymentRows: [] } },
    }];

    render(
      <QueryClientProvider client={queryClient}>
        <GroupFiscalCollectionWatcher />
      </QueryClientProvider>,
    );

    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(apiRequestMock).not.toHaveBeenCalled();
  });
});
