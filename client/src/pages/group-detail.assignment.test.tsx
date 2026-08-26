import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AssignBlockDialog } from "./group-detail";
import type { GroupRoomBlockWithDetails, GroupWithDetails } from "@shared/schema";

const { apiRequestMock } = vi.hoisted(() => ({
  apiRequestMock: vi.fn(),
}));

vi.mock("@/lib/queryClient", async () => {
  const actual = await vi.importActual<typeof import("@/lib/queryClient")>("@/lib/queryClient");
  return { ...actual, apiRequest: apiRequestMock };
});

const EXISTING_GUEST_ID = "guest-existing-003";
const GROUP_ID = "group-assignment-ui-001";
const PLACEHOLDER_RESERVATION_ID = "reservation-placeholder-ui-001";
const ORIGINAL_ROOM_ID = "room-ui-101";
const NEW_ROOM_ID = "room-ui-202";

const block = {
  id: "block-ui-001",
  groupId: GROUP_ID,
  roomTypeId: "room-type-ui-001",
  quantity: 1,
  ratePlanId: null,
  agreedRate: "100",
  blockCheckInDate: null,
  blockCheckOutDate: null,
  roomType: { id: "room-type-ui-001", name: "Doble", code: "DBL" },
} as GroupRoomBlockWithDetails;

const group = {
  id: GROUP_ID,
  name: "Grupo UI",
  checkInDate: "2026-09-01",
  checkOutDate: "2026-09-03",
  blocks: [block],
  reservations: [{
    id: PLACEHOLDER_RESERVATION_ID,
    roomId: ORIGINAL_ROOM_ID,
    room: {
      id: ORIGINAL_ROOM_ID,
      roomNumber: "101",
      floor: 1,
      roomTypeId: "room-type-ui-001",
    },
    guestId: "group-placeholder-guest",
    guest: { codigo: `GROUP-${GROUP_ID}` },
    status: "confirmed",
    checkInDate: "2026-09-01",
    checkOutDate: "2026-09-03",
  }],
} as GroupWithDetails;

function renderDialog() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <AssignBlockDialog
        group={group}
        block={block}
        open
        onOpenChange={vi.fn()}
        onSuccess={vi.fn()}
      />
    </QueryClientProvider>,
  );
}

describe("group assignment dialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiRequestMock.mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/rooms/available")) {
        return new Response(JSON.stringify([{
          id: NEW_ROOM_ID,
          roomNumber: "202",
          floor: 2,
          roomTypeId: "room-type-ui-001",
        }]), { status: 200 });
      }
      if (url.includes("/api/guests/search")) {
        return new Response(JSON.stringify([{
          id: EXISTING_GUEST_ID,
          firstName: "Ana",
          lastName: "Pérez",
        }]), { status: 200 });
      }
      return new Response("Not found", { status: 404 });
    }));
  });

  it("conserva la ficha elegida al cambiar la habitación de la misma fila", async () => {
    const user = userEvent.setup();
    renderDialog();

    const guestInput = await screen.findByTestId("guest-selector-0-input");
    await user.type(guestInput, "Ana");
    await user.click(await screen.findByTestId(`guest-selector-0-result-${EXISTING_GUEST_ID}`));

    expect(screen.getByText("Pérez Ana")).toBeInTheDocument();

    await user.click(screen.getByTestId("select-room-0"));
    await user.click(await screen.findByRole("option", { name: /Hab\. 202/ }));

    expect(screen.getByText("Pérez Ana")).toBeInTheDocument();

    await user.click(screen.getByTestId("button-confirm-assign-all"));

    await waitFor(() => expect(apiRequestMock).toHaveBeenCalledWith(
      "PATCH",
      `/api/groups/${GROUP_ID}/placeholder-reservations/${PLACEHOLDER_RESERVATION_ID}`,
      expect.objectContaining({
        guestId: EXISTING_GUEST_ID,
        roomId: NEW_ROOM_ID,
        guestFirstName: "Ana",
        guestLastName: "Pérez",
      }),
    ));
  });
});