import * as React from 'react';
import {
  Select as BaseSelect, SelectContent as BaseContent, SelectTrigger as BaseTrigger,
} from './select';
export { SelectGroup, SelectValue, SelectLabel, SelectItem, SelectSeparator, SelectScrollUpButton, SelectScrollDownButton } from './select';

type Navigation = {
  trigger: React.MutableRefObject<HTMLButtonElement | null>;
  tabTarget: React.MutableRefObject<HTMLElement | null>;
  close: () => void;
};
const NavigationContext = React.createContext<Navigation | null>(null);

/** Opt-in for data-entry screens; all other selects keep their existing behavior. */
export function Select({ open, defaultOpen, onOpenChange, ...props }: React.ComponentProps<typeof BaseSelect>) {
  const [internalOpen, setInternalOpen] = React.useState(defaultOpen ?? false);
  const trigger = React.useRef<HTMLButtonElement | null>(null);
  const tabTarget = React.useRef<HTMLElement | null>(null);
  const setOpen = (next: boolean) => {
    if (open === undefined) setInternalOpen(next);
    onOpenChange?.(next);
  };
  return <NavigationContext.Provider value={{ trigger, tabTarget, close: () => setOpen(false) }}>
    <BaseSelect {...props} open={open ?? internalOpen} onOpenChange={setOpen} />
  </NavigationContext.Provider>;
}

export const SelectTrigger = React.forwardRef<React.ElementRef<typeof BaseTrigger>, React.ComponentPropsWithoutRef<typeof BaseTrigger>>(
  (props, ref) => {
    const navigation = React.useContext(NavigationContext);
    const attach = React.useCallback((node: HTMLButtonElement | null) => {
      if (navigation) navigation.trigger.current = node;
      if (typeof ref === 'function') ref(node);
      else if (ref) ref.current = node;
    }, [navigation?.trigger, ref]);
    return <BaseTrigger {...props} ref={attach} />;
  },
);
SelectTrigger.displayName = 'KeyboardSelectTrigger';

function tabDestination(trigger: HTMLElement, content: HTMLElement, backwards: boolean) {
  const dialog = trigger.closest<HTMLElement>('[role="dialog"]');
  const scope = dialog || trigger.ownerDocument;
  const candidates = Array.from(scope.querySelectorAll<HTMLElement>('input,select,textarea,button,a[href],[tabindex]'))
    .filter(element => {
      if (element.tabIndex < 0 || element.matches(':disabled') || content.contains(element)
        || element.hasAttribute('data-radix-focus-guard')) return false;
      // Select temporarily aria-hides the rest of the dialog while open; those
      // fields must become reachable again on close. Native hidden/CSS still apply.
      for (let node: HTMLElement | null = element; node; node = node.parentElement) {
        const style = getComputedStyle(node);
        if (node.hidden || node.hasAttribute('inert') || style.display === 'none' || style.visibility === 'hidden') return false;
      }
      return true;
    })
    .sort((a, b) => (a.tabIndex > 0 ? a.tabIndex : Infinity) - (b.tabIndex > 0 ? b.tabIndex : Infinity));
  const index = candidates.indexOf(trigger);
  if (index < 0) return null;
  const next = index + (backwards ? -1 : 1);
  return candidates[next] || (dialog ? candidates[backwards ? candidates.length - 1 : 0] : null) || null;
}

export const SelectContent = React.forwardRef<React.ElementRef<typeof BaseContent>, React.ComponentPropsWithoutRef<typeof BaseContent>>(
  ({ onKeyDown, onCloseAutoFocus, ...props }, ref) => {
    const navigation = React.useContext(NavigationContext);
    return <BaseContent {...props} ref={ref}
      onKeyDown={event => {
        onKeyDown?.(event);
        if (event.defaultPrevented || event.key !== 'Tab' || event.ctrlKey || event.altKey || event.metaKey || !navigation?.trigger.current) return;
        event.preventDefault();
        navigation.tabTarget.current = tabDestination(navigation.trigger.current, event.currentTarget, event.shiftKey);
        navigation.close();
      }}
      onCloseAutoFocus={event => {
        onCloseAutoFocus?.(event);
        const target = navigation?.tabTarget.current;
        if (navigation) navigation.tabTarget.current = null;
        if (event.defaultPrevented || !target) return;
        event.preventDefault();
        if (target.isConnected) target.focus();
      }} />;
  },
);
SelectContent.displayName = 'KeyboardSelectContent';
