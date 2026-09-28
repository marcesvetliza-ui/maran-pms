import * as React from "react"
import * as PopoverPrimitive from "@radix-ui/react-popover"

import { cn } from "@/lib/utils"

const Popover = PopoverPrimitive.Root

const PopoverTrigger = PopoverPrimitive.Trigger

const PopoverContent = React.forwardRef<
  React.ElementRef<typeof PopoverPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof PopoverPrimitive.Content>
>(({ className, align = "center", sideOffset = 4, ...props }, ref) => {
  // A Popover portaled to document.body (Radix's default) sits outside an
  // ancestor Dialog's own DOM subtree even though it's logically nested
  // inside it — they end up as sibling portal roots under <body>. Radix
  // Dialog's focus trap then treats any focus landing in the Popover as
  // escaping the modal and silently reverts it, so typing into a search box
  // inside such a Popover does nothing (clicking still works because
  // cmdk/CommandItem selection doesn't require real DOM focus). Portaling
  // into the nearest open Dialog instead makes the Popover a real
  // descendant, so the trap recognizes it as part of the modal. When there
  // is no open Dialog this resolves to nothing and Portal falls back to its
  // default (document.body) — unchanged from before.
  const [portalContainer, setPortalContainer] = React.useState<HTMLElement | undefined>(undefined);

  React.useLayoutEffect(() => {
    const dialogs = document.querySelectorAll<HTMLElement>('[role="dialog"][data-state="open"]');
    setPortalContainer(dialogs.length > 0 ? dialogs[dialogs.length - 1] : undefined);
  }, []);

  return (
    <PopoverPrimitive.Portal container={portalContainer}>
      <PopoverPrimitive.Content
        ref={ref}
        align={align}
        sideOffset={sideOffset}
        className={cn(
          "z-50 w-72 rounded-md border bg-popover p-4 text-popover-foreground shadow-md outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 origin-[--radix-popover-content-transform-origin]",
          className
        )}
        {...props}
      />
    </PopoverPrimitive.Portal>
  );
})
PopoverContent.displayName = PopoverPrimitive.Content.displayName

export { Popover, PopoverTrigger, PopoverContent }
