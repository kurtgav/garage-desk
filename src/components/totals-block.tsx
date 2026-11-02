import { Money } from "@/components/money";
import { bpsToPercentString } from "@/lib/money";
import { cn } from "@/lib/utils";

type TotalsBlockProps = {
  /** All three come from the database (job_totals or a quote version). Never summed here. */
  subtotalCents: number;
  vatCents: number;
  totalCents: number;
  vatBps: number;
  totalLabel?: string;
  className?: string;
};

/** Net, VAT and a large total, right-aligned on one edge. Test ids are relied on by QA. */
export function TotalsBlock({ subtotalCents, vatCents, totalCents, vatBps, totalLabel = "Total", className }: TotalsBlockProps) {
  return (
    <dl className={cn("grid gap-2 text-sm", className)}>
      <div className="flex items-baseline justify-between gap-4">
        <dt className="text-muted">Net (excl. VAT)</dt>
        <dd data-testid="subtotal-amount">
          <Money cents={subtotalCents} />
        </dd>
      </div>
      <div className="flex items-baseline justify-between gap-4">
        <dt className="text-muted">VAT {bpsToPercentString(vatBps)}%</dt>
        <dd data-testid="vat-amount">
          <Money cents={vatCents} />
        </dd>
      </div>
      <div className="mt-1 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-t border-rule pt-3">
        <dt className="font-medium text-ink">{totalLabel}</dt>
        <dd data-testid="total-amount">
          <Money cents={totalCents} size="lg" />
        </dd>
      </div>
    </dl>
  );
}
