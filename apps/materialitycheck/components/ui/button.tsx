import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap font-sans font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink focus-visible:ring-offset-2 focus-visible:ring-offset-paper disabled:opacity-50 disabled:pointer-events-none",
  {
    variants: {
      variant: {
        primary:
          "bg-ink text-paper hover:bg-clay border border-ink hover:border-clay",
        outline:
          "bg-transparent text-ink hover:bg-ink hover:text-paper border border-ink",
        ghost: "bg-transparent text-ink hover:bg-paperDeep border border-transparent",
        link: "text-clay underline-offset-4 hover:underline border-b border-clay rounded-none px-0",
      },
      size: {
        sm: "h-9 px-3 text-xs tracking-wide uppercase",
        md: "h-11 px-5 text-[0.78rem] tracking-[0.18em] uppercase",
        lg: "h-14 px-7 text-sm tracking-[0.18em] uppercase",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        ref={ref}
        className={cn(buttonVariants({ variant, size, className }))}
        {...props}
      />
    );
  },
);
Button.displayName = "Button";

export { buttonVariants };
