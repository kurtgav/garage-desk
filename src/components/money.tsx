import { formatCents } from "@/lib/money";
import { cn } from "@/lib/utils";

type MoneyProps = {
  /** Integer cents from the database. Never computed in the UI. Missing → grey dash. */
  cents: number | bigint | null | undefined;
  /** `lg` for totals. */
  size?: "md" | "lg";
  className?: string;
};

export function Money({ cents, size = "md", className }: MoneyProps) {
  return (
    <span
      className={cn(
        "whitespace-nowrap tabular-nums",
        size === "lg" && "text-3xl font-semibold tracking-tight",
        cents == null && "text-faint",
        className,
      )}
    >
      {formatCents(cents)}
    </span>
  );
}
