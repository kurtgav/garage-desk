import { cn } from "@/lib/utils";

type TableProps = React.ComponentProps<"table"> & {
  /**
   * Names the scroll region and makes it keyboard-scrollable. Pass it when the table can
   * overflow on a phone and its rows contain no links or buttons to tab into.
   */
  label?: string;
};

/** Scrolls sideways inside its own frame on narrow screens; the page never does. Figures are tabular. */
export function Table({ className, label, ...props }: TableProps) {
  const region = label ? { role: "region", "aria-label": label, tabIndex: 0 } : {};
  return (
    <div className="w-full overflow-x-auto" {...region}>
      <table className={cn("w-full caption-bottom border-collapse text-sm tabular-nums", className)} {...props} />
    </div>
  );
}

export function TableHeader({ className, ...props }: React.ComponentProps<"thead">) {
  return <thead className={cn("[&_tr]:border-line", className)} {...props} />;
}

export function TableBody({ className, ...props }: React.ComponentProps<"tbody">) {
  return <tbody className={cn("[&_tr:last-child]:border-0", className)} {...props} />;
}

export function TableFooter({ className, ...props }: React.ComponentProps<"tfoot">) {
  return <tfoot className={cn("border-t border-line font-medium [&_tr]:border-0", className)} {...props} />;
}

export function TableRow({ className, ...props }: React.ComponentProps<"tr">) {
  return <tr className={cn("border-b border-rule", className)} {...props} />;
}

/** Sentence-case grey header. Add `text-right` on numeric columns (and on their cells). */
export function TableHead({ className, ...props }: React.ComponentProps<"th">) {
  return (
    <th
      className={cn("h-10 px-4 text-left align-middle text-xs font-medium whitespace-nowrap text-muted", className)}
      {...props}
    />
  );
}

export function TableCell({ className, ...props }: React.ComponentProps<"td">) {
  return <td className={cn("px-4 py-3 align-middle", className)} {...props} />;
}

export function TableCaption({ className, ...props }: React.ComponentProps<"caption">) {
  return <caption className={cn("mt-3 text-left text-sm text-muted", className)} {...props} />;
}
