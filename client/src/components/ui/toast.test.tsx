import { StrictMode, useState } from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Toast, ToastAction, ToastClose, ToastDescription, ToastProvider, ToastTitle, ToastViewport } from "./toast";
import { cleanupWithTimers } from "@/test/cleanup-with-timers";

function Notice({ duration = 1000, changed = vi.fn() }: { duration?: number; changed?: (open: boolean) => void }) {
  const [open, setOpen] = useState(true);
  return <ToastProvider duration={duration}>
    <button>Fuera del aviso</button>
    <Toast open={open} onOpenChange={value => { changed(value); setOpen(value); }}>
      <ToastTitle>Reserva guardada</ToastTitle><ToastDescription>Los datos se guardaron.</ToastDescription>
      <ToastAction altText="Consultar la reserva">Ver reserva</ToastAction><ToastClose aria-label="Cerrar aviso" />
    </Toast>
    <ToastViewport data-testid="viewport" />
  </ToastProvider>;
}
async function advance(ms: number) { await act(async () => { await vi.advanceTimersByTimeAsync(ms); }); }
beforeEach(() => vi.useFakeTimers());
afterEach(async () => { try { await cleanupWithTimers(); } finally { vi.useRealTimers(); } });

describe("real Radix toast lifecycle", () => {
  // Radix 1.2.7 ran onOpenChange(false) after unmount. Require actual
  // cancellation, rather than relying on the suite cleanup to drain it.
  it("cancels automatic close when unmounted instead of running a late callback", async () => {
    const changed = vi.fn();
    const mounted = render(<StrictMode><Notice changed={changed} /></StrictMode>);
    await advance(100);
    mounted.unmount();
    await advance(2000);
    expect(changed).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });
  it("automatically closes once at the configured duration", async () => {
    const changed = vi.fn(); render(<Notice changed={changed} />);
    await advance(999); expect(changed).not.toHaveBeenCalled();
    await advance(1); expect(changed).toHaveBeenCalledExactlyOnceWith(false);
    expect(screen.queryByRole("button", { name: "Cerrar aviso" })).not.toBeInTheDocument();
  });
  it("pauses on hover and resumes with the remaining time", async () => {
    const changed = vi.fn(); render(<Notice changed={changed} />);
    const region = screen.getByRole("region");
    await advance(400); fireEvent.pointerMove(region);
    await advance(2000); expect(changed).not.toHaveBeenCalled();
    fireEvent.pointerLeave(region);
    await advance(599); expect(changed).not.toHaveBeenCalled();
    await advance(1); expect(changed).toHaveBeenCalledExactlyOnceWith(false);
  });
  it("pauses while an action has focus and restores focus on manual close", async () => {
    const changed = vi.fn(); render(<Notice changed={changed} />);
    act(() => screen.getByRole("button", { name: "Ver reserva" }).focus());
    await advance(2000); expect(changed).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Cerrar aviso" }));
    expect(changed).toHaveBeenCalledExactlyOnceWith(false);
    expect(screen.getByTestId("viewport")).toHaveFocus();
    await advance(2000); expect(changed).toHaveBeenCalledTimes(1);
  });
  it("resumes after focus leaves the notice using only the remaining time", async () => {
    const changed = vi.fn(); render(<Notice changed={changed} />);
    await advance(400);
    act(() => screen.getByRole("button", { name: "Ver reserva" }).focus());
    await advance(2000); expect(changed).not.toHaveBeenCalled();
    act(() => screen.getByRole("button", { name: "Fuera del aviso" }).focus());
    await advance(599); expect(changed).not.toHaveBeenCalled();
    await advance(1); expect(changed).toHaveBeenCalledExactlyOnceWith(false);
    expect(screen.getByRole("button", { name: "Fuera del aviso" })).toHaveFocus();
  });
  it("keeps a persistent notice open until manually dismissed", async () => {
    const changed = vi.fn(); render(<Notice duration={Infinity} changed={changed} />);
    await advance(10000); expect(changed).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Cerrar aviso" }));
    expect(changed).toHaveBeenCalledExactlyOnceWith(false);
  });
  it("supports the keyboard shortcut and Escape without delayed close", async () => {
    const changed = vi.fn(); render(<Notice changed={changed} />);
    fireEvent.keyDown(document, { key: "F8", code: "F8" });
    expect(screen.getByTestId("viewport")).toHaveFocus();
    act(() => screen.getByRole("button", { name: "Ver reserva" }).focus());
    fireEvent.keyDown(screen.getByRole("button", { name: "Ver reserva" }), { key: "Escape", code: "Escape" });
    expect(changed).toHaveBeenCalledExactlyOnceWith(false);
    await advance(2000); expect(changed).toHaveBeenCalledTimes(1);
  });
  it("announces title, description and action context through the live region", async () => {
    render(<Notice />); await advance(100);
    const announcement = screen.getAllByRole("status").find(node => node.getAttribute("aria-live") === "assertive")!;
    expect(announcement).toHaveAttribute("aria-live", "assertive");
    expect(announcement).toHaveTextContent("Reserva guardada");
    expect(announcement).toHaveTextContent("Los datos se guardaron.");
    expect(announcement).toHaveTextContent("Consultar la reserva");
  });
});
