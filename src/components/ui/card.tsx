import { cn } from "@/lib/utils";

export function Card({ className, ...props }: React.ComponentProps<"div">) {
  // min-w-0: as a grid/flex item it may shrink, so a Table inside scrolls in its own frame.
  return <div className={cn("min-w-0 rounded-lg border border-line bg-surface", className)} {...props} />;
}

/** Title on the left, optional actions on the right (wraps on narrow screens). */
export function CardHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn("flex flex-wrap items-start justify-between gap-x-4 gap-y-1 px-5 pt-5", className)}
      {...props}
    />
  );
}

export function CardTitle({ className, ...props }: React.ComponentProps<"h2">) {
  return <h2 className={cn("text-base font-semibold text-ink", className)} {...props} />;
}

export function CardDescription({ className, ...props }: React.ComponentProps<"p">) {
  return <p className={cn("text-sm text-muted", className)} {...props} />;
}

export function CardContent({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("p-5", className)} {...props} />;
}

export function CardFooter({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("flex flex-wrap items-center gap-3 border-t border-rule px-5 py-4", className)} {...props} />;
}
