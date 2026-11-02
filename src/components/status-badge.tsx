import { Badge } from "@/components/ui/badge";
import { STATUS_LABEL, type JobStatus } from "@/lib/status";

/** Job status as colour + dot + text label (never colour alone). */
export function StatusBadge({ status, className }: { status: JobStatus; className?: string }) {
  return (
    <Badge tone={status} className={className}>
      <span aria-hidden className="size-1.5 rounded-full bg-current" />
      {STATUS_LABEL[status]}
    </Badge>
  );
}
