import * as TogglePrimitive from "@radix-ui/react-toggle-group";
import type { ComponentProps } from "react";
import { cn } from "../../lib/utils";

export function ToggleGroup({
  className,
  ...props
}: ComponentProps<typeof TogglePrimitive.Root>) {
  return (
    <TogglePrimitive.Root
      className={cn("toggle-group", className)}
      {...props}
    />
  );
}

export function ToggleGroupItem({
  className,
  ...props
}: ComponentProps<typeof TogglePrimitive.Item>) {
  return (
    <TogglePrimitive.Item
      className={cn("toggle-group-item", className)}
      {...props}
    />
  );
}
