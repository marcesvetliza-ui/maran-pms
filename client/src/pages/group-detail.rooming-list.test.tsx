import React from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const GROUP_ID = "group-rooming-list-001";

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

import GroupDetailPage, { sortReservationsForRoomingList } from "./group-detail";
import { queryClient } from "@/lib/queryClient";
import { Toaster } from "@/components/ui/toaster";

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

// ==================== Pure natural-sort unit tests ====================

describe("sortReservationsForRoomingList", () => {
  const res = (id: string, roomNumber: string | null, overrides: Partial<{ status: string; checkInDate: string }> = {}) => ({
    id,
    status: overrides.status ?? "confirmed",
    checkInDate: overrides.checkInDate ?? "2026-11-01",
    room: roomNumber ? { roomNumber } : undefined,
  });

  it("orders 207, 301, 302, 1001, 1002, 1203 — numeric room numbers ascending, not lexicographic", () => {
    const shuffled = [
      res("r-1203", "1203"),
      res("r-207", "207"),
      res("r-1001", "1001"),
      res("r-1002", "1002"),
      res("r-301", "301"),
      res("r-302", "302"),
    ];
    const sorted = sortReservationsForRoomingList(shuffled).map(r => r.room?.roomNumber);
    expect(sorted).toEqual(["207", "301", "302", "1001", "1002", "1203"]);
  });

  it("excludes cancelled reservations", () => {
    const list = [res("r-1", "101"), res("r-2", "102", { status: "cancelled" })];
    const sorted = sortReservationsForRoomingList(list);
    expect(sorted.map(r => r.id)).toEqual(["r-1"]);
  });

  it("keeps alphanumeric room codes whole and produces a stable, deterministic order", () => {
    const list = [res("r-b", "B12"), res("r-a", "A101")];
    const sorted1 = sortReservationsForRoomingList(list).map(r => r.room?.roomNumber);
    const sorted2 = sortReservationsForRoomingList([...list].reverse()).map(r => r.room?.roomNumber);
    expect(sorted1).toEqual(sorted2);
    expect(sorted1).toContain("B12");
    expect(sorted1).toContain("A101");
  });

  it("sorts reservations without an assigned room after every assigned room, deterministically", () => {
    const list = [
      res("r-unassigned-b", null),
      res("r-301", "301"),
      res("r-unassigned-a", null),
      res("r-207", "207"),
    ];
    const sorted = sortReservationsForRoomingList(list);
    expect(sorted.map(r => r.id)).toEqual(["r-207", "r-301", "r-unassigned-a", "r-unassigned-b"]);
  });
});

// ==================== Rendered Rooming List dialog ====================

function buildGroup(overrides: Partial<any> = {}) {
  return {
    id: GROUP_ID,
    name: "Grupo Abel Pintos",
    groupCode: "GRP-ROOMING-001",
    status: "blocked",
    color: null,
    notes: "NO SE PUEDEN MOVER HABITACIONES - CIERRA LU EXTRA PAGA PAX",
    checkInDate: "2026-11-30",
    checkOutDate: "2026-12-01",
    eventDate: null,
    contactName: "Contacto Grupo",
    contactPhone: "",
    contactEmail: "",
    blocks: [],
    billingEntityType: null,
    billingEntityId: null,
    masterFolioConfig: "none",
    reservations: [],
    ...overrides,
  };
}

function reservation(overrides: Partial<any>): any {
  return {
    id: "res-1",
    status: "confirmed",
    checkInDate: "2026-11-30",
    checkOutDate: "2026-12-01",
    roomId: "room-1",
    room: { id: "room-1", roomNumber: "101" },
    guestId: "guest-1",
    guest: { firstName: "Natalicia", lastName: "Sotelo", documentType: "dni", documentNumber: "31703839", codigo: "G001" },
    notes: null,
    companions: [],
    ...overrides,
  };
}

