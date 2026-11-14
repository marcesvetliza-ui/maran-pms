import React, { useState } from "react";
import { act, cleanup, fireEvent, render, renderHook, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { onlineManager } from "@tanstack/react-query";
import { useVerifiedSession } from "./use-verified-session";
import { SessionConnectionNotice } from "@/components/session-connection-notice";
import { apiRequest } from "@/lib/queryClient";

const user = { id: "user-a", role: "comercial", username: "synthetic-a" };
const other = { id: "user-b", role: "reception", username: "synthetic-b" };
const response = (status: number, body: unknown = user, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...headers } });
async function advance(ms = 0) {
  await act(async () => { await vi.advanceTimersByTimeAsync(ms); });
  await act(async () => { await vi.advanceTimersByTimeAsync(10); });
}
class Channel {
  static channels = new Set<Channel>();
  listeners = new Set<(event: MessageEvent) => void>();
  constructor(public name: string) { Channel.channels.add(this); }
  addEventListener(_type: string, fn: (event: MessageEvent) => void) { this.listeners.add(fn); }
  removeEventListener(_type: string, fn: (event: MessageEvent) => void) { this.listeners.delete(fn); }
  close() { Channel.channels.delete(this); }
  static emit(data: unknown) { for (const channel of Channel.channels) for (const fn of channel.listeners) fn(new MessageEvent("message", { data })); }
}
beforeEach(() => { vi.useFakeTimers(); sessionStorage.setItem("maranTabActive", "1"); vi.stubGlobal("BroadcastChannel", Channel); });
afterEach(() => { cleanup(); onlineManager.setOnline(true); vi.useRealTimers(); vi.unstubAllGlobals(); Channel.channels.clear(); });

describe("verified sessions during temporary connection failures", () => {
  it.each([429, 500, 502, 503, 504])("retries HTTP %s without treating it as a lost session", async status => {
    const fetch = vi.fn().mockResolvedValueOnce(response(status)).mockResolvedValueOnce(response(200));
    vi.stubGlobal("fetch", fetch); const invalid = vi.fn();
    const { result } = renderHook(() => useVerifiedSession({ onInvalidated: invalid })); await advance();
    expect(result.current.user).toBeNull(); expect(result.current.blocked).toBe(true); expect(invalid).not.toHaveBeenCalled();
    await expect(apiRequest("POST", "/api/reservations", {})).rejects.toMatchObject({ notSent: true });
    expect(fetch).toHaveBeenCalledTimes(1);
    await advance(1000);
    expect(result.current.user).toEqual(user); expect(result.current.blocked).toBe(false);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch.mock.calls.every(([url]) => url === "/api/auth/me")).toBe(true);
  });
  it("bounds retries after a network failure and lets the user retry manually", async () => {
    onlineManager.setOnline(false);
    const fetch = vi.fn().mockRejectedValue(new TypeError("Network failure")); vi.stubGlobal("fetch", fetch);
    const { result } = renderHook(() => useVerifiedSession()); await advance(); await advance(1000); await advance(2500);
    expect(fetch).toHaveBeenCalledTimes(3); expect(result.current.busy).toBe(false); expect(result.current.blocked).toBe(true);
    await advance(60_000); expect(fetch).toHaveBeenCalledTimes(3); expect(result.current.user).toBeNull();
    fetch.mockResolvedValue(response(200)); act(() => { void result.current.checkAuth(); }); await advance();
    expect(result.current.user).toEqual(user); expect(result.current.blocked).toBe(false);
  });
  it("honors a long Retry-After without polling the rate limit", async () => {
    const fetch = vi.fn().mockResolvedValue(response(429, {}, { "Retry-After": "60" })); vi.stubGlobal("fetch", fetch);
    const { result } = renderHook(() => useVerifiedSession()); await advance();
    expect(result.current.busy).toBe(false); expect(result.current.retryAt).toBeGreaterThan(Date.now());
    await act(async () => { await result.current.checkAuth(); }); await advance(59_000); expect(fetch).toHaveBeenCalledTimes(1);
    fetch.mockResolvedValue(response(200)); await advance(1000); act(() => { void result.current.checkAuth(); }); await advance();
    expect(fetch).toHaveBeenCalledTimes(2); expect(result.current.user).toEqual(user);
  });
  it("ends a truly expired session immediately without retrying credentials", async () => {
    const fetch = vi.fn().mockResolvedValue(response(401, { message: "No autenticado" })); vi.stubGlobal("fetch", fetch);
    const invalid = vi.fn(); const { result } = renderHook(() => useVerifiedSession({ onInvalidated: invalid })); await advance(10_000);
    expect(result.current.user).toBeNull(); expect(result.current.blocked).toBe(false); expect(invalid).toHaveBeenCalledTimes(1); expect(fetch).toHaveBeenCalledTimes(1);
    await expect(apiRequest("POST", "/api/reservations", {})).rejects.toMatchObject({ notSent: true });
  });
  it("keeps the existing requirement to log in in a new tab", async () => {
    sessionStorage.removeItem("maranTabActive"); const fetch = vi.fn().mockResolvedValue(response(200)); vi.stubGlobal("fetch", fetch);
    const { result } = renderHook(() => useVerifiedSession()); await advance();
    expect(result.current.user).toBeNull(); expect(result.current.blocked).toBe(false);
    expect(fetch.mock.calls.map(([url]) => url)).toEqual(["/api/auth/me", "/api/auth/logout"]);
  });
  it("does not accept malformed user data as an authenticated identity", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response(200, { role: "admin" })));
    const { result } = renderHook(() => useVerifiedSession()); await advance(); await advance(1000); await advance(2500);
    expect(result.current.user).toBeNull(); expect(result.current.blocked).toBe(true); expect(result.current.busy).toBe(false);
  });
  it("times out a stalled connection and exhausts only the bounded GET retries", async () => {
    const fetch = vi.fn((_url, init) => new Promise((_resolve, reject) => init.signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")))));
    vi.stubGlobal("fetch", fetch); const { result } = renderHook(() => useVerifiedSession());
    await advance(8000); await advance(1000); await advance(8000); await advance(2500); await advance(8000);
    expect(fetch).toHaveBeenCalledTimes(3); expect(result.current.busy).toBe(false); expect(result.current.blocked).toBe(true);
  });
});

