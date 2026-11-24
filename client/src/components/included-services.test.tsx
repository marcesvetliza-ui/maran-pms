import { beforeEach, it, expect, vi } from "vitest";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  within,
} from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import {
  IncludedServicesPanel,
  IncludedServicesButton,
} from "./included-services";
import { InclusionTemplateEditor } from "./inclusion-rules-editor";
import { apiRequest, queryClient } from "@/lib/queryClient";
vi.mock("@/App", () => ({
  useAuth: () => ({
    user: { id: "synthetic", role: "admin" },
    hasPermission: () => true,
  }),
}));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock("@/lib/queryClient", async (original) => ({
  ...(await original<typeof import("@/lib/queryClient")>()),
  apiRequest: vi.fn(),
}));
let writes: { method: string; url: string; body: any }[], service: any;
const renderUI = (ui: React.ReactNode) =>
  render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
beforeEach(() => {
  queryClient.clear();
  writes = [];
  service = {
    id: "8d7c1dc5-8d71-4091-b233-422d552980c4",
    sourceId: "synthetic",
    area: "restaurant",
    service: "Cena de ejemplo",
    conditions: "Sin bebidas",
    readyWhen: "arrival",
    quantity: 2,
    used: 0,
    remaining: 2,
    version: 1,
    cancelled: false,
    needsReview: false,
    serviceDate: "2026-11-24",
    validUntil: "2026-11-25",
    sourceKind: "reservation",
    sourceTitle: "Escapada de ejemplo",
    person: "Persona de ejemplo",
    room: "QA-01",
    reservationId: "synthetic",
    present: true,
    ready: true,
  };
  vi.mocked(apiRequest).mockImplementation(async (method, url, body) => {
    if (method !== "GET") {
      writes.push({ method, url, body });
      if (url.endsWith("/actions")) {
        if ((body as any).action === "fulfill")
          service = {
            ...service,
            used: (body as any).quantity,
            remaining: 2 - (body as any).quantity,
            version: 2,
          };
        else
          service = {
            ...service,
            acknowledgedAt: "2026-11-24T12:00:00Z",
            version: 2,
          };
      }
      return { json: async () => ({ saved: true }) } as Response;
    }
    if (url.includes("/templates/"))
      return { json: async () => ({ rules: [], revision: 0 }) } as Response;
    return {
      json: async () => ({
        items: [service],
        pendingToday: 1,
        canCoordinate: true,
        areas: ["restaurant", "spa", "reception"],
        hasMore: false,
        page: 1,
      }),
    } as Response;
  });
});
it("abrir Hospitalidad consulta sin registrar atención y muestra el significado del contador", async () => {
  renderUI(<IncludedServicesButton area="restaurant" />);
  const button = await screen.findByTestId("button-included-hospitality");
  await screen.findByLabelText("1 servicios pendientes de hoy");
  fireEvent.click(button);
  expect(await screen.findByText("Cena de ejemplo")).toBeInTheDocument();
  expect(writes).toHaveLength(0);
  expect(
    screen.getByRole("button", { name: "Registrar atención" }),
  ).toBeInTheDocument();
});
it("visto no manda cantidades ni consume el beneficio", async () => {
  renderUI(<IncludedServicesPanel area="restaurant" />);
  fireEvent.click(await screen.findByRole("button", { name: "Visto" }));
  await waitFor(() => expect(writes).toHaveLength(1));
  expect(writes[0].body.action).toBe("acknowledge");
  expect(writes[0].body.quantity).toBeUndefined();
  expect(service.used).toBe(0);
});
it("una venta anticipada informa los beneficiarios agendados sin duplicar el cupo", async () => {
  service = {
    ...service,
    sourceKind: "spa_sale",
    person: "Comprador de ejemplo",
    room: null,
    serviceDate: null,
    validUntil: null,
    forecastDate: "2026-11-24",
    linkedAppointments: [
      {
        person: "Beneficiaria de ejemplo",
        date: "2026-11-24",
        time: "13:00",
        status: "completed",
      },
    ],
  };
  renderUI(<IncludedServicesPanel area="restaurant" />);
  expect(
    await screen.findByText(
      /Beneficiaria de ejemplo · 24\/11\/2026 · 13:00 · SPA completado/,
    ),
  ).toBeInTheDocument();
  expect(screen.getByText("Comprador de ejemplo")).toBeInTheDocument();
  expect(service.quantity).toBe(2);
  expect(writes).toHaveLength(0);
});
it("la atención parcial requiere detalle y envía cantidad, revisión e identificador", async () => {
  renderUI(<IncludedServicesPanel area="restaurant" />);
  fireEvent.click(
    await screen.findByRole("button", { name: "Registrar atención" }),
  );
  const dialog = screen.getByRole("dialog");
  expect(
    within(dialog).getByRole("button", { name: "Confirmar" }),
  ).toBeDisabled();
  fireEvent.change(within(dialog).getByLabelText("Detalle de la acción"), {
    target: { value: "Se sirvió una cena de ejemplo" },
  });
  fireEvent.click(within(dialog).getByRole("button", { name: "Confirmar" }));
  await waitFor(() => expect(writes).toHaveLength(1));
  expect(writes[0].body).toMatchObject({
    action: "fulfill",
    quantity: 1,
    version: 1,
    note: "Se sirvió una cena de ejemplo",
  });
  expect(writes[0].body.requestId).toMatch(/^[a-f0-9-]{36}$/);
  await waitFor(() =>
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
  );
  expect(service.remaining).toBe(1);
});
it("configurar un incluido no guarda ni afecta ventas hasta pulsar Guardar incluidos", async () => {
  renderUI(<InclusionTemplateEditor type="package" id="synthetic" />);
  fireEvent.click(await screen.findByLabelText("Incluye Restaurant"));
  fireEvent.change(screen.getByLabelText("Servicio 1"), {
    target: { value: "Cena de ejemplo" },
  });
  expect(writes).toHaveLength(0);
  fireEvent.click(screen.getByRole("button", { name: "Guardar incluidos" }));
  await waitFor(() => expect(writes).toHaveLength(1));
  expect(writes[0].method).toBe("PUT");
  expect(writes[0].body).toMatchObject({
    revision: 0,
    rules: [
      {
        area: "restaurant",
        basis: "person_night",
        service: "Cena de ejemplo",
        quantity: 1,
      },
    ],
  });
});
it("agregar media pensión exige referencia y registra solo el seguimiento", async () => {
  renderUI(<IncludedServicesPanel reservationId="synthetic" />);
  fireEvent.click(
    await screen.findByRole("button", {
      name: "Agregar incluidos / media pensión",
    }),
  );
  const dialog = screen.getByRole("dialog");
  expect(
    within(dialog).getByText(/aquí no se agrega un cobro/),
  ).toBeInTheDocument();
  fireEvent.click(within(dialog).getByLabelText("Incluye Restaurant"));
  fireEvent.change(within(dialog).getByLabelText("Servicio 1"), {
    target: { value: "Cena de media pensión" },
  });
  expect(
    within(dialog).getByRole("button", { name: "Registrar incluidos" }),
  ).toBeDisabled();
  fireEvent.change(within(dialog).getByLabelText("Motivo de los incluidos"), {
    target: { value: "Venta de ejemplo registrada en recepción" },
  });
  fireEvent.click(
    within(dialog).getByRole("button", { name: "Registrar incluidos" }),
  );
  await waitFor(() => expect(writes).toHaveLength(1));
  expect(writes[0].url).toBe("/api/hospitality/included-services/supplements");
  expect(writes[0].body.reservationId).toBe("synthetic");
});
