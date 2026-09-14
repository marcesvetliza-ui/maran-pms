import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import RoomsPage from "./rooms";
import { queryClient } from "@/lib/queryClient";

/**
 * RoomFormDialog is one instance reused for every room the user edits: it
 * only knows which room to show via the `room` prop plus a `useEffect` that
 * resyncs `formData` from it whenever `open`/`room.id` change (rooms.tsx).
 * If that resync effect ever regresses, the dialog keeps showing whatever
 * bedConfig ("Camaje") it had the first time it mounted, even after saving
 * a different value — the Select looks stale or empty on reopen even though
 * the save actually went through. This guards the whole round trip: open →
 * see the existing value → change and save → verify the PATCH payload →
 * reopen → see the saved value, not the original one.
 */

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

vi.mock("@/App", () => ({
  useAuth: () => ({ user: { id: "user-1", username: "admin", role: "admin" } }),
}));

// Radix's real DropdownMenu fights the Dialog it opens over focus restoration
// once the item's click handler unmounts the menu synchronously — a known
// jsdom-only interaction (real browsers schedule it across frames and never
// hit this). It isn't what this test is about, so swap in a minimal,
// synchronous stand-in that keeps the same roles/behavior the page relies on.
vi.mock("@/components/ui/dropdown-menu", async () => {
  const React = await import("react");
  const Ctx = React.createContext<{ open: boolean; setOpen: (v: boolean) => void }>({
    open: false,
    setOpen: () => {},
  });

  function DropdownMenu({ children }: { children: React.ReactNode }) {
    const [open, setOpen] = React.useState(false);
    return <Ctx.Provider value={{ open, setOpen }}>{children}</Ctx.Provider>;
  }
  function DropdownMenuTrigger({ asChild, children }: { asChild?: boolean; children: React.ReactElement }) {
    const { open, setOpen } = React.useContext(Ctx);
    const onClick = (e: React.MouseEvent) => {
      children.props.onClick?.(e);
      setOpen(!open);
    };
    return asChild ? React.cloneElement(children, { onClick }) : <button onClick={onClick}>{children}</button>;
  }
  function DropdownMenuContent({ children }: { children: React.ReactNode }) {
    const { open } = React.useContext(Ctx);
    return open ? <div role="menu">{children}</div> : null;
  }
  function DropdownMenuItem({ onClick, children, className }: any) {
    const { setOpen } = React.useContext(Ctx);
    return (
      <div
        role="menuitem"
        className={className}
        onClick={(e: React.MouseEvent) => { onClick?.(e); setOpen(false); }}
      >
        {children}
      </div>
    );
  }
  function DropdownMenuSeparator() {
    return <hr />;
  }

  return { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator };
});

const ROOM_TYPE = { id: "type-1", name: "Doble Standard", code: "DBL" };
const ROOM_ID = "room-1";

let currentBedConfig = "MAT";

function buildRoom() {
  return {
    id: ROOM_ID,
    roomNumber: "101",
    roomTypeId: ROOM_TYPE.id,
    roomType: ROOM_TYPE,
    floor: 1,
    status: "available",
    bedConfig: currentBedConfig,
    notes: "",
    isActive: true,
    isVirtual: false,
    features: [] as string[],
    maxOccupancy: 2,
  };
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function renderPage() {
  return render(
    <QueryClientProvider client={queryClient}>
      <RoomsPage />
    </QueryClientProvider>,
  );
}

async function openEditDialog(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByTestId(`btn-menu-${ROOM_ID}`));
  await user.click(await screen.findByRole("menuitem", { name: "Editar habitación" }));
  return screen.findByTestId("select-bed-config");
}

describe("edición de habitaciones — el Camaje persiste al reabrir el formulario", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    queryClient.clear();
    currentBedConfig = "MAT";

    apiRequestMock.mockImplementation(async (method: string, url: string, data?: any) => {
      if (method === "PATCH" && url === `/api/rooms/${ROOM_ID}`) {
        if (data?.bedConfig) currentBedConfig = data.bedConfig;
        return jsonResponse({ ...buildRoom(), ...data });
      }
      return jsonResponse({ error: `Solicitud inesperada: ${method} ${url}` }, 404);
    });

    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "/api/rooms") return jsonResponse([buildRoom()]);
      if (url === "/api/room-types") return jsonResponse([ROOM_TYPE]);
      if (url === "/api/maintenance/work-orders") return jsonResponse([]);
      if (url === "/api/reservations") return jsonResponse([]);
      return jsonResponse({ error: `Solicitud inesperada: ${url}` }, 404);
    }));
  });

  it("muestra el camaje guardado, lo cambia, y lo conserva visible al reabrir", async () => {
    const user = userEvent.setup();
    renderPage();

    // 1. Abre una habitación con camaje existente y verifica el valor seleccionado.
    const bedConfigTrigger = await openEditDialog(user);
    expect(bedConfigTrigger).toHaveTextContent("Matrimonial");

    // 2. Cambia el camaje, guarda y verifica el payload PATCH.
    await user.click(bedConfigTrigger);
    await user.click(await screen.findByRole("option", { name: "Twin (2 camas)" }));
    // A realistic userEvent.click on the submit button doesn't reliably
    // dispatch the native form-submit event for this Dialog+Select
    // combination under jsdom; a plain click event does (same underlying
    // jsdom-only quirk as the DropdownMenu mock above — not a real bug).
    fireEvent.click(screen.getByTestId("button-submit-room"));

    await waitFor(() => expect(apiRequestMock).toHaveBeenCalledWith(
      "PATCH",
      `/api/rooms/${ROOM_ID}`,
      expect.objectContaining({ bedConfig: "TWIN" }),
    ));
    await waitFor(() => expect(screen.queryByTestId("select-bed-config")).not.toBeInTheDocument());

    // 3. Reabre el formulario con los datos actualizados y confirma el valor visible.
    const reopenedTrigger = await openEditDialog(user);
    expect(reopenedTrigger).toHaveTextContent("Twin (2 camas)");
    expect(reopenedTrigger).not.toHaveTextContent("Matrimonial");
  });
});
