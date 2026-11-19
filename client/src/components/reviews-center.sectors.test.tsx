import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
const state = vi.hoisted(() => ({ request: vi.fn(), role: "admin" }));
vi.mock("@/App", () => ({
  useAuth: () => ({
    user: { role: state.role },
    hasPermission: (key: string) =>
      state.role === "admin" || key === `api:reviews:sector:${state.role}`,
  }),
}));
vi.mock("@/lib/queryClient", () => ({
  apiRequest: (...args: any[]) => state.request(...args),
  queryClient: { invalidateQueries: vi.fn() },
}));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
import { ReviewsCenter } from "./reviews-center";
import { reviewToday, moveReviewDay } from "@/lib/review-period";
let client: QueryClient;
beforeEach(() => {
  state.role = "admin";
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  state.request
    .mockReset()
    .mockImplementation(async (_method, url) =>
      Response.json(
        url.includes("/areas")
          ? []
          : url.includes("/options")
            ? { rooms: [], channels: [], roomTypes: [] }
            : url.includes("/analytics")
              ? {}
              : url.includes("/links")
                ? []
                : { items: [], total: 0, pageSize: 50 },
      ),
    );
});
afterEach(() => {
  cleanup();
  client.clear();
});
function show() {
  render(
    <QueryClientProvider client={client}>
      <ReviewsCenter />
    </QueryClientProvider>,
  );
}
it("changes sector inbox without losing the yesterday default and opens sharing links", async () => {
  show();
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "SPA" }));
  await waitFor(() =>
    expect(
      state.request.mock.calls.some(
        ([, url]) =>
          String(url).startsWith("/api/reviews?") &&
          new URL("https://x.invalid" + url).searchParams.get("sector") ===
            "spa",
      ),
    ).toBe(true),
  );
  const list = state.request.mock.calls
    .filter(([, url]) => String(url).startsWith("/api/reviews?"))
    .at(-1)!;
  expect(new URL("https://x.invalid" + list[1]).searchParams.get("from")).toBe(
    moveReviewDay(reviewToday(), -1),
  );
  await user.click(screen.getByRole("tab", { name: "Enlaces para compartir" }));
  await waitFor(() =>
    expect(state.request).toHaveBeenCalledWith("GET", "/api/reviews/links"),
  );
});
it("shows the sector operators their inbox instead of hotel invitation controls", () => {
  state.role = "restaurant";
  show();
  expect(
    screen.getByRole("button", { name: "Mi bandeja" }),
  ).toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "Hotel" }),
  ).not.toBeInTheDocument();
  expect(screen.queryByRole("tab", { name: "Envíos" })).not.toBeInTheDocument();
});

it("keeps the mixed inbox compact and shows area columns after choosing a sector", async () => {
  const common = {
    guestName: "Prueba",
    source: "survey",
    rating: 4,
    content: "",
    areaRatings: {},
    areaQuestions: {},
    nps: null,
    followupStatus: "resolved",
    actionAreas: [],
    reviewDate: "2026-11-18",
  };
  state.request.mockImplementation(async (_method, url) =>
    Response.json(
      url.includes("/areas")
        ? [
            {
              key: "room",
              name: "Habitación",
              question: "Habitación",
              active: true,
              inSurvey: true,
              sortOrder: 1,
              notificationArea: "reception",
              sectors: ["hotel"],
            },
            {
              key: "spa",
              name: "SPA",
              question: "SPA",
              active: true,
              inSurvey: true,
              sortOrder: 2,
              notificationArea: "spa",
              sectors: ["spa"],
            },
          ]
        : url.includes("/analytics")
          ? {}
          : url.includes("/options")
            ? {}
            : {
                items: [
                  {
                    ...common,
                    id: "hotel",
                    sector: "hotel",
                    areaRatings: { room: 4 },
                  },
                  {
                    ...common,
                    id: "spa",
                    sector: "spa",
                    areaRatings: { spa: 5 },
                  },
                ],
                total: 2,
                pageSize: 50,
              },
    ),
  );
  show();
  expect(
    await screen.findByText("Elegí un sector para comparar puntajes por área."),
  ).toBeInTheDocument();
  expect(
    screen.queryByRole("columnheader", { name: "Habitación" }),
  ).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "Hotel" }));
  await waitFor(() =>
    expect(
      screen.getByRole("columnheader", { name: "Habitación" }),
    ).toBeInTheDocument(),
  );
});
