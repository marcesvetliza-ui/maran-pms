import { render, screen, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const auth = vi.hoisted(() => ({ allowed: true }));
vi.mock("@/App", () => ({
  useAuth: () => ({
    hasPermission: (key: string) =>
      auth.allowed && key === "sidebar:/reservations",
  }),
}));
import Dashboard from "./dashboard";
let client: QueryClient;
beforeEach(() => {
  auth.allowed = true;
  client = new QueryClient({
    defaultOptions: { queries: { retry: false, queryFn: async () => [] } },
  });
});
afterEach(() => {
  cleanup();
  client.clear();
});
function mount() {
  render(
    <QueryClientProvider client={client}>
      <Dashboard />
    </QueryClientProvider>,
  );
}
it("sends the dashboard creation shortcut to the standard reservations form", () => {
  mount();
  expect(screen.getByTestId("action-new-reservation")).toHaveAttribute(
    "href",
    "/reservations?new=1",
  );
  expect(document.querySelector('a[href="/new-reservation"]')).toBeNull();
});
it("does not offer that shortcut to roles without reservations permission", () => {
  auth.allowed = false;
  mount();
  expect(
    screen.queryByTestId("action-new-reservation"),
  ).not.toBeInTheDocument();
  expect(screen.getByTestId("action-check-in")).toBeInTheDocument();
});
