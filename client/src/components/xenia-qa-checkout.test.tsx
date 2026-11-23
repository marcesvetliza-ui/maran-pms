import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { XeniaQaCheckout } from "./xenia-qa-checkout";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
function mount(fetcher: ReturnType<typeof vi.fn>) {
  vi.stubGlobal("fetch", fetcher);
  const complete = vi.fn();
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })}>
    <XeniaQaCheckout open reservationId="stay" onClose={() => {}} onComplete={complete} />
  </QueryClientProvider>);
  return complete;
}
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
describe("QA departure", () => {
  it("blocks departure while money remains and never starts a payment or fiscal request", async () => {
    const fetcher = vi.fn(async () => json({ balance: 1000 }));
    mount(fetcher);
    await screen.findByTestId("xenia-qa-checkout-balance");
    expect(screen.getByTestId("button-confirm-xenia-qa-checkout")).toBeDisabled();
    expect(fetcher.mock.calls).toHaveLength(1);
  });
  it("resolves a lost checkout response from server state without repeating the operation", async () => {
    const fetcher = vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === "POST") throw Error("connection lost");
      return json(url.endsWith("/folio") ? { balance: 0 } : { status: "checked_out" });
    });
    const complete = mount(fetcher);
    const button = await screen.findByTestId("button-confirm-xenia-qa-checkout");
    await waitFor(() => expect(button).toBeEnabled());
    await userEvent.click(button);
    await waitFor(() => expect(complete).toHaveBeenCalledTimes(1));
    expect(fetcher.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(1);
    expect(fetcher.mock.calls.some(([url]) => /payments|billing/.test(url))).toBe(false);
  });
  it("keeps the stay pending after a rejection and refreshes its balance", async () => {
    let reads = 0;
    const fetcher = vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === "POST") return json({ error: "balance changed" }, 409);
      return json(url.endsWith("/folio") ? { balance: reads++ ? 1000 : 0 } : { status: "checked_in" });
    });
    const complete = mount(fetcher);
    const button = await screen.findByTestId("button-confirm-xenia-qa-checkout");
    await waitFor(() => expect(button).toBeEnabled());
    await userEvent.click(button);
    await screen.findByRole("alert");
    await waitFor(() => expect(button).toBeDisabled());
    expect(complete).not.toHaveBeenCalled();
  });
});
