import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { landingFonts } from "./fonts";
import { Eyebrow, LandingWordmark } from "./ui";

type Props = {
  title: string;
  intro: React.ReactNode;
  children: React.ReactNode;
  /** Label above the title; the 404 is also seen by customers, so it says "Error 404" instead. */
  eyebrow?: string;
  /** The "Back to Garage Desk home" link in the header; off when the page has its own way home (404). */
  backLink?: boolean;
};

/**
 * Sign-in, two-step code, forgot / reset / set password and the 404, in the landing's language (D-112).
 * The form sits on white; from 1024px a dithered Vitosha panel with the mascot and one approved quote fills the right.
 * Static on purpose: the 404 must stay byte-identical for every unknown address (D-032, D-095).
 */
export function AuthShell({ title, intro, children, eyebrow = "Garage Desk staff", backLink = true }: Props) {
  return (
    <div className={cn("lp lp-auth flex flex-1 bg-white", landingFonts)}>
      <div className="grid w-full flex-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <div className="flex min-h-svh flex-col px-5 py-5 sm:px-10 sm:py-8 lg:px-14 xl:px-20">
          <header className="flex items-center justify-between gap-4">
            <Link href="/" aria-label="Garage Desk, home" className="rounded-[10px]">
              <LandingWordmark markClassName="size-10" />
            </Link>
            {backLink && (
              <Link
                href="/"
                className="group inline-flex min-h-11 items-center gap-2 rounded-[10px] bg-lp-cream px-3.5 text-[15px] transition-colors duration-200 hover:bg-[#e6e8d6]"
              >
                <ArrowLeft aria-hidden className="size-4 transition-transform duration-200 ease-lp group-hover:-translate-x-0.5" strokeWidth={1.75} />
                <span className="sm:hidden">Home</span>
                <span className="max-sm:hidden">Back to Garage Desk home</span>
              </Link>
            )}
          </header>

          <main className="mx-auto flex w-full max-w-[26rem] flex-1 animate-lp-auth-in flex-col justify-center py-14">
            <Eyebrow>{eyebrow}</Eyebrow>
            <h1 className="mt-4 font-lp-display text-[2.5rem] leading-[1.05] font-semibold tracking-[-0.045em] text-balance sm:text-5xl">
              {title}
            </h1>
            <div className="mt-4 text-lg leading-[1.35] text-pretty text-lp-body">{intro}</div>
            <div className="mt-10">{children}</div>
          </main>

          <footer className="flex flex-wrap justify-between gap-x-6 gap-y-1 font-lp-mono text-[13px] text-lp-body">
            <span>No public sign-up · Accounts from the garage owner</span>
            <span>© 2026 Garage Desk</span>
          </footer>
        </div>

        <aside aria-hidden className="relative isolate m-3 hidden flex-col justify-between overflow-hidden rounded-[24px] bg-lp-paper p-10 lg:flex xl:p-14">
          <Image src="/landing/vitosha-dither.webp" alt="" fill unoptimized sizes="55vw" className="lp-pixels -z-10 object-cover object-[60%_100%]" />
          <div>
            <p className="font-lp-mono text-sm tracking-[0.14em] text-lp-blue uppercase">Job cards for independent garages</p>
            <p className="mt-4 max-w-[30rem] font-lp-display text-5xl leading-[1.02] font-semibold tracking-[-0.045em] text-balance xl:text-[64px]">
              Quotes approved on the phone.
            </p>
          </div>
          <div className="flex items-end gap-4">
            <Image
              src="/brand/mark.webp"
              alt=""
              width={192}
              height={192}
              sizes="160px"
              className="size-32 shrink-0 -rotate-3 drop-shadow-[0_20px_30px_rgb(0_37_76/0.35)] xl:size-40"
            />
            <div className="w-full max-w-[22rem] rounded-[20px] bg-white p-5 shadow-[0_0_0_1px_rgb(25_24_20/0.05),0_30px_60px_-30px_rgb(0_37_76/0.5)]">
              <div className="flex items-center justify-between gap-3">
                <span className="font-medium">Renault Clio, CA 1234 BP</span>
                <span className="rounded-full bg-lp-ink px-2.5 py-0.5 font-lp-mono text-[13px] text-white">GD-0099</span>
              </div>
              <div className="mt-4 flex items-center gap-3 rounded-[12px] bg-lp-sky px-3.5 py-3">
                <span className="grid size-7 shrink-0 place-items-center rounded-full bg-lp-blue text-white">
                  <Check className="size-4" strokeWidth={2.5} />
                </span>
                <span>
                  Approved by customer
                  <span className="block font-lp-mono text-[13px] text-lp-body">v2 · €145.50 incl. VAT · 10:31</span>
                </span>
              </div>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
