import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { controlClass } from "./input";

/** Native <select> (best on tablets and phones), styled to match Input. */
export function Select({ className, children, ...props }: React.ComponentProps<"select">) {
  return (
    <div className="relative">
      <select className={cn(controlClass, "h-11 appearance-none pr-10 pl-3", className)} {...props}>
        {children}
      </select>
      <ChevronDown
        aria-hidden
        className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-muted"
      />
    </div>
  );
}
