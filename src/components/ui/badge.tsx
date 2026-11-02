import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

export const badgeVariants = cva(
  "inline-flex flex-none items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[13px] leading-5 font-medium whitespace-nowrap",
  {
    variants: {
      tone: {
        neutral: "bg-status-new-bg text-status-new",
        accent: "bg-raised text-ink",
        info: "bg-info-soft text-info",
        success: "bg-success-soft text-success",
        warning: "bg-warning-soft text-warning",
        danger: "bg-danger-soft text-danger",
        // Job statuses (keys match JobStatus). Use <StatusBadge>, which adds the label.
        new: "bg-status-new-bg text-status-new",
        quoted: "bg-status-quoted-bg text-status-quoted",
        declined: "bg-status-declined-bg text-status-declined",
        approved: "bg-status-approved-bg text-status-approved",
        in_progress: "bg-status-in-progress-bg text-status-in-progress",
        ready: "bg-status-ready-bg text-status-ready",
        collected: "border border-edge bg-surface text-status-collected",
        cancelled: "border border-edge bg-surface text-status-cancelled",
      },
    },
    defaultVariants: { tone: "neutral" },
  },
);

type BadgeProps = React.ComponentProps<"span"> & VariantProps<typeof badgeVariants>;

export function Badge({ className, tone, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />;
}
