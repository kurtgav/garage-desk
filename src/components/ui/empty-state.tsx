import { cn } from "@/lib/utils";

type EmptyStateProps = {
  title: string;
  description?: React.ReactNode;
  /** Usually the first action, e.g. a "New job" link styled with buttonVariants. */
  action?: React.ReactNode;
  className?: string;
};

/** Keeps the block's frame and says, in one line, why it is empty and what to do next. */
export function EmptyState({ title, description, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center gap-1 rounded-xl border border-dashed border-edge bg-surface px-6 py-10 text-center",
        className,
      )}
    >
      <p className="font-medium text-ink">{title}</p>
      {description && <p className="max-w-sm text-sm text-faint">{description}</p>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}
