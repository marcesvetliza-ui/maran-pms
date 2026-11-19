import { render, screen, cleanup, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
vi.mock("@/components/app-sidebar", () => ({ AppSidebar: () => null }));
vi.mock("@/components/help-chat", () => ({ default: () => null }));
vi.mock("@/components/group-fiscal-collection-watcher", () => ({
  default: () => null,
}));
vi.mock("@/pages/reservations", () => ({
  default: () => <p>Reservas habituales</p>,
}));
vi.mock("@/pages/dashboard", () => ({ default: () => <p>Inicio habitual</p> }));
import App from "./App";
import { queryClient } from "./lib/queryClient";
let role: string, allowReservations: boolean;
beforeEach(() => {
  role = "admin";
  allowReservations = true;
  history.replaceState({}, "", "/new-reservation");
  sessionStorage.setItem("maranTabActive", "1");
  localStorage.setItem("maranPosId", "test-pos");
  vi.stubGlobal("matchMedia", () => ({
    matches: false,
    addEventListener() {},
    removeEventListener() {},
  }));
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async (url: any) =>
        new Response(
          JSON.stringify(
            String(url) === "/api/auth/me"
              ? {
                  id: "retired-entry",
                  username: "synthetic",
                  role,
                  fullName: "Prueba",
                }
              : String(url) === "/api/permissions/mine"
                ? {
                    role,
                    resourceKeys: [
                      "sidebar:/new-reservation",
                      ...(allowReservations ? ["sidebar:/reservations"] : []),
                    ],
                  }
                : [],
          ),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
    ),
  );
});
afterEach(() => {
  cleanup();
  queryClient.clear();
  localStorage.clear();
  sessionStorage.clear();
  vi.unstubAllGlobals();
  history.replaceState({}, "", "/");
});
it.each(["admin", "reception", "comercial"])(
  "redirects a saved quick-reservation URL to the regular creation entry for %s",
  async (currentRole) => {
    role = currentRole;
    render(<App />);
    expect(await screen.findByText("Reservas habituales")).toBeInTheDocument();
    await waitFor(() =>
      expect(location.pathname + location.search).toBe("/reservations?new=1"),
    );
    expect(
      screen.queryByTestId("text-new-reservation-title"),
    ).not.toBeInTheDocument();
    expect(
      vi
        .mocked(fetch)
        .mock.calls.every(([, init]) => !init?.method || init.method === "GET"),
    ).toBe(true);
  },
);
it("does not grant reservations access to a user holding only the retired permission", async () => {
  role = "manager";
  allowReservations = false;
  render(<App />);
  expect(await screen.findByText("Inicio habitual")).toBeInTheDocument();
  expect(location.pathname).toBe("/");
  expect(screen.queryByText("Reservas habituales")).not.toBeInTheDocument();
});
