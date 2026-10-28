import React from "react";
import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanupWithTimers } from "@/test/cleanup-with-timers";
import { Toast, ToastProvider, ToastTitle, ToastViewport } from "./toast";

describe("real Radix Toast timer lifecycle", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(async () => {
    if (vi.isFakeTimers()) await cleanupWithTimers();
  });

  it("executes a pending close callback before disposing the DOM, even after unmount", async () => {
    const onOpenChange = vi.fn();
    const { unmount } = render(
      <ToastProvider duration={2000}>
        <Toast open onOpenChange={onOpenChange}>
          <ToastTitle>Pago recuperado</ToastTitle>
        </Toast>
        <ToastViewport />
      </ToastProvider>,
    );

    expect(screen.getByText("Pago recuperado")).toBeVisible();
    expect(vi.getTimerCount()).toBeGreaterThan(0);
    expect(onOpenChange).not.toHaveBeenCalled();
    unmount();

    // Reproduce the upstream timer that survives unmount. Execute it rather
    // than clearing it, so document access or callback errors still fail.
    expect(vi.getTimerCount()).toBeGreaterThan(0);
    await cleanupWithTimers();
    expect(onOpenChange).toHaveBeenCalledExactlyOnceWith(false);
    expect(vi.isFakeTimers()).toBe(false);
  });

  it("still auto-closes normally while mounted", async () => {
    const onOpenChange = vi.fn();
    render(
      <ToastProvider duration={2000}>
        <Toast open onOpenChange={onOpenChange}>
          <ToastTitle>Pago registrado</ToastTitle>
        </Toast>
        <ToastViewport />
      </ToastProvider>,
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1999);
    });
    expect(onOpenChange).not.toHaveBeenCalled();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(onOpenChange).toHaveBeenCalledExactlyOnceWith(false);
  });
});
