import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";
const styles = cva("button", {
  variants: {
    variant: {
      default: "button-primary",
      outline: "button-outline",
      ghost: "button-ghost",
      surface: "button-surface",
    },
    size: { default: "", icon: "button-icon", tool: "button-tool" },
  },
  defaultVariants: { variant: "default", size: "default" },
});
export function Button({
  asChild,
  variant,
  size,
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof styles> & { asChild?: boolean }) {
  const Component = asChild ? Slot : "button";
  return (
    <Component
      type="button"
      className={twMerge(clsx(styles({ variant, size }), className))}
      {...props}
    />
  );
}
