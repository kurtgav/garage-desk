import { formatDateTime } from "@/lib/format";

export type TimelineItem = {
  key: string | number;
  title: string;
  /** ISO timestamp, shown in the garage timezone. */
  at: string;
  /** Who did it (staff name or "Customer"). Never passed on the public page. */
  by?: string;
  note?: string | null;
};

/** Oldest first, one dot per event on a connecting line; the latest dot is filled. */
export function Timeline({ items }: { items: TimelineItem[] }) {
  if (items.length === 0)
    return <p className="text-sm text-muted">Nothing has happened yet.</p>;

  return (
    <ol className="grid">
      {items.map((item, i) => {
        const last = i === items.length - 1;
        return (
          <li
            key={item.key}
            className="relative grid grid-cols-[0.75rem_1fr] gap-x-3 pb-5 last:pb-0"
          >
            {!last && (
              <span
                aria-hidden
                className="absolute top-4 bottom-0 left-[5.5px] w-px bg-edge"
              />
            )}
            <span
              aria-hidden
              className={`mt-1.5 size-3 rounded-full border-2 border-accent ${last ? "bg-accent" : "bg-surface"}`}
            />
            <div className="min-w-0">
              <p className="text-sm font-medium text-ink">{item.title}</p>
              <p className="text-sm text-faint">
                <time dateTime={item.at}>{formatDateTime(item.at)}</time>
                {item.by && <> · {item.by}</>}
              </p>
              {item.note && (
                <p className="mt-2 rounded-md bg-raised px-3 py-2 text-sm text-ink">
                  {item.note}
                </p>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
