import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
vi.mock("wouter", () => ({
  useRoute: (path: string) =>
    path.includes("general") ? [true, { sector: "events" }] : [false, null],
}));
import SurveyPage from "./survey";
let client: QueryClient;
let sequence = 0;
beforeEach(() => {
  sequence = 0;
  client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url, init) =>
      Response.json(
        init?.method === "POST"
          ? { ok: true }
          : {
              kind: "generic",
              sector: "events",
              sectorName: "Eventos",
              challenge: "signed-" + ++sequence,
              areas: [
                { key: "events_attention", question: "Atención en el evento" },
              ],
            },
      ),
    ),
  );
});
afterEach(() => {
  cleanup();
  client.clear();
  vi.unstubAllGlobals();
});
function show() {
  return render(
    <QueryClientProvider client={client}>
      <SurveyPage />
    </QueryClientProvider>,
  );
}
it("opens a blank sector form and requires a contact only when requested", async () => {
  show();
  const user = userEvent.setup();
  await user.click(
    await screen.findByRole("button", {
      name: "⭐ Calificación general: 5 de 5",
    }),
  );
  expect(screen.queryByText(/Hab\./)).not.toBeInTheDocument();
  expect(screen.getByTestId("input-guest-name")).toHaveValue("");
  expect(screen.getByLabelText("Nombre del evento")).toBeInTheDocument();
  await user.click(screen.getByRole("checkbox"));
  expect(screen.getByTestId("button-submit-survey")).toBeDisabled();
  await user.type(
    screen.getByLabelText("Correo de contacto"),
    "visita@example.invalid",
  );
  await user.type(screen.getByLabelText("Nombre del evento"), "Evento prueba");
  await user.click(screen.getByTestId("button-submit-survey"));
  await screen.findByText("¡Gracias por tu opinión!");
  const call = vi
    .mocked(fetch)
    .mock.calls.find(([, init]) => init?.method === "POST")!;
  expect(call[0]).toBe("/api/survey/general/events");
  expect(JSON.parse(String(call[1]!.body))).toMatchObject({
    challenge: "signed-1",
    contactRequested: true,
    contactEmail: "visita@example.invalid",
    eventName: "Evento prueba",
    areaRatings: {},
  });
  expect(JSON.parse(String(call[1]!.body))).not.toHaveProperty("reservationId");
});
it("uses a fresh form access when another visitor opens the same sector link", async () => {
  const first = show();
  await screen.findByText("Atención en el evento");
  first.unmount();
  show();
  await screen.findByText("Atención en el evento");
  await waitFor(() => expect(sequence).toBe(2));
  expect(screen.getByTestId("input-guest-name")).toHaveValue("");
});
