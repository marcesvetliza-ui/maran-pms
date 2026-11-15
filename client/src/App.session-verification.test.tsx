import React, { useState } from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/components/app-sidebar", () => ({ AppSidebar: () => {
  const auth = useAuth();
  return <aside><span>{auth.user?.username}</span><button onClick={auth.logout}>Salir del sistema</button></aside>;
} }));
vi.mock("@/pages/reservations", () => ({ default: function Reservations() {
  const [value, setValue] = useState("");
  const [open, setOpen] = useState(true);
  return <Dialog open={open} onOpenChange={setOpen}><DialogContent><DialogTitle>Nueva reserva</DialogTitle><DialogDescription>Datos pendientes de guardar.</DialogDescription>
    <input aria-label="Reserva sin guardar" value={value} onChange={event => setValue(event.target.value)} />
  </DialogContent></Dialog>;
} }));
vi.mock("@/components/help-chat", () => ({ default: () => null }));
vi.mock("@/components/group-fiscal-collection-watcher", () => ({ default: () => null }));
import App, { useAuth } from "./App";
import { apiRequest, queryClient } from "./lib/queryClient";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "./components/ui/dialog";

const identity = { id: "session-a", username: "synthetic-a", role: "comercial", fullName: "Synthetic A" };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
class Channel {
  static instances = new Set<Channel>();
  listeners = new Set<(event: MessageEvent) => void>();
  constructor(_name: string) { Channel.instances.add(this); }
  addEventListener(_event: string, listener: (event: MessageEvent) => void) { this.listeners.add(listener); }
  removeEventListener(_event: string, listener: (event: MessageEvent) => void) { this.listeners.delete(listener); }
  close() { Channel.instances.delete(this); }
  postMessage(data: unknown) { for (const instance of Channel.instances) if (instance !== this) instance.receive(data); }
  receive(data: unknown) { for (const listener of this.listeners) listener(new MessageEvent("message", { data })); }
  static emit(data: unknown) { for (const instance of Channel.instances) instance.receive(data); }
}
function install(me: () => Promise<Response>, logout: () => Promise<Response> = async () => json({})) {
  const fetch = vi.fn(async (url: any, options?: RequestInit) => {
    if (String(url) === "/api/auth/me") return me();
    if (String(url) === "/api/auth/logout") return logout();
    if (String(url) === "/api/permissions/mine") return json({ role: identity.role, resourceKeys: ["sidebar:/reservations"] });
    return json([]);
  });
  vi.stubGlobal("fetch", fetch); return fetch;
}
beforeEach(() => {
  history.replaceState({}, "", "/reservations");
  sessionStorage.setItem("maranTabActive", "1"); localStorage.setItem("maranPosId", "test-pos");
  vi.stubGlobal("BroadcastChannel", Channel);
  vi.stubGlobal("matchMedia", () => ({ matches: false, addEventListener() {}, removeEventListener() {} }));
});
afterEach(() => { cleanup(); queryClient.clear(); localStorage.clear(); vi.unstubAllGlobals(); Channel.instances.clear(); });

describe("authentication handling in the mounted application", () => {
  it("shows reconnection instead of login when the server is still starting", async () => {
    let calls = 0; install(async () => ++calls === 1 ? json({}, 503) : json(identity)); render(<App />);
    expect(await screen.findByText("Reconectando con el sistema")).toBeInTheDocument();
    expect(screen.queryByTestId("card-login")).not.toBeInTheDocument(); expect(screen.queryByLabelText("Reserva sin guardar")).not.toBeInTheDocument();
    expect(await screen.findByLabelText("Reserva sin guardar", {}, { timeout: 4000 })).toBeInTheDocument();
    expect(calls).toBe(2);
  });
  it("preserves the actual mounted form through a failed background verification", async () => {
    let calls = 0; const fetch = install(async () => ++calls === 2 ? json({}, 503) : json(identity)); render(<App />);
    const input = await screen.findByLabelText("Reserva sin guardar"); fireEvent.change(input, { target: { value: "Cliente y fechas todavía sin guardar" } });
    act(() => Channel.emit({ type: "login" }));
    expect(await screen.findByRole("alertdialog")).toBeInTheDocument();
    fireEvent.keyDown(document, { key: "Escape" }); expect(screen.getByRole("alertdialog")).toBeInTheDocument();
    await expect(apiRequest("POST", "/api/reservations", {})).rejects.toMatchObject({ notSent: true });
    expect(input).toBeInTheDocument(); expect(input).toHaveValue("Cliente y fechas todavía sin guardar");
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument(), { timeout: 4000 });
    expect(screen.getByLabelText("Reserva sin guardar")).toBe(input); expect(input).toHaveValue("Cliente y fechas todavía sin guardar");
    expect(fetch.mock.calls.some(([, options]) => options?.method === "POST")).toBe(false);
  });
  it("cancels verification on manual logout and waits for logout before enabling login", async () => {
    let calls = 0, finishVerification!: (value: Response) => void, finishLogout!: (value: Response) => void;
    install(async () => ++calls === 1 ? json(identity) : new Promise<Response>(resolve => { finishVerification = resolve; }),
      () => new Promise<Response>(resolve => { finishLogout = resolve; })); render(<App />);
    await screen.findByLabelText("Reserva sin guardar"); act(() => Channel.emit({ type: "login" })); await screen.findByRole("alertdialog");
    fireEvent.click(screen.getByRole("button", { name: "Cerrar sesión" }));
    expect(await screen.findByText("Cerrando sesión…")).toBeInTheDocument(); expect(screen.queryByTestId("card-login")).not.toBeInTheDocument();
    await act(async () => { finishVerification(json(identity)); });
    expect(screen.getByText("Cerrando sesión…")).toBeInTheDocument();
    await act(async () => { finishLogout(json({})); });
    expect(await screen.findByTestId("card-login")).toBeInTheDocument(); expect(screen.queryByLabelText("Reserva sin guardar")).not.toBeInTheDocument();
    expect(calls).toBe(2);
  });
});
