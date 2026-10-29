import { act, cleanup } from "@testing-library/react";
import { vi } from "vitest";

/** Use with fake timers after stopping query clients; the caller restores time.
 * Execute callbacks instead of discarding them so late errors fail the test.
 */
export async function cleanupWithTimers() {
  cleanup();
  for (let pass = 0; vi.getTimerCount() > 0 && pass < 10; pass++) {
    await act(async () => { await vi.runOnlyPendingTimersAsync(); });
  }
  if (vi.getTimerCount() !== 0) throw new Error("Quedaron temporizadores pendientes después del desmontaje");
}
