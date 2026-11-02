import { cn } from "@/lib/utils";

type PageHeaderProps = {
  /** A noun: "Jobs", "GD-0042", the customer's name. Rendered as the page's one h1. */
  title: React.ReactNode;
  /** One grey line about the data (scope, period, count), not about the interface. */
  description?: React.ReactNode;
  /** Real actions only, e.g. the page's one primary button. */
  actions?: React.ReactNode;
  className?: string;
};

export function PageHeader({ title, description, actions, className }: PageHeaderProps) {
  return (
    <div className={cn("mb-6 flex flex-wrap items-start justify-between gap-x-6 gap-y-4 sm:mb-8", className)}>
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-tight text-ink sm:text-[30px] sm:leading-9">{title}</h1>
        {description && <p className="mt-1.5 text-[15px] text-faint sm:text-base">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
