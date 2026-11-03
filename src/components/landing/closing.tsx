import Link from "next/link";
import { cn } from "@/lib/utils";
import { Eyebrow, LandingWordmark, LpCta, lpButton, lpContainer, lpH1 } from "./ui";

type Props = { cta: { href: string; label: string } };

/** Reference final call: centred mono label, a 76px two-line headline whose second line types in, on cream slats. */
export function Closing({ cta }: Props) {
  return (
    <section aria-labelledby="closing-title" className={cn(lpContainer, "pt-28 lg:pt-[150px]")}>
      <div className="lp-slats rounded-[24px] px-4 py-24 text-center sm:px-6 sm:py-28 lg:py-36">
        <Eyebrow>The next job</Eyebrow>
        <h2 id="closing-title" data-reveal className={cn(lpH1, "mx-auto mt-5 max-w-[900px] text-[2.5rem]")}>
          Send the quote.
          <span className="lp-typed block text-lp-blue">Get the yes.</span>
        </h2>
        <p className="mx-auto mt-6 max-w-[30rem] text-lg text-pretty text-lp-body">
          Staff sign in with the account the garage owner made for them.
        </p>
        <div className="mt-10 flex flex-wrap justify-center gap-2">
          <LpCta href={cta.href} label={cta.label} />
          <a href="#how-it-works" className={lpButton({ variant: "white" })}>
            See how it works
          </a>
        </div>
      </div>
    </section>
  );
}

const PRODUCT = [
  { href: "#how-it-works", label: "How it works" },
  { href: "#features", label: "Features" },
  { href: "#tour", label: "Tour" },
  { href: "#security", label: "Security" },
  { href: "#faq", label: "FAQ" },
];

const linkClass = "rounded-[4px] text-lp-ink transition-colors duration-200 hover:text-lp-blue";

/** Reference footer: one cream card with the columns, a giant wordmark cut off at the bottom, then the small print. */
export function LandingFooter({ cta }: Props) {
  return (
    <footer className="px-3 pt-28 pb-3 sm:px-4 lg:pt-[150px]">
      <div className="overflow-hidden rounded-[24px] bg-lp-cream px-6 pt-12 lg:px-14 lg:pt-16">
        <div className="grid gap-12 lg:grid-cols-[minmax(0,1.4fr)_repeat(3,minmax(0,1fr))]">
          <div>
            <LandingWordmark />
            <p className="mt-5 max-w-[22rem] text-pretty text-lp-body">Job cards, quotes and approvals for the garage.</p>
          </div>
          <FooterColumn title="Product">
            {PRODUCT.map((l) => (
              <li key={l.href}>
                <a href={l.href} className={linkClass}>
                  {l.label}
                </a>
              </li>
            ))}
          </FooterColumn>
          <FooterColumn title="Staff">
            <li>
              <Link href={cta.href} className={linkClass}>
                {cta.label}
              </Link>
            </li>
            <li>
              <Link href="/forgot-password" className={linkClass}>
                Forgot password
              </Link>
            </li>
          </FooterColumn>
          <FooterColumn title="The small print" isNav={false}>
            <li>Prices in EUR, entered without VAT</li>
            <li>Times in Europe/Sofia</li>
            <li>English interface</li>
          </FooterColumn>
        </div>
        <div className="mt-16 flex flex-col gap-2 border-t border-lp-line pt-6 text-sm text-lp-body sm:flex-row sm:justify-between">
          <p>© 2026 Garage Desk · Built for a small garage in Bulgaria</p>
          <p>
            Vitosha above Sofia, cropped and dithered:{" "}
            <a href="https://commons.wikimedia.org/wiki/File:Sofia-vitosha-kempinski.jpg" className={cn(linkClass, "text-lp-body underline")}>
              “Sofia-vitosha-kempinski” by podoboq
            </a>
            ,{" "}
            <a href="https://creativecommons.org/licenses/by/2.0/" className={cn(linkClass, "text-lp-body underline")}>
              CC BY 2.0
            </a>
          </p>
        </div>
        <div
          aria-hidden
          className="mt-10 -mb-[0.21em] text-center font-lp-display text-[clamp(3.5rem,16.5vw,15.5rem)] leading-[0.8] font-semibold tracking-[-0.06em] whitespace-nowrap text-white select-none before:content-['Garage_Desk']"
        />
      </div>
    </footer>
  );
}

function FooterColumn({ title, children, isNav = true }: { title: string; children: React.ReactNode; isNav?: boolean }) {
  const Wrapper = isNav ? "nav" : "div";
  return (
    <Wrapper aria-label={isNav ? title : undefined}>
      <p className="font-lp-mono text-[13px] tracking-[0.14em] text-lp-body uppercase">{title}</p>
      <ul className="mt-5 grid gap-3">{children}</ul>
    </Wrapper>
  );
}
