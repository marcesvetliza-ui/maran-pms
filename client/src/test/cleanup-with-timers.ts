import { act, cleanup } from "@testing-library/react";
import { vi } from "vitest";

/**
 * For suites that opt into fake timers: unmount first, then execute remaining
 * callbacks while jsdom still exists. Radix Toast's close timer can outlive its
 * root. Do not clear/discard it or suppress its errors.
 * Callers must also dispose resources they own (e.g. QueryClient).
 */
export async function cleanupWithTimers() {
  cleanup();
  try {
    await act(async () => {
      await vi.runAllTimersAsync();
    });
  } finally {
    vi.useRealTimers();
  }
}
