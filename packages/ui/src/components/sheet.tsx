"use client";

import * as React from "react";
import { Drawer } from "vaul";
import { cn } from "./utils";

/** Mobile bottom sheet built on vaul. */
function Sheet({ children, ...props }: React.ComponentProps<typeof Drawer.Root>) {
  return <Drawer.Root {...props}>{children}</Drawer.Root>;
}

const SheetTrigger = Drawer.Trigger;

const SheetContent = React.forwardRef<
  React.ComponentRef<typeof Drawer.Content>,
  React.ComponentPropsWithoutRef<typeof Drawer.Content>
>(({ className, children, ...props }, ref) => (
  <Drawer.Portal>
    <Drawer.Overlay className="fixed inset-0 z-50 bg-black/40" />
    <Drawer.Content
      ref={ref}
      className={cn(
        "fixed inset-x-0 bottom-0 z-50 mt-24 flex h-auto flex-col rounded-t-lg border bg-background",
        className,
      )}
      {...props}
    >
      <div className="mx-auto mt-2 h-1.5 w-12 rounded-full bg-muted" />
      {children}
    </Drawer.Content>
  </Drawer.Portal>
));
SheetContent.displayName = "SheetContent";

const SheetHeader = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("grid gap-1.5 p-4 text-center sm:text-left", className)} {...props} />
);

const SheetTitle = Drawer.Title;
const SheetDescription = Drawer.Description;

export { Sheet, SheetTrigger, SheetContent, SheetHeader, SheetTitle, SheetDescription };
