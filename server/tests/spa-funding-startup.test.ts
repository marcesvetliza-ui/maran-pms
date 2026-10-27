import { it, expect, vi } from "vitest";
import { scheduleSpaEnrollment } from "../billing/funding/operational/rollout";

it("does not wait for historical SPA enrollment before returning to startup", async () => {
  let release!: () => void;
  const pending = new Promise<void>(resolve => { release = resolve; });
  const run = vi.fn(() => pending), failed = vi.fn();
  expect(scheduleSpaEnrollment(run, failed)).toBeUndefined();
  expect(run).not.toHaveBeenCalled();
  await new Promise<void>(resolve => setImmediate(resolve));
  expect(run).toHaveBeenCalledOnce();
  expect(failed).not.toHaveBeenCalled();
  release();
});

it("handles a failed background scan without an unhandled startup rejection", async () => {
  const error = new Error("synthetic database failure"), failed = vi.fn();
  scheduleSpaEnrollment(async () => { throw error; }, failed);
  await new Promise<void>(resolve => setImmediate(resolve));
  expect(failed).toHaveBeenCalledExactlyOnceWith(error);
});
