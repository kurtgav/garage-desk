import { cn } from "@/lib/utils";

type TableProps = React.ComponentProps<"table"> & {
  /**
   * Names the scroll region and makes it keyboard-scrollable. Pass it when the table can
   * overflow on a phone and its rows contain no links or buttons to tab into.
   */
  label?: string;
};

/**
 * Scrolls sideways inside its own frame on narrow screens; the page never does. Figures are tabular.
 * Header is a rounded grey band (docs/DESIGN.md); body rows are 56px with a quiet rule between them.
 */
export function Table({ className, label, ...props }: TableProps) {
  const region = label ? { role: "region", "aria-label": label, tabIndex: 0 } : {};
  return (
    // `relative` keeps sr-only (absolute) captions and labels inside the scroll frame, or they widen the page.
    <div className="relative w-full overflow-x-auto" {...region}>
      <table
        className={cn("w-full caption-bottom border-separate border-spacing-0 text-[15px] tabular-nums", className)}
        {...props}
      />
    </div>
  );
}

export function TableHeader({ className, ...props }: React.ComponentProps<"thead">) {
  return (
    <thead
      className={cn(
        "[&_th]:bg-raised [&_th:first-child]:rounded-l-md [&_th:last-child]:rounded-r-md",
        className,
      )}
      {...props}
    />
  );
}

export function TableBody({ className, ...props }: React.ComponentProps<"tbody">) {
  return <tbody className={cn("[&_tr:last-child>td]:border-0", className)} {...props} />;
}

export function TableFooter({ className, ...props }: React.ComponentProps<"tfoot">) {
  return <tfoot className={cn("font-medium [&_td]:border-t [&_td]:border-line", className)} {...props} />;
}

export function TableRow({ className, ...props }: React.ComponentProps<"tr">) {
  return <tr className={cn("transition-colors duration-150 [tbody>&]:hover:bg-ground", className)} {...props} />;
}

/** Sentence-case grey header. Add `text-right` on numeric columns (and on their cells). */
export function TableHead({ className, ...props }: React.ComponentProps<"th">) {
  return (
    <th
      className={cn("h-10 px-4 text-left align-middle text-sm font-normal whitespace-nowrap text-faint", className)}
      {...props}
    />
  );
}

export function TableCell({ className, ...props }: React.ComponentProps<"td">) {
  return <td className={cn("h-14 border-b border-rule px-4 py-2 align-middle text-ink", className)} {...props} />;
}

export function TableCaption({ className, ...props }: React.ComponentProps<"caption">) {
  return <caption className={cn("mt-3 text-left text-sm text-faint", className)} {...props} />;
}
