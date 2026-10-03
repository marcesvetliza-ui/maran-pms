import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DESPEGAR_UNBILLED_QUERY_KEY } from "@shared/despegarUnbilled";
import { DespegarUnbilledSection } from "./despegar-unbilled-section";

const reservation = {
  reservationId: "test-checkout",
  reservationCode: "RES-TEST-202",
  roomNumber: "202",
  guestName: "Huésped de prueba",
  checkInDate: "2026-10-01",
  checkOutDate: "2026-10-02",
  totalRoomAmount: 0,
};

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function setup(queryFn: () => Promise<typeof reservation[]>) {
  const client = new QueryClient({
    defaultOptions: { queries: { queryFn, retry: false, gcTime: Infinity } },
  });
  return {
    client,
    mount: () => render(<QueryClientProvider client={client}><DespegarUnbilledSection /></QueryClientProvider>),
  };
}

describe("Actualización de pendientes Despegar", () => {
  it("vuelve a consultar al abrir aunque el resultado vacío esté en caché", async () => {
    const fetchRows = vi.fn().mockResolvedValue([reservation]);
    const { client, mount } = setup(fetchRows);
    client.setQueryData(DESPEGAR_UNBILLED_QUERY_KEY, []);
    mount();
    expect(await screen.findByText("RES-TEST-202")).toBeInTheDocument();
    expect(fetchRows).toHaveBeenCalledTimes(1);
    expect(screen.getByText("$0,00")).toBeInTheDocument();
    client.clear();
  });

  it("refresca con la clave exacta usada después de Night Audit y con Actualizar", async () => {
    const fetchRows = vi.fn().mockResolvedValue([reservation]);
    const { client, mount } = setup(fetchRows);
    mount();
    await screen.findByText("RES-TEST-202");
    fetchRows.mockResolvedValue([]);
    await act(async () => { await client.invalidateQueries({ queryKey: DESPEGAR_UNBILLED_QUERY_KEY }); });
    expect(await screen.findByText("No hay reservas de Despegar sin facturar.")).toBeInTheDocument();
    fetchRows.mockResolvedValue([reservation]);
    await waitFor(() => expect(screen.getByRole("button", { name: "Actualizar" })).not.toBeDisabled());
    fireEvent.click(screen.getByRole("button", { name: "Actualizar" }));
    expect(await screen.findByText("RES-TEST-202")).toBeInTheDocument();
    expect(fetchRows).toHaveBeenCalledTimes(3);
    client.clear();
  });

  it("consulta automáticamente cada minuto", async () => {
    vi.useFakeTimers();
    const fetchRows = vi.fn().mockResolvedValue([]);
    const { client, mount } = setup(fetchRows);
    mount();
    await act(async () => { await vi.advanceTimersByTimeAsync(20); });
    expect(fetchRows).toHaveBeenCalledTimes(1);
    fetchRows.mockResolvedValue([reservation]);
    await act(async () => { await vi.advanceTimersByTimeAsync(60_050); });
    expect(fetchRows).toHaveBeenCalledTimes(2);
    expect(screen.getByText("RES-TEST-202")).toBeInTheDocument();
    client.clear();
  });

  it("muestra un error y no lo confunde con ausencia de pendientes", async () => {
    const { client, mount } = setup(vi.fn().mockRejectedValue(new Error("Sin conexión")));
    mount();
    expect(await screen.findByRole("alert")).toHaveTextContent("No se pudo actualizar");
    expect(screen.queryByText("No hay reservas de Despegar sin facturar.")).not.toBeInTheDocument();
    client.clear();
  });
});