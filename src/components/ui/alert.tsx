import { cva } from "class-variance-authority";
import { CircleAlert, CircleCheck, Info, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/utils";

const alertVariants = cva("flex gap-3 rounded-lg border px-4 py-3 text-sm text-ink", {
  variants: {
    tone: {
      info: "border-accent/20 bg-accent-soft [&>svg]:text-accent",
      success: "border-success/20 bg-success-soft [&>svg]:text-success",
      warning: "border-warning/25 bg-warning-soft [&>svg]:text-warning",
      danger: "border-danger/20 bg-danger-soft [&>svg]:text-danger",
    },
  },
});

const ICONS = { info: Info, success: CircleCheck, warning: TriangleAlert, danger: CircleAlert };

type AlertProps = Omit<React.ComponentProps<"div">, "title"> & {
  tone?: keyof typeof ICONS;
  title?: React.ReactNode;
};

/**
 * Action results. `danger` is role="alert" (assertive); the rest are role="status" (polite).
 * Render it when the result arrives (and unmount it while a retry is pending) so it is announced each time.
 */
export function Alert({ tone = "info", title, children, className, ...props }: AlertProps) {
  const Icon = ICONS[tone];
  return (
    <div role={tone === "danger" ? "alert" : "status"} className={cn(alertVariants({ tone }), className)} {...props}>
      <Icon aria-hidden className="mt-0.5 size-4 shrink-0" />
      <div className="grid gap-0.5">
        {title && <p className="font-medium">{title}</p>}
        {children && <div>{children}</div>}
      </div>
    </div>
  );
}
