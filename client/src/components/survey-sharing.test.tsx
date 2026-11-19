import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
const state = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock("@/lib/queryClient", () => ({
  apiRequest: (...args: any[]) => state.request(...args),
  queryClient: { invalidateQueries: vi.fn() },
}));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
import { PersonalSurveySharing, SurveySectorLinks } from "./survey-sharing";
let client: QueryClient;
beforeEach(() => {
  client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  state.request.mockReset();
});
afterEach(() => {
  cleanup();
  client.clear();
});
function show(node: React.ReactNode) {
  render(<QueryClientProvider client={client}>{node}</QueryClientProvider>);
}
it("copying a personal invitation does not mark it sent or send an email", async () => {
  const user = userEvent.setup();
  state.request.mockResolvedValue(
    Response.json({ url: "https://hotel.invalid/encuesta/token" }),
  );
  // New Response per call; a consumed response must not be reused by a mock.
  state.request.mockImplementation(async () =>
    Response.json({ url: "https://hotel.invalid/encuesta/token" }),
  );
  show(<PersonalSurveySharing reservationId="stay-test" />);
  await user.click(
    screen.getByRole("button", { name: "Copiar enlace para WhatsApp" }),
  );
  await screen.findByRole("textbox", { name: "Enlace personal de encuesta" });
  expect(state.request).toHaveBeenCalledExactlyOnceWith(
    "POST",
    "/api/reservations/stay-test/survey-link",
    { markSent: false },
  );
  expect(screen.getByRole("link", { name: "Abrir WhatsApp" })).toHaveAttribute(
    "href",
    expect.stringContaining("https://wa.me/"),
  );
  await user.click(
    screen.getByRole("button", { name: "Marcar como compartida por WhatsApp" }),
  );
  await waitFor(() =>
    expect(state.request).toHaveBeenCalledWith(
      "POST",
      "/api/reservations/stay-test/survey-link",
      { markSent: true },
    ),
  );
  expect(
    state.request.mock.calls.some((call) =>
      String(call[1]).includes("survey-invitation"),
    ),
  ).toBe(false);
});
it("shows reusable sharing links with QR and keeps configuration controls for authorized users", async () => {
  state.request.mockImplementation(async () =>
    Response.json([
      {
        sector: "spa",
        url: "https://hotel.invalid/encuesta/general/spa",
        active: true,
      },
    ]),
  );
  show(<SurveySectorLinks canConfigure={false} />);
  expect(
    await screen.findByRole("textbox", { name: "Enlace de SPA" }),
  ).toHaveValue("https://hotel.invalid/encuesta/general/spa");
  expect(
    screen.getByRole("button", { name: "Descargar QR" }),
  ).toBeInTheDocument();
  expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
});