describe("Grupos — Rooming List (preview y datos)", () => {
  let groupFixture: ReturnType<typeof buildGroup>;

  function stubFetch() {
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith(`/api/groups/${GROUP_ID}/master-folio`)) {
        return jsonResponse({ config: "none", masterTotal: 0, masterAccommodation: 0, masterExtras: 0, groupChargesTotal: 0, masterPaid: 0, masterBalance: 0, rooms: [], groupCharges: [], groupPayments: [] });
      }
      if (url.endsWith(`/api/groups/${GROUP_ID}/folio`)) {
        return jsonResponse({ group: groupFixture, groupCharges: [], groupChargesTotal: 0, reservations: [], groupPayments: [], groupPaymentsTotal: 0, voidMovements: [], voidMovementsTotal: 0, totals: { accommodation: 0, groupCharges: 0, extras: 0, payments: 0, voids: 0, balance: 0 }, billing: { sources: [], totals: { eligible: 0, invoiced: 0, available: 0 }, paymentDestinations: [] } });
      }
      if (url.endsWith(`/api/groups/${GROUP_ID}/invoice-snapshot`)) return jsonResponse({ sources: [], totals: { eligible: 0, invoiced: 0, available: 0 }, financial: { nonFiscalAdvances: 0, operationalBalance: 0 } });
      if (url.endsWith(`/api/groups/${GROUP_ID}/pending-fiscal-collections`)) return jsonResponse([]);
      if (url.endsWith(`/api/groups/${GROUP_ID}/direct-invoices`)) return jsonResponse([]);
      if (url.endsWith(`/api/groups/${GROUP_ID}`)) return jsonResponse(groupFixture);
      if (url.endsWith("/api/bed-types")) return jsonResponse([]);
      if (url.endsWith("/api/billing/config")) return jsonResponse({});
      if (url.endsWith("/api/companies")) return jsonResponse([]);
      if (url.endsWith("/api/agencies")) return jsonResponse([]);
      if (url.endsWith("/api/pos-configs")) return jsonResponse([]);
      if (url.endsWith("/api/charge-types")) return jsonResponse([]);
      if (url.endsWith("/api/room-types")) return jsonResponse([]);
      if (url.endsWith("/api/rate-plans")) return jsonResponse([]);
      return new Response("Not found", { status: 404 });
    }));
  }

  async function openRoomingDialog() {
    const user = userEvent.setup();
    renderPage();
    await screen.findByTestId("text-group-name");
    await user.click(screen.getByTestId("tab-folio"));
    await user.click(await screen.findByTestId("button-folio-pdf"));
    await user.click(await screen.findByText("Rooming List"));
    // DropdownMenuItem defers the dialog open to the next tick (see
    // group-detail.tsx) to avoid a Radix focus-trap conflict.
    await screen.findByText(/Rooming List - /);
    return user;
  }

  let focusSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    queryClient.clear();
    apiRequestMock.mockImplementation(async () => jsonResponse({ success: true }));
    // jsdom's focus/blur event plumbing doesn't match real browsers closely
    // enough for Radix's nested dropdown→dialog focus-trap handoff: calling
    // .focus() during that transition re-enters indefinitely here (it does
    // not in a real browser). Stubbing it out keeps the interaction (click
    // the menu item, dialog opens) testable without that jsdom-only loop.
    focusSpy = vi.spyOn(HTMLElement.prototype, "focus").mockImplementation(() => {});
    // Radix Dialog sets body pointer-events:none while modal/open, and we
    // never explicitly close the dialog at the end of a test — reset it so
    // the next test's clicks on the (fresh) page aren't blocked.
    document.body.style.pointerEvents = "";
  });

  afterEach(() => {
    focusSpy.mockRestore();
    document.body.style.pointerEvents = "";
  });

  it("muestra al titular y, debajo, a sus dos acompañantes con nombre completo, distinguidos visualmente", async () => {
    groupFixture = buildGroup({
      reservations: [reservation({
        id: "res-titular",
        companions: [
          { id: "comp-1", firstName: "Lara", lastName: "Sotelo", documentType: "dni", documentNumber: "40000001" },
          { id: "comp-2", firstName: "Juan", lastName: "Sotelo", documentType: "dni", documentNumber: "40000002" },
        ],
      })],
    });
    stubFetch();
    await openRoomingDialog();

    const container = document.getElementById("rooming-list-content")!;
    expect(within(container).getByTestId("row-rooming-res-titular")).toHaveTextContent("Sotelo Natalicia");
    expect(within(container).getByTestId("row-rooming-companion-comp-1")).toHaveTextContent("Sotelo Lara");
    expect(within(container).getByTestId("row-rooming-companion-comp-2")).toHaveTextContent("Sotelo Juan");
    // Companions are visually marked as such, distinct from the titular row.
    expect(within(container).getAllByText("Acomp.")).toHaveLength(2);
  });

  it("una reserva sin acompañantes se muestra compacta, sin filas vacías", async () => {
    groupFixture = buildGroup({ reservations: [reservation({ id: "res-solo", companions: [] })] });
    stubFetch();
    await openRoomingDialog();

    const container = document.getElementById("rooming-list-content")!;
    expect(within(container).getByTestId("row-rooming-res-solo")).toBeInTheDocument();
    expect(within(container).queryAllByText("Acomp.")).toHaveLength(0);
  });

  it("no mezcla personas de distintas habitaciones ni duplica entre filas", async () => {
    groupFixture = buildGroup({
      reservations: [
        reservation({
          id: "res-A", room: { id: "room-A", roomNumber: "101" },
          guest: { firstName: "Gustavo", lastName: "Holgado", codigo: "G002" },
          companions: [{ id: "comp-a1", firstName: "Compañero", lastName: "DeHolgado", documentNumber: "1" }],
        }),
        reservation({
          id: "res-B", room: { id: "room-B", roomNumber: "102" },
          guest: { firstName: "Nicolas", lastName: "Abreu", codigo: "G003" },
          companions: [{ id: "comp-b1", firstName: "Compañero", lastName: "DeAbreu", documentNumber: "2" }],
        }),
      ],
    });
    stubFetch();
    await openRoomingDialog();

    const container = document.getElementById("rooming-list-content")!;
    expect(within(container).getByTestId("row-rooming-companion-comp-a1")).toHaveTextContent("DeHolgado");
    expect(within(container).getByTestId("row-rooming-companion-comp-b1")).toHaveTextContent("DeAbreu");
    // Each companion row belongs to exactly one room.
    expect(within(container).queryByTestId("row-rooming-companion-comp-a1")).not.toHaveTextContent("DeAbreu");
    expect(within(container).queryByTestId("row-rooming-companion-comp-b1")).not.toHaveTextContent("DeHolgado");
  });

  it("ordena 207, 301, 302, 1001, 1002, 1203 en la vista previa", async () => {
    groupFixture = buildGroup({
      reservations: ["1203", "207", "1001", "1002", "301", "302"].map((roomNumber, i) =>
        reservation({ id: `res-${roomNumber}`, room: { id: `room-${i}`, roomNumber }, guest: { firstName: `G${i}`, lastName: "Apellido", codigo: `G${i}` } }),
      ),
    });
    stubFetch();
    await openRoomingDialog();

    const container = document.getElementById("rooming-list-content")!;
    const rows = within(container).getAllByTestId(/^row-rooming-res-/);
    expect(rows.map(r => r.getAttribute("data-testid"))).toEqual([
      "row-rooming-res-207", "row-rooming-res-301", "row-rooming-res-302",
      "row-rooming-res-1001", "row-rooming-res-1002", "row-rooming-res-1203",
    ]);
  });

  it("no muestra el estado del grupo en el rooming, aunque sigue visible en la gestión del grupo", async () => {
    groupFixture = buildGroup({ status: "blocked", reservations: [reservation({})] });
    stubFetch();
    await openRoomingDialog();

    // "Bloqueado" (label for status "blocked") stays visible in group management (page header)...
    expect(screen.getAllByText("Bloqueado")).toHaveLength(1);
    // ...but never leaks into the printed/previewed rooming content.
    const container = document.getElementById("rooming-list-content")!;
    expect(within(container).queryByText("Bloqueado")).not.toBeInTheDocument();
  });

  it("muestra las notas del grupo una sola vez, y las notas de habitación junto a esa habitación", async () => {
    groupFixture = buildGroup({
      notes: "NO SE PUEDEN MOVER HABITACIONES",
      reservations: [reservation({ id: "res-notes", notes: "Pedido especial de almohadas" })],
    });
    stubFetch();
    await openRoomingDialog();

    const container = document.getElementById("rooming-list-content")!;
    expect(within(container).getAllByText("NO SE PUEDEN MOVER HABITACIONES")).toHaveLength(1);
    expect(within(container).getByTestId("row-rooming-res-notes")).toHaveTextContent("Pedido especial de almohadas");
  });

  // ==================== printRoomingList() generated HTML ====================

  async function printAndCapture(): Promise<string> {
    let capturedHtml = "";
    const fakeWindow = {
      document: {
        write: (html: string) => { capturedHtml = html; },
        close: () => {},
      },
    };
    vi.stubGlobal("open", vi.fn(() => fakeWindow));
    const user = await openRoomingDialog();
    await user.click(screen.getByTestId("button-print-rooming-list"));
    return capturedHtml;
  }

  it("imprime en orden 207, 301, 302, 1001, 1002, 1203", async () => {
    groupFixture = buildGroup({
      reservations: ["1203", "207", "1001", "1002", "301", "302"].map((roomNumber, i) =>
        reservation({ id: `res-${roomNumber}`, room: { id: `room-${i}`, roomNumber }, guest: { firstName: `G${i}`, lastName: "Apellido", codigo: `G${i}` } }),
      ),
    });
    stubFetch();
    const html = await printAndCapture();

    const order = ["207", "301", "302", "1001", "1002", "1203"];
    const positions = order.map(n => html.indexOf(`>${n}<`));
    expect(positions.every(p => p !== -1)).toBe(true);
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
  });

  it("imprime al titular con sus acompañantes con nombre completo", async () => {
    groupFixture = buildGroup({
      reservations: [reservation({
        id: "res-titular",
        companions: [{ id: "comp-1", firstName: "Lara", lastName: "Sotelo", documentNumber: "40000001" }],
      })],
    });
    stubFetch();
    const html = await printAndCapture();

    expect(html).toContain("Sotelo Natalicia");
    expect(html).toContain("Sotelo Lara");
    expect(html).toContain("Acomp.");
  });

  it("nunca imprime el estado del grupo", async () => {
    groupFixture = buildGroup({ status: "blocked", reservations: [reservation({})] });
    stubFetch();
    const html = await printAndCapture();

    // None of the GroupStatusBadge labels ever appear in the printed document.
    for (const label of ["Tentativo", "Bloqueado", "Confirmado", "Finalizado", "Cancelado"]) {
      expect(html).not.toContain(label);
    }
  });

  it("imprime las notas del grupo una sola vez, no repetidas en cada fila", async () => {
    groupFixture = buildGroup({
      notes: "NO SE PUEDEN MOVER HABITACIONES - CIERRA LU EXTRA PAGA PAX",
      reservations: [
        reservation({ id: "res-1", room: { id: "room-1", roomNumber: "101" } }),
        reservation({ id: "res-2", room: { id: "room-2", roomNumber: "102" }, guest: { firstName: "Otro", lastName: "Huesped", codigo: "G009" } }),
      ],
    });
    stubFetch();
    const html = await printAndCapture();

    const occurrences = html.split("NO SE PUEDEN MOVER HABITACIONES").length - 1;
    expect(occurrences).toBe(1);
  });

  it("conserva observaciones largas completas y las reglas de paginación legible", async () => {
    const longNote = "Pedido especial: " + "almohadas extra, cuna, vista al mar, ".repeat(10);
    groupFixture = buildGroup({
      reservations: [reservation({ id: "res-long-notes", notes: longNote })],
    });
    stubFetch();
    const html = await printAndCapture();

    // The full note text survives, uncut.
    expect(html).toContain(longNote);
    // Pagination rules that keep a room+companions block together and repeat
    // the header on each page.
    expect(html).toContain("break-inside: avoid");
    expect(html).toContain("page-break-inside: avoid");
    expect(html).toContain("table-header-group");
    // Uses the page width better (landscape) rather than a cramped notes column.
    expect(html).toContain("landscape");
  });
});
