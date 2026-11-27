import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { queryClient } from "@/lib/queryClient";
import { GroupFormDialog } from "./groups";
import type { GroupWithDetails } from "@shared/schema";
import type { GroupStayPreview } from "@shared/groupStayDates";

const { toast } = vi.hoisted(() => ({ toast: vi.fn() }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast }) }));
const group = { id: "group-date-test", name: "Grupo prueba", status: "confirmed", checkInDate: "2030-05-03", checkOutDate: "2030-05-07" } as GroupWithDetails;
const response = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json" } });
function preview(overrides: Partial<GroupStayPreview> = {}): GroupStayPreview {
  return { fingerprint: "a".repeat(64), canConfirm: true, beforeTotal: "588000.00", afterTotal: "441000.00", difference: "-147000.00",
    rows: [{ reservationId: "r1", roomNumber: "503", changed: true, ownDates: false,
      before: { checkInDate: group.checkInDate, checkOutDate: group.checkOutDate, nights: 4, total: "588000.00" },
      after: { checkInDate: "2030-05-04", checkOutDate: group.checkOutDate, nights: 3, total: "441000.00" }, missingRates: [] }], ...overrides };
}
let fetchMock: ReturnType<typeof vi.fn>;
let currentPreview: GroupStayPreview;
let patchStatus: number;
let saved: ReturnType<typeof vi.fn<() => void>>;
function calls(method: string) { return fetchMock.mock.calls.filter(([, options]) => options?.method === method); }
function open() { render(<QueryClientProvider client={queryClient}><GroupFormDialog group={group} open onOpenChange={vi.fn()} onSuccess={saved} /></QueryClientProvider>); }
async function changeDates() {
  fireEvent.change(screen.getByTestId("input-group-checkin"), { target: { value: "2030-05-04" } });
  fireEvent.click(screen.getByTestId("button-save-group"));
  await screen.findByTestId("group-stay-preview");
}
describe("cambio de fechas del grupo con revisión de importes", () => {
  beforeEach(() => {
    queryClient.clear(); toast.mockClear(); saved = vi.fn(); patchStatus = 200; currentPreview = preview();
    fetchMock = vi.fn(async (url: string, options?: RequestInit) => {
      if (url.includes("date-conflicts")) return response({ conflicts: [] });
      if (url.endsWith("date-change-preview")) return response(currentPreview);
      if (options?.method === "PATCH") return response(patchStatus === 200 ? { propagatedCount: 1 } : { error: "La vista previa cambió. Revisá los importes." }, patchStatus);
      return response([]);
    });
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => { cleanup(); queryClient.clear(); vi.unstubAllGlobals(); });

  it("muestra noches y total calculados antes de enviar la confirmación al servidor", async () => {
    open(); await changeDates();
    expect(screen.getByText(/4 noches/)).toBeInTheDocument();
    expect(screen.getByText(/3 noches/)).toBeInTheDocument();
    expect(calls("PATCH")).toHaveLength(0);
    expect(JSON.parse(String(calls("POST")[0][1].body))).toMatchObject({ checkInDate: "2030-05-04", addedRates: {} });
    fireEvent.click(screen.getByRole("button", { name: "Confirmar cambio" }));
    await waitFor(() => expect(saved).toHaveBeenCalledOnce());
    expect(JSON.parse(String(calls("PATCH")[0][1].body))).toMatchObject({ dateChangeConfirmation: { fingerprint: "a".repeat(64), addedRates: {} } });
  });

  it("conserva la revisión tras un rechazo y exige actualizarla antes de reintentar", async () => {
    patchStatus = 409; open(); await changeDates();
    fireEvent.click(screen.getByRole("button", { name: "Confirmar cambio" }));
    await screen.findByRole("button", { name: "Revisar importes" });
    expect(screen.getByRole("button", { name: "Confirmar cambio" })).toBeDisabled();
    expect(saved).not.toHaveBeenCalled();
    patchStatus = 200; currentPreview = preview({ fingerprint: "b".repeat(64) });
    fireEvent.click(screen.getByRole("button", { name: "Revisar importes" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Confirmar cambio" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "Confirmar cambio" }));
    await waitFor(() => expect(saved).toHaveBeenCalledOnce());
    expect(JSON.parse(String(calls("PATCH")[1][1].body)).dateChangeConfirmation.fingerprint).toBe("b".repeat(64));
  });

  it("exige cotizar una noche variable nueva y revisar su total antes de guardar", async () => {
    const row = preview().rows[0];
    currentPreview = preview({ canConfirm: false, afterTotal: null, difference: null, rows: [{ ...row, after: { ...row.after, total: null }, missingRates: ["2030-05-07"] }] });
    open(); await changeDates();
    expect(screen.getByRole("button", { name: "Confirmar cambio" })).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Tarifa Hab. 503 2030-05-07"), { target: { value: "150000" } });
    expect(calls("PATCH")).toHaveLength(0);
    currentPreview = preview({ fingerprint: "c".repeat(64) });
    fireEvent.click(screen.getByRole("button", { name: "Revisar importes" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Confirmar cambio" })).toBeEnabled());
    expect(JSON.parse(String(calls("POST")[1][1].body)).addedRates).toEqual({ r1: { "2030-05-07": "150000" } });
    fireEvent.click(screen.getByRole("button", { name: "Confirmar cambio" }));
    await waitFor(() => expect(saved).toHaveBeenCalledOnce());
    expect(JSON.parse(String(calls("PATCH")[0][1].body)).dateChangeConfirmation).toEqual({ fingerprint: "c".repeat(64), addedRates: { r1: { "2030-05-07": "150000" } } });
  });

  it("editar datos del grupo sin cambiar fechas no inicia una reprogramación", async () => {
    open(); fireEvent.click(screen.getByTestId("button-save-group"));
    await screen.findByText("Confirmar cambios del grupo");
    fireEvent.click(screen.getByRole("button", { name: "Confirmar cambio" }));
    await waitFor(() => expect(saved).toHaveBeenCalledOnce());
    expect(calls("POST")).toHaveLength(0);
    expect(JSON.parse(String(calls("PATCH")[0][1].body)).dateChangeConfirmation).toBeUndefined();
  });
});
