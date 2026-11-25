import React from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import userEvent from "@testing-library/user-event";
import ReservarPage from "./reservar";

let client: QueryClient;
const hotel = { name: "Hotel sintético", phone: "123456", email: "hotel@example.invalid" };
beforeEach(() => { client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } }); });
afterEach(() => { cleanup(); client.clear(); vi.unstubAllGlobals(); });
it("shows contact information and no sales form while public sales are disabled", async () => {
  const fetcher = vi.fn(async (_input: RequestInfo | URL) => Response.json({ ...hotel, bookingSalesEnabled: false }));
  vi.stubGlobal("fetch", fetcher);
  render(<QueryClientProvider client={client}><ReservarPage /></QueryClientProvider>);
  expect(await screen.findByText("Teléfono: 123456")).toBeInTheDocument();
  expect(screen.getByText("Reservas online no habilitadas")).toBeInTheDocument();
  expect(screen.queryByTestId("input-checkin")).not.toBeInTheDocument();
  expect(fetcher.mock.calls.every(([url]) => String(url).endsWith("/hotel-info"))).toBe(true);
});
it("queries the same adult/child composition sent at confirmation", async () => {
  const fetcher = vi.fn(async (input: RequestInfo | URL) => Response.json(String(input).includes("hotel-info")
    ? { ...hotel, bookingSalesEnabled: true } : { results: [] }));
  vi.stubGlobal("fetch", fetcher);
  render(<QueryClientProvider client={client}><ReservarPage /></QueryClientProvider>);
  await screen.findByTestId("input-checkin");
  const user = userEvent.setup();
  await user.click(screen.getByTestId("select-children"));
  await user.click(screen.getByRole("option", { name: "1 niño" }));
  await user.click(screen.getByTestId("btn-buscar-habitaciones"));
  expect(fetcher.mock.calls.some(([url]) => String(url).includes("adults=2&children=1"))).toBe(true);
});
