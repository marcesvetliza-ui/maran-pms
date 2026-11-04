import * as React from "react";
import { focusFormControl, isFormTab, popupTabDestination } from "@/lib/popup-tab-navigation";

/** Local keyboard behavior for legacy inline pickers, not a page-level TAB handler.
 * Mark actual choices with data-search-option; selection stays in their onClick.
 */
export function InlineSearch({ open, onOpenChange, children, ...props }: React.HTMLAttributes<HTMLDivElement> & {
  open: boolean; onOpenChange: (open: boolean) => void;
}) {
  const ref = React.useRef<HTMLDivElement>(null);
  return <div {...props} ref={ref}
    onClickCapture={event => {
      props.onClickCapture?.(event);
      if (!(event.target as HTMLElement).closest("[data-search-option]")) return;
      const root = event.currentTarget;
      const anchor = root.querySelector<HTMLElement>("input");
      const next = anchor && popupTabDestination(anchor, root, false);
      requestAnimationFrame(() => {
        if (root.isConnected && !root.contains(root.ownerDocument.activeElement) &&
            root.ownerDocument.activeElement === root.ownerDocument.body && next?.isConnected) focusFormControl(next);
      });
    }}
    onBlur={event => {
      props.onBlur?.(event);
      if (!event.currentTarget.contains(event.relatedTarget as Node | null)) onOpenChange(false);
    }}
    onKeyDown={event => {
      props.onKeyDown?.(event);
      if (!open || event.defaultPrevented || event.ctrlKey || event.altKey || event.metaKey) return;
      const root = event.currentTarget;
      const input = root.querySelector<HTMLElement>("input");
      const options = Array.from(root.querySelectorAll<HTMLElement>("[data-search-option]"));
      if (isFormTab(event) && input) {
        event.preventDefault();
        const target = popupTabDestination(input, root, event.shiftKey);
        onOpenChange(false);
        requestAnimationFrame(() => {
          if (target?.isConnected) focusFormControl(target);
          else ref.current?.querySelector<HTMLElement>("button,input")?.focus();
        });
      } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        const current = options.indexOf(root.ownerDocument.activeElement as HTMLElement);
        const next = event.key === "ArrowDown" ? (current + 1) % options.length
          : (current <= 0 ? options.length - 1 : current - 1);
        if (options[next]) focusFormControl(options[next]);
      } else if (event.key === "Enter" && event.target === input) {
        // An unhighlighted search is not a confirmed choice or a form submit.
        event.preventDefault();
      } else if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        onOpenChange(false);
        requestAnimationFrame(() => ref.current?.querySelector<HTMLElement>("button,input")?.focus());
      }
    }}>{children}</div>;
}
