import React, { useState } from "react";
import {
  render,
  renderHook,
  screen,
  waitFor,
  fireEvent,
  act,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useSessionPermissions } from "./use-session-permissions";
const { request, expired } = vi.hoisted(() => ({
  request: vi.fn(),
  expired: vi.fn(),
}));
vi.mock("@/lib/queryClient", () => ({ handleSessionExpired: expired }));
const user = { id: "reception-1", role: "reception" };
const permissions = {
  role: "reception",
  resourceKeys: ["sidebar:/reservations"],
};
const response = (status = 200, body: unknown = permissions, headers = {}) =>
  new Response(JSON.stringify(body), { status, headers });
function Reservation() {
  const [value, setValue] = useState("");
  return (
    <input
      aria-label="Notas de reserva"
      value={value}
      onChange={(e) => setValue(e.target.value)}
    />
  );
}
function Harness({ identity = user }: { identity?: typeof user }) {
  const p = useSessionPermissions(identity);
  return p.ready ? (
    <>
      <Reservation />
      <span>{p.resourceKeys.join(",")}</span>
    </>
  ) : (
    <p>{p.isError ? "Reintentar carga" : "Cargando"}</p>
  );
}
function setup() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return {
    client,
    view: render(
      <QueryClientProvider client={client}>
        <Harness />
      </QueryClientProvider>,
    ),
  };
}
function hook() {
  const client = new QueryClient({
    defaultOptions: { queries: { gcTime: 0 } },
  });
  return renderHook(
    ({ identity }: { identity: typeof user | null }) =>
      useSessionPermissions(identity),
    {
      initialProps: { identity: user as typeof user | null },
      wrapper: ({ children }) => (
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
      ),
    },
  );
}
beforeEach(() => {
  vi.stubGlobal("fetch", request);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.resetAllMocks();
});
it("preserves an open reservation and its draft after a failed background permissions refresh", async () => {
  request.mockResolvedValueOnce(response());
  const { client } = setup();
  const input = await screen.findByLabelText("Notas de reserva");
  fireEvent.change(input, { target: { value: "Sin guardar" } });
  request.mockResolvedValueOnce(response(403));
  await client.refetchQueries({ queryKey: ["/api/permissions/mine"] });
  expect(screen.getByLabelText("Notas de reserva")).toBe(input);
  expect(input).toHaveValue("Sin guardar");
  expect(screen.queryByText("Cargando")).not.toBeInTheDocument();
});
it("does not treat an initial denied request as usable permissions or retry it", async () => {
  request.mockResolvedValue(response(403));
  setup();
  expect(await screen.findByText("Reintentar carga")).toBeInTheDocument();
  expect(screen.queryByLabelText("Notas de reserva")).not.toBeInTheDocument();
  expect(request).toHaveBeenCalledTimes(1);
});
it("does not reuse previous account permissions and applies a successful revocation", async () => {
  request.mockResolvedValueOnce(response());
  const { client, view } = setup();
  await screen.findByLabelText("Notas de reserva");
  request.mockResolvedValueOnce(
    response(200, { role: "reception", resourceKeys: [] }),
  );
  await client.refetchQueries({ queryKey: ["/api/permissions/mine"] });
  await waitFor(() =>
    expect(screen.queryByText("sidebar:/reservations")).not.toBeInTheDocument(),
  );
  request.mockImplementationOnce(() => new Promise(() => {}));
  view.rerender(
    <QueryClientProvider client={client}>
      <Harness identity={{ id: "other", role: "reception" }} />
    </QueryClientProvider>,
  );
  expect(screen.getByText("Cargando")).toBeInTheDocument();
  expect(screen.queryByLabelText("Notas de reserva")).not.toBeInTheDocument();
});
it("automatically recovers a temporary server failure with bounded GET retries", async () => {
  vi.useFakeTimers();
  request
    .mockResolvedValueOnce(response(503))
    .mockResolvedValueOnce(response());
  const { result } = hook();
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1100);
  });
  expect(result.current.ready).toBe(true);
  expect(request).toHaveBeenCalledTimes(2);
  expect(
    request.mock.calls.every(
      ([url, options]) =>
        url === "/api/permissions/mine" &&
        !options.method &&
        options.credentials === "include",
    ),
  ).toBe(true);
});
it("stops after three failed reads and leaves the manual retry available", async () => {
  vi.useFakeTimers();
  request.mockRejectedValue(new TypeError("Failed to fetch"));
  const { result } = hook();
  await act(async () => {
    await vi.advanceTimersByTimeAsync(4000);
  });
  expect(result.current.isError).toBe(true);
  expect(result.current.ready).toBe(false);
  expect(request).toHaveBeenCalledTimes(3);
  request.mockResolvedValueOnce(response());
  await act(async () => {
    await result.current.refetch();
    await vi.advanceTimersByTimeAsync(1);
  });
  expect(result.current.ready).toBe(true);
});
it("honors a long Retry-After without polling or allowing manual retry before the cooldown", async () => {
  vi.useFakeTimers();
  request
    .mockResolvedValueOnce(response(429, {}, { "Retry-After": "60" }))
    .mockResolvedValueOnce(response());
  const { result } = hook();
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1);
  });
  expect(result.current.isError).toBe(true);
  expect(result.current.ready).toBe(false);
  await act(async () => {
    await result.current.refetch();
    await vi.advanceTimersByTimeAsync(59000);
  });
  expect(request).toHaveBeenCalledTimes(1);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1100);
  });
  expect(request).toHaveBeenCalledTimes(2);
  expect(result.current.ready).toBe(true);
});
it("cancels a scheduled cooldown read on account change", async () => {
  vi.useFakeTimers();
  request.mockResolvedValueOnce(response(429, {}, { "Retry-After": "60" }));
  const { result, rerender } = hook();
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1);
  });
  request.mockResolvedValueOnce(
    response(200, { role: "comercial", resourceKeys: ["sidebar:/groups"] }),
  );
  rerender({ identity: { id: "commercial-1", role: "comercial" } });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(61000);
  });
  expect(request).toHaveBeenCalledTimes(2);
  expect(result.current.ready).toBe(true);
  expect(result.current.resourceKeys).toEqual(["sidebar:/groups"]);
});
it("cancels a scheduled cooldown read when unmounted", async () => {
  vi.useFakeTimers();
  request.mockResolvedValueOnce(response(429, {}, { "Retry-After": "60" }));
  const { unmount } = hook();
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1);
  });
  unmount();
  await act(async () => {
    await vi.advanceTimersByTimeAsync(61000);
  });
  expect(request).toHaveBeenCalledTimes(1);
});
it("aborts a hung read after eight seconds and recovers on a later GET", async () => {
  vi.useFakeTimers();
  let aborted = false;
  request.mockImplementationOnce(
    (_url, { signal }) =>
      new Promise((_resolve, reject) =>
        signal.addEventListener("abort", () => {
          aborted = true;
          reject(new DOMException("aborted", "AbortError"));
        }),
      ),
  );
  request.mockResolvedValueOnce(response());
  const { result } = hook();
  await act(async () => {
    await vi.advanceTimersByTimeAsync(9100);
  });
  expect(aborted).toBe(true);
  expect(result.current.ready).toBe(true);
  expect(request).toHaveBeenCalledTimes(2);
});
it("rejects mismatched or malformed successful payloads without granting access", async () => {
  request.mockResolvedValueOnce(
    response(200, { role: "admin", resourceKeys: ["sidebar:/cash-register"] }),
  );
  const { result } = hook();
  await waitFor(() => expect(result.current.isError).toBe(true));
  expect(result.current.ready).toBe(false);
  expect(result.current.resourceKeys).toEqual([]);
  request.mockResolvedValueOnce(
    response(200, { role: "reception", resourceKeys: [null] }),
  );
  await act(async () => {
    await result.current.refetch();
  });
  expect(result.current.ready).toBe(false);
  expect(result.current.resourceKeys).toEqual([]);
});
it("preserves the existing expired-session handling without retrying a 401", async () => {
  request.mockResolvedValue(response(401));
  const { result } = hook();
  await waitFor(() => expect(result.current.isError).toBe(true));
  expect(expired).toHaveBeenCalledTimes(1);
  expect(request).toHaveBeenCalledTimes(1);
  expect(result.current.ready).toBe(false);
});
