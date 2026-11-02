import { Wrench } from "lucide-react";
import { cn } from "@/lib/utils";

export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2 font-semibold tracking-tight whitespace-nowrap text-ink", className)}>
      <span aria-hidden className="grid size-6 place-items-center rounded-sm bg-ink text-on-accent">
        <Wrench className="size-3.5" strokeWidth={2.25} />
      </span>
      Garage Desk
    </span>
  );
}
