import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, expect, it, vi } from "vitest";
import SurveyPage from "./survey";
vi.mock("wouter", () => ({
  useRoute: () => [true, { token: "synthetic-token" }],
}));
const response = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
const valid = {
  guestName: "Prueba Local",
  checkIn: "2026-11-18",
  checkOut: "2026-11-19",
  roomNumber: "101",
  areas: [],
  googleMapsUrl: null,
};
function mount() {
  render(
    <QueryClientProvider
      client={
        new QueryClient({
          defaultOptions: { queries: { retry: false, gcTime: 0 } },
        })
      }
    >
      <SurveyPage />
    </QueryClientProvider>,
  );
}
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
it("shows the questionnaire for a valid public invitation", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => response(200, valid)),
  );
  mount();
  expect(
    await screen.findByText("Contanos cómo fue tu estadía"),
  ).toBeInTheDocument();
  expect(screen.queryByText("Encuesta no disponible")).not.toBeInTheDocument();
});
it("does not call a valid link expired for an authentication failure and can retry loading it", async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(response(401, { message: "No autenticado" }))
    .mockResolvedValueOnce(response(200, valid));
  vi.stubGlobal("fetch", fetcher);
  mount();
  expect(
    await screen.findByText(
      "No se pudo cargar la encuesta. Reintentá en unos instantes.",
    ),
  ).toBeInTheDocument();
  expect(screen.queryByText(/ya venció/)).not.toBeInTheDocument();
  await userEvent.click(
    screen.getByRole("button", { name: "Volver a intentar" }),
  );
  expect(
    await screen.findByText("Contanos cómo fue tu estadía"),
  ).toBeInTheDocument();
  expect(fetcher).toHaveBeenCalledTimes(2);
  expect(
    fetcher.mock.calls.every(([url]) => url === "/api/survey/synthetic-token"),
  ).toBe(true);
});
it("keeps the actual expiration message without suggesting a retry will renew the token", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      response(410, { error: "El enlace de la encuesta venció." }),
    ),
  );
  mount();
  expect(
    await screen.findByText("El enlace de la encuesta venció."),
  ).toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "Volver a intentar" }),
  ).not.toBeInTheDocument();
});
it("shows thanks for an already-completed invitation", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      response(410, {
        error: "Esta encuesta ya fue completada. ¡Gracias!",
        completed: true,
      }),
    ),
  );
  mount();
  expect(
    await screen.findByText("¡Gracias por tu opinión!"),
  ).toBeInTheDocument();
  expect(screen.queryByText("Encuesta no disponible")).not.toBeInTheDocument();
});
it("offers a loading retry for a network failure without blaming the link", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockRejectedValue(new TypeError("Network error")),
  );
  mount();
  expect(
    await screen.findByRole("button", { name: "Volver a intentar" }),
  ).toBeInTheDocument();
  expect(screen.queryByText(/ya venció/)).not.toBeInTheDocument();
});
