import { cva, type VariantProps } from "class-variance-authority";
import { Wrench } from "lucide-react";
import { cn } from "@/lib/utils";

/** Pill buttons of the public pages (reference: 100px radius, 16/32 padding, 18px Figtree). Also for links. */
const lpButtonBase = cva(
  "inline-flex shrink-0 items-center justify-center gap-3 rounded-full font-lp-text font-semibold whitespace-nowrap select-none transition-[background-color,color,border-color,scale] duration-300 ease-lp active:scale-[0.96] [&_svg]:size-5 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        primary: "bg-lp-blue text-white hover:bg-lp-blue-hover active:bg-lp-blue-pressed",
        white: "bg-white text-lp-blue hover:bg-lp-n30",
        outline: "border border-lp-border bg-white/5 text-white hover:border-white hover:bg-lp-blue-hover",
      },
      size: {
        md: "h-[52px] px-7 text-[17px]",
        lg: "h-[59px] px-8 text-lg",
      },
    },
    defaultVariants: { variant: "primary", size: "lg" },
  },
);

/** twMerge on top of cva, so a className passed in (e.g. h-11) replaces the variant value instead of fighting it. */
export const lpButton = ({ className, ...variants }: VariantProps<typeof lpButtonBase> & { className?: string } = {}) =>
  cn(lpButtonBase(variants), className);

/** Sign-in pages: the staff control (3:1 border) at 48px, with the same 12px radius as the submit button. */
export const lpControl = "h-12 rounded-lg px-4 text-[17px]";

/** Sign-in pages: the full-width submit, rectangle family like the fields (not the landing pill). */
export const lpSubmit = lpButton({ size: "md", className: "mt-2 h-12 w-full rounded-lg active:scale-[0.98]" });

/** Blue round mark + name, in the display face. */
export function LandingWordmark({
  className,
  markClassName,
  textClassName,
  onDark = false,
}: {
  className?: string;
  markClassName?: string;
  textClassName?: string;
  onDark?: boolean;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2.5 font-lp-display text-2xl leading-none whitespace-nowrap sm:text-[1.75rem]",
        onDark ? "text-white" : "text-lp-ink",
        className,
      )}
    >
      <span
        aria-hidden
        className={cn("grid size-9 place-items-center rounded-full bg-lp-blue text-white ring-4 ring-lp-surface sm:size-10", markClassName)}
      >
        <Wrench className="size-[18px]" strokeWidth={2.25} />
      </span>
      <span className={textClassName}>Garage Desk</span>
    </span>
  );
}

/** Section label with a trailing rule, as in the reference ("Featured ——"). */
export function SectionLabel({ children, onBlue = false, className }: { children: React.ReactNode; onBlue?: boolean; className?: string }) {
  return (
    <p className={cn("inline-flex items-center gap-2 text-base", onBlue ? "text-white" : "text-lp-blue", className)}>
      {children}
      <span aria-hidden className={cn("h-px w-8", onBlue ? "bg-white/80" : "bg-lp-blue")} />
    </p>
  );
}

/** Shared page width: 1280 max, 24 / 32 / 80px gutters (reference breakpoints 767 / 991). */
export const lpContainer = "mx-auto w-full max-w-[1440px] px-6 md:px-8 lg:px-20";

/** Stagger for [data-reveal] items (60–90ms steps, as in the reference). */
export const delay = (ms: number) => ({ "--lp-delay": `${ms}ms` }) as React.CSSProperties;