describe("session verification preserves an open reservation safely", () => {
  function Draft() { const [value, setValue] = useState(""); return <input aria-label="Notas sin guardar" value={value} onChange={event => setValue(event.target.value)} />; }
  it("keeps the same form mounted behind the reconnect notice and never replays a write", async () => {
    const fetch = vi.fn().mockResolvedValueOnce(response(200)).mockResolvedValueOnce(response(503)).mockResolvedValueOnce(response(200)); vi.stubGlobal("fetch", fetch);
    let session!: ReturnType<typeof useVerifiedSession>;
    function Harness() {
      session = useVerifiedSession();
      return <>{session.user && <Draft />}<SessionConnectionNotice {...session} modal={!!session.user} onRetry={() => void session.checkAuth()} onLogout={session.clearSession} /></>;
    }
    render(<Harness />); await advance(); const input = screen.getByLabelText("Notas sin guardar"); fireEvent.change(input, { target: { value: "Reserva sin guardar" } });
    act(() => { void session.checkAuth(); }); await advance();
    expect(input).toBeInTheDocument(); expect(input).toHaveValue("Reserva sin guardar"); expect(screen.getByRole("alertdialog")).toBeInTheDocument();
    await expect(apiRequest("POST", "/api/reservations", {})).rejects.toMatchObject({ notSent: true });
    await advance(1000); expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Notas sin guardar")).toBe(input); expect(input).toHaveValue("Reserva sin guardar");
    expect(fetch.mock.calls.every(([url]) => url === "/api/auth/me")).toBe(true);
    fetch.mockResolvedValueOnce(response(201, { id: "new-reservation" })); await apiRequest("POST", "/api/reservations", {});
    expect(fetch.mock.calls.filter(([url]) => url === "/api/reservations")).toHaveLength(1);
  });
  it.each(["manual", "another tab"])("does not restore a session after logout (%s) from a late response", async mode => {
    let resolve!: (value: Response) => void;
    const fetch = vi.fn().mockResolvedValueOnce(response(200)).mockImplementationOnce(() => new Promise<Response>(done => { resolve = done; })); vi.stubGlobal("fetch", fetch);
    const external = vi.fn(); const { result } = renderHook(() => useVerifiedSession({ onExternalLogout: external })); await advance();
    act(() => { void result.current.checkAuth(); }); await advance();
    act(() => { if (mode === "manual") result.current.clearSession(); else Channel.emit({ type: "logout" }); }); await advance();
    resolve(response(200)); await advance();
    expect(result.current.user).toBeNull(); expect(result.current.blocked).toBe(false);
    expect(external).toHaveBeenCalledTimes(mode === "another tab" ? 1 : 0);
  });
  it("uses the freshly verified identity after a login in another tab, ignoring an older response", async () => {
    let resolve!: (value: Response) => void;
    const fetch = vi.fn().mockResolvedValueOnce(response(200)).mockImplementationOnce(() => new Promise<Response>(done => { resolve = done; })).mockResolvedValueOnce(response(200, other)); vi.stubGlobal("fetch", fetch);
    const changed = vi.fn(); const { result } = renderHook(() => useVerifiedSession({ onIdentityChange: changed })); await advance();
    act(() => { void result.current.checkAuth(); }); await advance();
    act(() => Channel.emit({ type: "login" })); await advance(); expect(result.current.user).toEqual(other); expect(changed).toHaveBeenCalledTimes(1);
    resolve(response(200)); await advance(); expect(result.current.user).toEqual(other);
  });
  it("does not let an older verification replace a successful explicit login", async () => {
    let resolve!: (value: Response) => void;
    vi.stubGlobal("fetch", vi.fn().mockImplementation(() => new Promise<Response>(done => { resolve = done; })));
    const { result } = renderHook(() => useVerifiedSession()); await advance();
    act(() => result.current.acceptLogin(other)); await advance(); resolve(response(200)); await advance();
    expect(result.current.user).toEqual(other); expect(result.current.blocked).toBe(false);
  });
  it("keeps an explicitly logged out tab at login when another tab signs in", async () => {
    const fetch = vi.fn().mockResolvedValueOnce(response(200)); vi.stubGlobal("fetch", fetch);
    const {result}=renderHook(()=>useVerifiedSession());await advance();
    sessionStorage.removeItem("maranTabActive");act(()=>result.current.clearSession());await advance();
    act(()=>Channel.emit({type:"login"}));await advance();
    expect(result.current.user).toBeNull();expect(fetch).toHaveBeenCalledTimes(1);
  });
});
