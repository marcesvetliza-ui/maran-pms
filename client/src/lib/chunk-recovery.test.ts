import { afterEach, expect, it, vi } from "vitest";
import { reloadStaleChunkOnce } from "./chunk-recovery";
vi.mock("@/buildTime", () => ({ BUILD_TIME: "synthetic-current-build" }));
afterEach(() => {
  sessionStorage.clear();
  vi.restoreAllMocks();
});
it("allows one reload for a stale build and prevents subsequent reloads in the same tab", () => {
  const reload = vi.fn();
  expect(reloadStaleChunkOnce(reload)).toBe(true);
  expect(reloadStaleChunkOnce(reload)).toBe(false);
  expect(reloadStaleChunkOnce(reload)).toBe(false);
  expect(reload).toHaveBeenCalledTimes(1);
});
it("allows a fresh recovery after the tab loads a different build", () => {
  sessionStorage.setItem("maran-chunk-reload-build", "synthetic-old-build");
  const reload = vi.fn();
  expect(reloadStaleChunkOnce(reload)).toBe(true);
  expect(reloadStaleChunkOnce(reload)).toBe(false);
  expect(reload).toHaveBeenCalledTimes(1);
});
it("does not risk a reload loop if session storage is unavailable", () => {
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw new Error("Storage unavailable");
  });
  const reload = vi.fn();
  expect(reloadStaleChunkOnce(reload)).toBe(false);
  expect(reload).not.toHaveBeenCalled();
});
