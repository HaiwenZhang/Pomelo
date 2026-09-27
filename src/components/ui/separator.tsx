import { cn } from "../../lib/utils";

export function Separator({ className }: { className?: string }) {
  return <span aria-hidden="true" className={cn("separator", className)} />;
}
