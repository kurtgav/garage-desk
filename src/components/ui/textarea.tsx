import { cn } from "@/lib/utils";
import { controlClass } from "./input";

export function Textarea({ className, rows = 3, ...props }: React.ComponentProps<"textarea">) {
  return <textarea rows={rows} className={cn(controlClass, "min-h-24 px-3 py-2.5 leading-normal", className)} {...props} />;
}
