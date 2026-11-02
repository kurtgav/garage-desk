import { cn } from "@/lib/utils";

/** "Maria Ivanova" → "MI". */
export function initials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

type AvatarProps = {
  name: string;
  /** Short-lived signed URL (private bucket) or a local preview; initials when absent. */
  src?: string | null;
  className?: string;
};

/** Staff photo or initials. Decorative: the name is always shown next to it. Size it with `className` (default 36px). */
export function Avatar({ name, src, className }: AvatarProps) {
  return (
    <span
      aria-hidden
      className={cn(
        "grid size-9 shrink-0 place-items-center overflow-hidden rounded-full bg-raised text-[13px] font-medium text-muted",
        className,
      )}
    >
      {src ? (
        // A plain img: signed URLs expire within minutes, so next/image caching and optimisation would not help.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" className="size-full object-cover" />
      ) : (
        initials(name)
      )}
    </span>
  );
}
