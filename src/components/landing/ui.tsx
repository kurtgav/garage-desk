import Link from "next/link";
import { cva, type VariantProps } from "class-variance-authority";
import { ChevronsRight, Wrench } from "lucide-react";
import { cn } from "@/lib/utils";

/** Buttons of the public pages (reference: 45px, 10px radius, 16px medium). Also for links. */
const lpButtonBase = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 rounded-[10px] font-lp-text font-medium whitespace-nowrap select-none transition-[background-color,color,scale] duration-200 ease-lp active:scale-[0.97] [&_svg]:size-5 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        primary: "bg-lp-blue text-white hover:bg-lp-blue-hover active:bg-lp-blue-pressed",
        cream: "bg-lp-cream text-lp-ink hover:bg-[#e6e8d6]",
        white: "bg-white text-lp-ink hover:bg-lp-paper",
      },
      size: {
        md: "h-[45px] px-4 text-base",
        lg: "h-12 px-5 text-base",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

/** twMerge on top of cva, so a className passed in (e.g. h-11) replaces the variant value instead of fighting it. */
export const lpButton = ({ className, ...variants }: VariantProps<typeof lpButtonBase> & { className?: string } = {}) =>
  cn(lpButtonBase(variants), className);

/** Sign-in pages: the staff control (3:1 border) at 48px, with the same radius as the submit button. */
export const lpControl = "h-12 rounded-[10px] px-4 text-[17px]";

/** Sign-in pages: the full-width submit. */
export const lpSubmit = lpButton({ size: "md", className: "mt-2 h-12 w-full active:scale-[0.98]" });

const CTA_TONES = {
  blue: { button: "bg-lp-blue text-white hover:bg-lp-blue-hover", chip: "bg-lp-cyan text-lp-ink" },
  ink: { button: "bg-lp-ink text-white hover:bg-black", chip: "bg-white text-lp-ink" },
  white: { button: "bg-white text-lp-ink hover:bg-lp-paper", chip: "bg-lp-cream text-lp-ink" },
};

/**
 * The reference's main button: the label, then a chip with a double chevron that nudges right on hover.
 * The chip is decoration, so the link's accessible name stays exactly `label`.
 */
export function LpCta({
  href,
  label,
  tone = "blue",
  pill = false,
  className,
}: {
  href: string;
  label: string;
  tone?: keyof typeof CTA_TONES;
  pill?: boolean;
  className?: string;
}) {
  const t = CTA_TONES[tone];
  return (
    <Link
      href={href}
      className={cn(
        "group inline-flex h-[45px] shrink-0 items-center gap-3 p-0.5 pl-4 text-base font-medium whitespace-nowrap transition-[background-color,scale] duration-200 ease-lp select-none active:scale-[0.97]",
        pill ? "rounded-full" : "rounded-[10px]",
        t.button,
        className,
      )}
    >
      {label}
      <span aria-hidden className={cn("grid h-full w-14 place-items-center", pill ? "rounded-full" : "rounded-[8px]", t.chip)}>
        <ChevronsRight className="size-5 transition-transform duration-300 ease-lp group-hover:translate-x-1" strokeWidth={1.75} />
      </span>
    </Link>
  );
}

/** Square ink mark with a wrench + name. */
export function LandingWordmark({
  className,
  markClassName,
  textClassName,
}: {
  className?: string;
  markClassName?: string;
  textClassName?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 font-lp-display text-[22px] font-semibold tracking-[-0.04em] leading-none whitespace-nowrap text-lp-ink",
        className,
      )}
    >
      <span aria-hidden className={cn("grid size-7 place-items-center rounded-[8px] bg-lp-ink text-white", markClassName)}>
        <Wrench className="size-4" strokeWidth={2.25} />
      </span>
      <span className={textClassName}>Garage Desk</span>
    </span>
  );
}

/** Small monospace label above a heading, as in the reference ("PERSONAL AI MANAGER"). */
export function Eyebrow({ children, className }: { children: React.ReactNode; className?: string }) {
  return <p className={cn("font-lp-mono text-sm tracking-[0.14em] text-lp-blue uppercase sm:text-base", className)}>{children}</p>;
}

/** Type scale (reference: 76 / 54 / 32 / 24 at weight 600, -2.56px tracking on the big two). */
export const lpH1 = "font-lp-display text-[2.875rem] leading-none font-semibold tracking-[-0.045em] text-balance sm:text-6xl lg:text-[76px] lg:tracking-[-2.56px]";
export const lpH2 = "font-lp-display text-[2.375rem] leading-[1.08] font-semibold tracking-[-0.045em] text-balance sm:text-5xl lg:text-[54px] lg:tracking-[-2.56px]";
export const lpH3 = "font-lp-display text-2xl leading-[1.15] font-semibold tracking-[-0.03em] lg:text-[32px]";
export const lpH4 = "font-lp-display text-xl leading-[1.2] font-semibold tracking-[-0.02em] lg:text-2xl";

/** Shared page width: 1232 max (reference container), 16 / 24px gutters. */
export const lpContainer = "mx-auto w-full max-w-[1264px] px-4 sm:px-6";

/** Stagger for [data-reveal] items. */
export const delay = (ms: number) => ({ "--lp-delay": `${ms}ms` }) as React.CSSProperties;
