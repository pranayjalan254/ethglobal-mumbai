import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap border text-[12px] font-medium uppercase tracking-[0.08em] transition-colors duration-150 disabled:pointer-events-none disabled:opacity-40 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:stroke-[1.25]",
  {
    variants: {
      variant: {
        default: "border-ink bg-ink text-background hover:bg-transparent hover:text-ink",
        outline: "border-ink bg-transparent text-ink hover:bg-ink hover:text-background",
        inverse: "border-background bg-background text-ink hover:bg-transparent hover:text-background",
        ghost: "border-transparent bg-transparent text-ink hover:border-hairline hover:bg-surface",
        destructive: "border-danger bg-transparent text-danger hover:bg-danger hover:text-background",
        secondary: "border-hairline bg-surface-raised text-ink hover:border-ink",
        link: "border-transparent px-0 normal-case tracking-normal text-[14px] text-accent link-u",
      },
      size: {
        default: "h-10 px-5",
        sm: "h-8 px-3 text-[11px]",
        lg: "h-12 px-7",
        icon: "h-9 w-9",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />;
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
