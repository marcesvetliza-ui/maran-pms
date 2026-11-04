import * as React from "react";

/** Only a plain TAB belongs to a form. Browser/OS shortcuts are never handled. */
export function isFormTab(event: Pick<KeyboardEvent, "key" | "ctrlKey" | "altKey" | "metaKey">) {
  return event.key === "Tab" && !event.ctrlKey && !event.altKey && !event.metaKey;
}

export function isTabStop(element: HTMLElement): boolean {
  if (element.tabIndex < 0 || element.matches(':disabled, [aria-disabled="true"], input[type="hidden"]') ||
      element.hasAttribute("data-radix-focus-guard")) return false;
  for (let node: HTMLElement | null = element; node; node = node.parentElement) {
    const style = getComputedStyle(node);
    // Do not test aria-hidden: Radix temporarily aria-hides the form behind a
    // Select. Those fields become available again as soon as the list closes.
    if (node.hidden || node.hasAttribute("inert") || style.display === "none" ||
        style.visibility === "hidden" || style.visibility === "collapse") return false;
    if (node.tagName === "DETAILS" && !node.hasAttribute("open") &&
        !node.querySelector("summary")?.contains(element)) return false;
  }
  if (element instanceof HTMLInputElement && element.type === "radio" && element.name) {
    const peers = Array.from(element.ownerDocument.querySelectorAll<HTMLInputElement>('input[type="radio"]'))
      .filter(peer => peer.name === element.name && peer.form === element.form && !peer.disabled);
    if (peers.some(peer => peer.checked) && !element.checked) return false;
  }
  return true;
}

export function popupTabDestination(trigger: HTMLElement, content: HTMLElement | null, backwards: boolean) {
  const dialog = trigger.closest<HTMLElement>('[role="dialog"], [role="alertdialog"]');
  const candidates = Array.from((dialog || trigger.ownerDocument).querySelectorAll<HTMLElement>(
    'input,select,textarea,button,a[href],summary,[tabindex],[contenteditable="true"]',
  )).filter(element => (element === trigger || !content?.contains(element)) && isTabStop(element))
    // Respect an existing positive tabindex, but never add one.
    .sort((a, b) => (a.tabIndex > 0 ? a.tabIndex : Infinity) - (b.tabIndex > 0 ? b.tabIndex : Infinity));
  const index = candidates.indexOf(trigger);
  if (index < 0) return null;
  return candidates[index + (backwards ? -1 : 1)] ||
    (dialog ? candidates[backwards ? candidates.length - 1 : 0] : null) || null;
}

export function focusFormControl(target: HTMLElement) {
  target.focus({ preventScroll: true });
  // Scroll only when needed, and let each scrollable ancestor move the minimum
  // distance. No smooth animation or jump to the beginning of the page.
  target.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "instant" });
}

export function usePopupTabNavigation(close: () => void) {
  const trigger = React.useRef<HTMLElement | null>(null);
  const pending = React.useRef<{ backwards: boolean; content: HTMLElement } | null>(null);
  return {
    trigger,
    onKeyDown(event: React.KeyboardEvent<HTMLElement>) {
      if (event.defaultPrevented || !isFormTab(event) || !trigger.current) return;
      event.preventDefault();
      pending.current = { backwards: event.shiftKey, content: event.currentTarget };
      close();
    },
    onCloseAutoFocus(event: Event) {
      const direction = pending.current;
      pending.current = null;
      if (!direction || event.defaultPrevented || !trigger.current?.isConnected) return;
      event.preventDefault();
      // Resolve after closing, so conditional/disappearing fields cannot leave a
      // stale target. The modal focus trap remains owned by Radix.
      const target = popupTabDestination(trigger.current, direction.content, direction.backwards);
      focusFormControl(target || trigger.current);
    },
  };
}

export type PopupTabNavigation = ReturnType<typeof usePopupTabNavigation>;
