import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import { landingFonts } from "./fonts";
import { LandingWordmark } from "./ui";

type Props = {
  title: string;
  intro: React.ReactNode;
  children: React.ReactNode;
  /** The "Back to Garage Desk home" link under the card; off when the page has its own way home (404). */
  backLink?: boolean;
};

/**
 * Sign-in, forgot and reset password. From 481px: a white card on light grey with faint pegboard dots around it.
 * Up to 480px the card chrome drops away and the page is just the form on white.
 */
export function AuthShell({ title, intro, children, backLink = true }: Props) {
  return (
    <div
      className={cn(
        "lp lp-auth relative isolate flex flex-1 flex-col items-center bg-white px-6 pt-8 pb-10 min-[481px]:bg-lp-n20 min-[481px]:px-4 min-[481px]:pt-[clamp(3rem,14vh,9rem)] min-[481px]:pb-16",
        landingFonts,
      )}
    >
      <div aria-hidden className="lp-auth-dots pointer-events-none absolute inset-0 -z-10 hidden min-[481px]:block" />
      <main className="w-full max-w-[28rem] animate-lp-auth-in min-[481px]:rounded-[24px] min-[481px]:bg-white min-[481px]:p-10 min-[481px]:shadow-lp-card">
        <Link href="/" aria-label="Garage Desk, home" className="inline-flex rounded-full">
          <LandingWordmark className="gap-2 text-xl sm:text-xl" markClassName="size-8 ring-0 sm:size-8 [&_svg]:size-4" />
        </Link>
        <h1 className="mt-8 font-lp-display text-[2rem] leading-[1.15] tracking-[-0.02em] text-balance text-lp-ink">{title}</h1>
        <div className="mt-2 text-base leading-normal text-pretty text-lp-body">{intro}</div>
        <div className="mt-8">{children}</div>
      </main>
      {backLink && (
        <footer className="mt-6 flex w-full max-w-[28rem] animate-lp-auth-in min-[481px]:justify-center">
          <Link
            href="/"
            className="group -ml-3 inline-flex min-h-11 items-center gap-2 rounded-full px-3 text-[15px] text-lp-body transition-[color] duration-200 hover:text-lp-ink min-[481px]:ml-0"
          >
            <ArrowLeft
              aria-hidden
              className="size-4 transition-transform duration-200 ease-lp group-hover:-translate-x-0.5"
              strokeWidth={1.75}
            />
            Back to Garage Desk home
          </Link>
        </footer>
      )}
    </div>
  );
}
