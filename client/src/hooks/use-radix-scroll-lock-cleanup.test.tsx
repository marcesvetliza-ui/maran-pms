import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useRadixScrollLockCleanup } from "./use-radix-scroll-lock-cleanup";

const changeLock = async (value = "1") => {
  await act(async () => {
    document.body.setAttribute("data-scroll-locked", value);
    await Promise.resolve();
  });
};
const advance = async (milliseconds: number) => {
  await act(async () => { await vi.advanceTimersByTimeAsync(milliseconds); });
};

beforeEach(() => { vi.useFakeTimers(); });
afterEach(async () => {
  cleanup();
  // Keep timer teardown inside this test's DOM lifetime.
  await vi.runOnlyPendingTimersAsync();
  document.body.removeAttribute("data-scroll-locked");
  document.body.removeAttribute("style");
  document.body.replaceChildren();
  vi.useRealTimers();
});

describe("Radix scroll-lock cleanup lifecycle", () => {
  it("clears a stale lock after the delay while the layout is mounted", async () => {
    const hidden = document.createElement("main");
    hidden.setAttribute("aria-hidden", "true");
    document.body.append(hidden);
    document.body.style.pointerEvents = "none";
    document.body.style.overflow = "hidden";
    renderHook(useRadixScrollLockCleanup);
    await changeLock();
    await advance(149);
    expect(document.body).toHaveAttribute("data-scroll-locked");
    await advance(1);
    expect(document.body).not.toHaveAttribute("data-scroll-locked");
    expect(document.body.style.pointerEvents).toBe("");
    expect(document.body.style.overflow).toBe("");
    expect(hidden).not.toHaveAttribute("aria-hidden");
  });

  it.each(["dialog", "alertdialog"])("preserves the lock while an open %s still needs it", async role => {
    const dialog = document.createElement("section");
    dialog.setAttribute("role", role);
    dialog.setAttribute("data-state", "open");
    document.body.append(dialog);
    document.body.style.pointerEvents = "none";
    document.body.style.overflow = "hidden";
    renderHook(useRadixScrollLockCleanup);
    await changeLock();
    await advance(150);
    expect(document.body).toHaveAttribute("data-scroll-locked", "1");
    expect(document.body.style.pointerEvents).toBe("none");
    expect(document.body.style.overflow).toBe("hidden");
  });

  it("cancels every queued cleanup when the layout unmounts", async () => {
    const { unmount } = renderHook(useRadixScrollLockCleanup);
    await changeLock("1");
    await changeLock("2");
    await changeLock("3");
    expect(vi.getTimerCount()).toBe(3);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
    await advance(500);
    expect(document.body).toHaveAttribute("data-scroll-locked", "3");
  });

  it("does not let a previous mount clean a later layout's lock", async () => {
    const previous = renderHook(useRadixScrollLockCleanup);
    await changeLock();
    previous.unmount();
    renderHook(useRadixScrollLockCleanup);
    await advance(150);
    expect(document.body).toHaveAttribute("data-scroll-locked", "1");
    await changeLock("2");
    await advance(150);
    expect(document.body).not.toHaveAttribute("data-scroll-locked");
  });

  it("stops observing body changes when the layout unmounts", async () => {
    const { unmount } = renderHook(useRadixScrollLockCleanup);
    unmount();
    await changeLock();
    expect(vi.getTimerCount()).toBe(0);
    await advance(150);
    expect(document.body).toHaveAttribute("data-scroll-locked", "1");
  });
});
