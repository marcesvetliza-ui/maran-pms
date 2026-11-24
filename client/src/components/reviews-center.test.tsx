import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import {
  render,
  screen,
  waitFor,
  cleanup,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
const state = vi.hoisted(() => ({
  request: vi.fn(),
  canConfigure: true,
  canManage: true,
}));
vi.mock("@/App", () => ({
  useAuth: () => ({
    hasPermission: (key: string) =>
      key === "api:reviews:configure" ? state.canConfigure : state.canManage,
  }),
}));
vi.mock("@/lib/queryClient", () => ({
  apiRequest: (...args: any[]) => state.request(...args),
  queryClient: { invalidateQueries: vi.fn() },
}));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
import { ReviewsCenter } from "./reviews-center";
import { SurveyScheduleSettings } from "./survey-schedule-settings";
import { reviewToday, moveReviewDay } from "@/lib/review-period";
const review = {
  id: "review",
  guestName: "Huésped Prueba",
  roomNumber: "506",
  reviewDate: "2026-11-18",
  source: "survey",
  rating: 2,
  content: "Comentario original del huésped",
  areaRatings: { room: 2 },
  areaQuestions: { room: "Pregunta original de habitación" },
  nps: 0,
  contactRequested: true,
  followupStatus: "new",
  assignedTo: null,
  actionAreas: [],
  checkIn: "2026-11-17",
  checkOut: "2026-11-19",
};
const areas = [
  {
    key: "room",
    name: "Habitación",
    question: "Habitación",
    active: true,
    inSurvey: true,
    sortOrder: 1,
    notificationArea: "reception",
  },
  {
    key: "maintenance",
    name: "Mantenimiento",
    question: "Estado",
    active: true,
    inSurvey: false,
    sortOrder: 2,
    notificationArea: "maintenance",
  },
];
beforeEach(() => {
  state.canConfigure = true;
  state.canManage = true;
  state.request.mockImplementation(async (method: string, url: string) => {
    let data: any = { ok: true };
    if (method === "GET")
      data =
        url === "/api/reviews/areas"
          ? areas
          : url === "/api/reviews/options"
            ? { rooms: [], roomTypes: [], channels: [] }
            : url.startsWith("/api/reviews/analytics")
              ? {
                  count: 1,
                  average: 2,
                  pending: 1,
                  areas: { room: { average: 2, count: 1 } },
                  months: {},
                  nps: 0,
                  npsCount: 1,
                  invitations: { sent: 1, responded: 1, responseRate: 100 },
                }
              : url === "/api/reviews/review"
                ? { review, events: [] }
                : url.startsWith("/api/reviews?")
                  ? { items: [review], total: 1, pageSize: 50 }
                  : [];
    return { json: async () => data };
  });
});
afterEach(() => {
  cleanup();
  state.request.mockReset();
});
function renderCenter() {
  const query = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={query}>
      <ReviewsCenter />
    </QueryClientProvider>,
  );
}
describe("Reseñas: filtros del servidor y seguimiento separado de la respuesta", () => {
  it("abre en las encuestas de ayer y permite pasar a hoy y a otra fecha", async () => {
    renderCenter();
    const user = userEvent.setup(),
      today = reviewToday(),
      yesterday = moveReviewDay(today, -1);
    expect(
      screen.getByRole("tab", { name: "Encuestas recibidas" }),
    ).toHaveAttribute("data-state", "active");
    expect(screen.getByRole("button", { name: "Ayer" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.queryByLabelText("Área evaluada")).not.toBeInTheDocument();
    await waitFor(() =>
      expect(
        state.request.mock.calls.some(
          ([m, u]) =>
            m === "GET" &&
            u.startsWith("/api/reviews?") &&
            u.includes("from=" + yesterday) &&
            u.includes("to=" + yesterday) &&
            u.includes("source=survey"),
        ),
      ).toBe(true),
    );
    await user.click(screen.getByRole("button", { name: "Hoy" }));
    await waitFor(() =>
      expect(
        state.request.mock.calls.some(
          ([m, u]) =>
            m === "GET" &&
            u.startsWith("/api/reviews?") &&
            u.includes("from=" + today) &&
            u.includes("to=" + today),
        ),
      ).toBe(true),
    );
    await user.click(screen.getByRole("button", { name: "Día anterior" }));
    expect(screen.getByLabelText("Ver encuestas de otra fecha")).toHaveValue(
      yesterday,
    );
  });
  it("muestra los comentarios con un ojo y abre una lectura separada del seguimiento", async () => {
    renderCenter();
    const user = userEvent.setup();
    await user.click(
      await screen.findByRole("button", {
        name: "Ver comentario de Huésped Prueba",
      }),
    );
    const dialog = await screen.findByRole("dialog");
    expect(
      within(dialog).getByText("Comentario original del huésped"),
    ).toBeInTheDocument();
    expect(
      within(dialog).queryByLabelText("Nota interna"),
    ).not.toBeInTheDocument();
    await user.click(
      within(dialog).getByRole("button", { name: "Ver encuesta completa" }),
    );
    await user.click(
      within(await screen.findByRole("dialog")).getByRole("button", {
        name: "Gestionar seguimiento",
      }),
    );
    await within(screen.getByRole("dialog")).findByLabelText("Nota interna");
  });
  it("abre las respuestas escritas desde el ojo aunque no haya comentario general", async () => {
    const textReview = {
      ...review,
      content: "",
      areaTextAnswers: { suggestion: "Más horarios para el SPA" },
      areaQuestions: { suggestion: "¿Qué mejorarías?" },
      notApplicable: ["room"],
    };
    state.request.mockImplementation(async (method: string, url: string) => ({
      json: async () =>
        url === "/api/reviews/areas"
          ? areas
          : url.includes("/options")
            ? { rooms: [], roomTypes: [], channels: [] }
            : url.includes("/analytics")
              ? {}
              : url.startsWith("/api/reviews?")
                ? { items: [textReview], total: 1, pageSize: 50 }
                : url === "/api/reviews/review"
                  ? { review: textReview, events: [] }
                  : [],
    }));
    renderCenter();
    const user = userEvent.setup();
    await user.click(
      await screen.findByRole("button", {
        name: "Ver comentario de Huésped Prueba",
      }),
    );
    expect(
      within(await screen.findByRole("dialog")).getByText("¿Qué mejorarías?"),
    ).toBeInTheDocument();
    expect(screen.getByText("Más horarios para el SPA")).toBeInTheDocument();
  });
  it("abre el original y guarda una nota de seguimiento sin enviar cambios al comentario ni los puntajes", async () => {
    renderCenter();
    const user = userEvent.setup();
    await user.click(screen.getByRole("tab", { name: "Encuestas recibidas" }));
    await user.click(
      await screen.findByRole("button", {
        name: "Ver encuesta de Huésped Prueba",
      }),
    );
    const dialog = await screen.findByRole("dialog");
    await within(dialog).findByText("Comentario original del huésped");
    expect(
      within(dialog).getByText("Solicitó que el hotel lo contacte."),
    ).toBeInTheDocument();
    expect(
      within(dialog).queryByLabelText("Estado del caso"),
    ).not.toBeInTheDocument();
    expect(state.request.mock.calls.every(([method]) => method === "GET")).toBe(
      true,
    );
    await user.click(
      within(dialog).getByRole("button", { name: "Gestionar seguimiento" }),
    );
    await user.selectOptions(
      within(dialog).getByLabelText("Estado del caso"),
      "in_progress",
    );
    await user.type(
      within(dialog).getByLabelText("Responsable"),
      "Equipo técnico",
    );
    await user.click(
      within(dialog).getByRole("checkbox", { name: "Mantenimiento" }),
    );
    await user.type(
      within(dialog).getByLabelText("Nota interna"),
      "Revisar instalación",
    );
    await user.click(
      within(dialog).getByRole("button", { name: "Guardar seguimiento" }),
    );
    await waitFor(() =>
      expect(state.request).toHaveBeenCalledWith(
        "PATCH",
        "/api/reviews/review/followup",
        {
          status: "in_progress",
          assignedTo: "Equipo técnico",
          actionAreas: ["maintenance"],
          note: "Revisar instalación",
        },
      ),
    );
    const body = state.request.mock.calls.find(([m]) => m === "PATCH")![2];
    expect(body).not.toHaveProperty("content");
    expect(body).not.toHaveProperty("areaRatings");
  });
  it("envía el filtro de área al servidor", async () => {
    renderCenter();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /Más filtros/ }));
    await within(screen.getByLabelText("Área evaluada")).findByRole("option", {
      name: "Habitación",
    });
    await user.selectOptions(screen.getByLabelText("Área evaluada"), "room");
    await waitFor(() =>
      expect(
        state.request.mock.calls.some(
          ([m, u]) =>
            m === "GET" &&
            u.startsWith("/api/reviews?") &&
            u.includes("area=room"),
        ),
      ).toBe(true),
    );
  });
  it("no ofrece carga ni configuración a un rol de solo consulta", async () => {
    state.canManage = false;
    state.canConfigure = false;
    renderCenter();
    expect(
      screen.queryByRole("button", { name: "Cargar opinión" }),
    ).not.toBeInTheDocument();
    await userEvent.click(
      screen.getByRole("tab", { name: "Áreas y preguntas" }),
    );
    expect(
      screen.queryByRole("button", { name: "Agregar área" }),
    ).not.toBeInTheDocument();
  });
});
it("permite guardar el día y horario argentino del correo posestadía", async () => {
  const save = vi.fn();
  render(
    <SurveyScheduleSettings
      cfg={{ checkoutDelayDays: 1, checkoutSendTime: "10:00" }}
      onSave={save}
    />,
  );
  await userEvent.selectOptions(
    screen.getByLabelText("Días después de la salida"),
    "2",
  );
  await userEvent.click(
    screen.getByRole("button", { name: "Guardar horario" }),
  );
  expect(save).toHaveBeenCalledWith({
    checkoutDelayDays: 2,
    checkoutSendTime: "10:00",
  });
});
