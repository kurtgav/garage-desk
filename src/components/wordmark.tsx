import { Wrench } from "lucide-react";
import { cn } from "@/lib/utils";

export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2 font-semibold tracking-tight whitespace-nowrap text-ink", className)}>
      <span aria-hidden className="grid size-7 place-items-center rounded-md bg-accent text-on-accent">
        <Wrench className="size-4" strokeWidth={2} />
      </span>
      Garage Desk
    </span>
  );
}
