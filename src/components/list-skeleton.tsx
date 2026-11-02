import { cn } from "@/lib/utils";

/** One grey placeholder bar. Pulses only when the user allows motion. */
function Bar({ className }: { className?: string }) {
  return <span className={cn("block rounded-md bg-raised motion-safe:animate-pulse", className)} />;
}

const ROWS = 6;

/**
 * Loading state of a list page (D-095): the PageHeader, a toolbar (status tabs or search) and the list, in the
 * same boxes the page renders, so nothing jumps when it arrives. A table from md up, cards on phones.
 */
export function ListSkeleton({ label }: { label: string }) {
  return (
    <div role="status">
      <span className="sr-only">{label}</span>
      <div aria-hidden>
        <div className="mb-6 flex items-start justify-between gap-6 sm:mb-8">
          <div className="grid gap-3 pt-1">
            <Bar className="h-7 w-32 sm:h-8" />
            <Bar className="h-4 w-56 max-w-[60vw]" />
          </div>
          <Bar className="h-11 w-28 shrink-0" />
        </div>
        <Bar className="mb-6 h-11 w-full max-w-2xl rounded-[14px]" />

        <div className="hidden rounded-2xl border border-line bg-surface p-3 md:block">
          <Bar className="h-10 w-full rounded-lg" />
          {Array.from({ length: ROWS }, (_, i) => (
            <div key={i} className="flex h-14 items-center gap-6 border-b border-rule px-4 last:border-b-0">
              <Bar className="h-4 w-20" />
              <Bar className="h-4 w-28" />
              <Bar className="h-4 flex-1" />
              <Bar className="h-4 w-16" />
            </div>
          ))}
        </div>

        <div className="grid gap-3 md:hidden">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="grid gap-3 rounded-xl border border-line bg-surface p-4">
              <div className="flex justify-between gap-3">
                <Bar className="h-4 w-20" />
                <Bar className="h-5 w-16 rounded-full" />
              </div>
              <Bar className="h-4 w-3/4" />
              <Bar className="h-3.5 w-1/2" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
