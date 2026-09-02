import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import RoomTypeIntegrityPage from "./room-type-integrity";
import { queryClient } from "@/lib/queryClient";

const { apiRequestMock, toastMock } = vi.hoisted(() => ({
  apiRequestMock: vi.fn(),
  toastMock: vi.fn(),
}));

vi.mock("@/lib/queryClient", async () => {
  const actual = await vi.importActual<typeof import("@/lib/queryClient")>("@/lib/queryClient");
  return { ...actual, apiRequest: apiRequestMock };
});

vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: toastMock, toasts: [], dismiss: vi.fn() }),
}));

const ORPHAN_ID = "deleted-type";
const TARGET_ID = "double";
const repairError = "La fuente histórica no pudo actualizarse";

const orphanedReferences = [{
  roomTypeId: ORPHAN_ID,
  references: [
    { source: "rooms", count: 2 },
    { source: "reservations", count: 1 },
  ],
}];

const roomTypes = [
  { id: TARGET_ID, name: "Doble", code: "DBL" },
  { id: "suite", name: "Suite", code: "STE" },
];

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function renderPage() {
  return render(
    <QueryClientProvider client={queryClient}>
      <RoomTypeIntegrityPage />
    </QueryClientProvider>,
  );
}

async function chooseTargetAndOpenConfirmation(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByTestId(`select-target-room-type-${ORPHAN_ID}`));
  await user.click(await screen.findByRole("option", { name: "Doble (DBL)" }));
  await user.click(screen.getByTestId(`button-repair-room-type-${ORPHAN_ID}`));
  expect(await screen.findByRole("alertdialog")).toBeInTheDocument();
}

describe("reparación de integridad de tipos de habitación", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    queryClient.clear();
    apiRequestMock.mockResolvedValue(jsonResponse({
      fromRoomTypeId: ORPHAN_ID,
      toRoomTypeId: TARGET_ID,
      updated: [
        { source: "rooms", count: 2 },
        { source: "reservations", count: 1 },
      ],
    }));
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "/api/room-types/integrity") {
        return jsonResponse({ orphanedReferences });
      }
      if (url === "/api/room-types") {
        return jsonResponse(roomTypes);
      }
      return jsonResponse({ error: `Solicitud inesperada: ${url}` }, 404);
    }));
  });

  it("permite seleccionar un destino y confirmar la reparación desde la vista del manager", async () => {
    const user = userEvent.setup();
    renderPage();

    await chooseTargetAndOpenConfirmation(user);
    expect(screen.getByTestId("button-confirm-room-type-repair")).toBeDisabled();

    await user.click(screen.getByTestId("checkbox-confirm-room-type-repair"));
    await user.click(screen.getByTestId("button-confirm-room-type-repair"));

    await waitFor(() => expect(apiRequestMock).toHaveBeenCalledWith(
      "POST",
      "/api/room-types/reassign-references",
      { fromRoomTypeId: ORPHAN_ID, toRoomTypeId: TARGET_ID },
    ));
    expect(await screen.findByText("Reparación completada")).toBeInTheDocument();
    expect(screen.getByText(/Se actualizaron 3 referencias/)).toBeInTheDocument();
  });

  it("ofrece una descarga completa por cada combinación de tipo huérfano y origen", async () => {
    renderPage();

    const roomsDownload = await screen.findByTestId(`button-download-${ORPHAN_ID}-rooms`);
    const reservationsDownload = screen.getByTestId(`button-download-${ORPHAN_ID}-reservations`);

    expect(roomsDownload).toHaveAttribute(
      "href",
      `/api/room-types/integrity/export?roomTypeId=${ORPHAN_ID}&source=rooms`,
    );
    expect(roomsDownload).toHaveAttribute("download");
    expect(reservationsDownload).toHaveAttribute(
      "href",
      `/api/room-types/integrity/export?roomTypeId=${ORPHAN_ID}&source=reservations`,
    );
  });

  it("respeta el rechazo explícito y no llama al endpoint de reparación", async () => {
    const user = userEvent.setup();
    renderPage();

    await chooseTargetAndOpenConfirmation(user);
    await user.click(screen.getByRole("button", { name: "Cancelar" }));

    expect(apiRequestMock).not.toHaveBeenCalled();
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(screen.getByTestId(`card-orphan-room-type-${ORPHAN_ID}`)).toBeInTheDocument();
    expect(screen.getByText("deleted-type")).toBeInTheDocument();
  });

  it("conserva el diagnóstico visible cuando el endpoint rechaza la reparación", async () => {
    const user = userEvent.setup();
    apiRequestMock.mockRejectedValue(new Error(`500: ${JSON.stringify({ error: repairError })}`));
    renderPage();

    await chooseTargetAndOpenConfirmation(user);
    await user.click(screen.getByTestId("checkbox-confirm-room-type-repair"));
    await user.click(screen.getByTestId("button-confirm-room-type-repair"));

    await waitFor(() => expect(toastMock).toHaveBeenCalledWith(expect.objectContaining({
      title: "No se aplicaron cambios",
      variant: "destructive",
    })));
    expect(screen.getByText("La reparación no modificó datos")).toBeInTheDocument();
    expect(screen.getByText(new RegExp(repairError))).toBeInTheDocument();
    expect(screen.getByTestId(`card-orphan-room-type-${ORPHAN_ID}`)).toBeInTheDocument();
    expect(screen.getByText(/3 referencias distribuidas/)).toBeInTheDocument();
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
  });
});