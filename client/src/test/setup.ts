import "@testing-library/jest-dom";
import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

// Silence Radix UI / jsdom pointer-events warnings
Object.defineProperty(window, "PointerEvent", {
  writable: true,
  value: class PointerEvent extends Event {
    button: number;
    ctrlKey: boolean;
    pointerType: string;
    constructor(type: string, props: PointerEventInit = {}) {
      super(type, props);
      this.button = props.button ?? 0;
      this.ctrlKey = props.ctrlKey ?? false;
      this.pointerType = props.pointerType ?? "mouse";
    }
  },
});

// Radix needs hasPointerCapture / releasePointerCapture on elements
Object.defineProperty(HTMLElement.prototype, "hasPointerCapture", {
  writable: true,
  value: () => false,
});
Object.defineProperty(HTMLElement.prototype, "setPointerCapture", {
  writable: true,
  value: () => {},
});
Object.defineProperty(HTMLElement.prototype, "releasePointerCapture", {
  writable: true,
  value: () => {},
});

// Radix Dialog uses scrollIntoView
Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
  writable: true,
  value: () => {},
});

// Radix Select / Tooltip use ResizeObserver
if (typeof globalThis.ResizeObserver === "undefined") {
  globalThis.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}
