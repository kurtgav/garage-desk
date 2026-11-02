import { cn } from "@/lib/utils";

/** Shared look for input, textarea and select. 16px text so iOS does not zoom on focus. */
export const controlClass =
  "w-full min-w-0 rounded-md border border-control bg-surface text-base text-ink placeholder:text-faint transition-[border-color] duration-150 disabled:cursor-not-allowed disabled:bg-raised disabled:text-muted aria-invalid:border-danger";

export function Input({ className, ...props }: React.ComponentProps<"input">) {
  return <input className={cn(controlClass, "h-11 px-3", className)} {...props} />;
}
