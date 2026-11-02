import { Wrench } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { STATUS_LABEL, type JobStatus } from "@/lib/status";
import { cn } from "@/lib/utils";

/** Job status as colour + dot + text label (never colour alone). */
export function StatusBadge({ status, className }: { status: JobStatus; className?: string }) {
  return (
    <Badge tone={status} className={className}>
      <span aria-hidden className="size-1.5 rounded-full bg-current" />
      {STATUS_LABEL[status]}
    </Badge>
  );
}

const SQUARE: Record<JobStatus, string> = {
  new: "bg-status-new-bg text-status-new",
  quoted: "bg-status-quoted-bg text-status-quoted",
  declined: "bg-status-declined-bg text-status-declined",
  approved: "bg-status-approved-bg text-status-approved",
  in_progress: "bg-status-in-progress-bg text-status-in-progress",
  ready: "bg-status-ready-bg text-status-ready",
  collected: "bg-raised text-status-collected",
  cancelled: "bg-raised text-status-cancelled",
};

/** Small status-tinted job square for list rows (decorative: pair it with a StatusBadge or text). */
export function StatusSquare({ status, className }: { status: JobStatus; className?: string }) {
  return (
    <span aria-hidden className={cn("grid size-5 shrink-0 place-items-center rounded-sm", SQUARE[status], className)}>
      <Wrench className="size-3" strokeWidth={2} />
    </span>
  );
}
