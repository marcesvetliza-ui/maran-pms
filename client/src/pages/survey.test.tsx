import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
vi.mock("wouter", () => ({
  useRoute: () => [true, { token: "synthetic-token" }],
}));
import SurveyPage from "./survey";
let fetcher: ReturnType<typeof vi.fn>;
beforeEach(() => {
  fetcher = vi
    .fn()
    .mockImplementation(
      async (_url, options) =>
        new Response(
          JSON.stringify(
            options?.method === "POST"
              ? { ok: true }
              : {
                  guestName: "Prueba",
                  checkIn: "2026-11-17",
                  checkOut: "2026-11-19",
                  areas: [
                    {
                      key: "spa",
                      name: "Spa",
                      question: "¿Cómo fue tu experiencia en el Spa?",
                    },
                  ],
                  googleMapsUrl: "https://maps.google.com/example",
                },
          ),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
    );
  vi.stubGlobal("fetch", fetcher);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
function show() {
  const q = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={q}>
      <SurveyPage />
    </QueryClientProvider>,
  );
}
describe("Encuesta pública breve y sin condicionar el enlace de Google al puntaje", () => {
  it("permite responder solo general, conserva NPS cero y no manda notas de servicios no usados", async () => {
    show();
    const user = userEvent.setup();
    await user.click(
      await screen.findByRole("button", {
        name: "⭐ Calificación general: 1 de 5",
      }),
    );
    await user.selectOptions(screen.getByLabelText("Recomendación"), "0");
    await user.click(screen.getByRole("checkbox"));
    expect(screen.getByRole("checkbox")).toBeChecked();
    await user.click(screen.getByRole("button", { name: "Enviar mi opinión" }));
    await screen.findByText("¡Gracias por tu opinión!");
    const sent = fetcher.mock.calls.find(([, o]) => o?.method === "POST");
    expect(JSON.parse(sent![1].body)).toMatchObject({
      ratingOverall: 1,
      areaRatings: {},
      nps: 0,
      contactRequested: true,
    });
    expect(
      screen.getByRole("link", { name: /compartir tu experiencia en Google/ }),
    ).toHaveAttribute("href", "https://maps.google.com/example");
  });
  it("No corresponde quita un puntaje opcional en lugar de convertirlo en cero", async () => {
    show();
    const user = userEvent.setup();
    await user.click(
      await screen.findByRole("button", {
        name: "⭐ Calificación general: 5 de 5",
      }),
    );
    await user.click(
      screen.getByRole("button", {
        name: "¿Cómo fue tu experiencia en el Spa?: 3 de 5",
      }),
    );
    await user.click(
      screen.getByRole("button", {
        name: "No utilicé este servicio / No corresponde",
      }),
    );
    await user.click(screen.getByRole("button", { name: "Enviar mi opinión" }));
    await waitFor(() =>
      expect(fetcher.mock.calls.some(([, o]) => o?.method === "POST")).toBe(
        true,
      ),
    );
    expect(
      JSON.parse(
        fetcher.mock.calls.find(([, o]) => o?.method === "POST")![1].body,
      ).areaRatings,
    ).toEqual({});
  });
  it("no pide calificaciones cuando el token ya fue respondido", async () => {
    fetcher.mockResolvedValue(
      new Response(
        JSON.stringify({ completed: true, error: "Ya completada" }),
        { status: 410 },
      ),
    );
    show();
    await screen.findByText("¡Gracias por tu opinión!");
    expect(
      screen.queryByRole("button", { name: "Enviar mi opinión" }),
    ).not.toBeInTheDocument();
  });
});
