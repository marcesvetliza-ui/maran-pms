import { useEffect } from "react";

export function useRadixScrollLockCleanup() {
  useEffect(() => {
    const pendingCleanups = new Set<ReturnType<typeof setTimeout>>();
    const cleanup = () => {
      const hasOpenDialog = document.querySelector('[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"]');
      if (!hasOpenDialog) {
        document.body.removeAttribute("data-scroll-locked");
        document.body.style.removeProperty("pointer-events");
        document.body.style.removeProperty("overflow");
        const allAriaHidden = document.querySelectorAll('[aria-hidden="true"]');
        allAriaHidden.forEach(el => {
          if (el !== document.body && !el.closest('[role="dialog"]') && !el.closest('[role="alertdialog"]')) {
            el.removeAttribute("aria-hidden");
          }
        });
      }
    };
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === "attributes") {
          const target = mutation.target as HTMLElement;
          if (target === document.body && mutation.attributeName === "data-scroll-locked") {
            const timeout = setTimeout(() => {
              pendingCleanups.delete(timeout);
              cleanup();
            }, 150);
            pendingCleanups.add(timeout);
          }
        }
      }
    });
    observer.observe(document.body, { attributes: true, subtree: false });
    return () => {
      observer.disconnect();
      for (const timeout of pendingCleanups) clearTimeout(timeout);
      pendingCleanups.clear();
    };
  }, []);
}
