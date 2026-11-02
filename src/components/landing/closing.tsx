import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Layers, ListChecks, Percent, Smartphone, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { delay, LandingWordmark, lpButton, lpContainer, SectionLabel } from "./ui";

type Cta = { href: string; label: string };

const LEFT = [
  { icon: Percent, label: "Exact VAT on the total" },
  { icon: Layers, label: "Quote versions" },
];
const RIGHT = [
  { icon: Smartphone, label: "Approve on the phone" },
  { icon: Users, label: "Owner and mechanic roles" },
];

/** Reference closing band: centred call to action on blue, then a white card with the name set huge behind the product. */
export function Closing({ cta }: { cta: Cta }) {
  return (
    <section aria-labelledby="cta-title" className="lp-pegboard lp-on-dark pt-20 pb-16 lg:pt-[120px] lg:pb-20">
      <div className={lpContainer}>
        <div className="mx-auto max-w-[50rem] text-center">
          <div data-reveal>
            <SectionLabel onBlue>Get started</SectionLabel>
          </div>
          <h2 id="cta-title" data-reveal className="mt-3 font-lp-display text-balance text-[1.75rem] leading-[1.2] text-white sm:text-[2.5rem] lg:text-5xl">
            Run the workshop from one desk.
          </h2>
          <p data-reveal style={delay(90)} className="mx-auto mt-4 max-w-[38rem] text-lg leading-[1.5] text-white">
            Sign in with the account your garage owner set up for you. Forgot the password? The owner can reset it from the Staff page.
          </p>
          <div data-reveal style={delay(180)} className="mt-10 flex flex-wrap justify-center gap-3">
            <a href="#how-it-works" className={lpButton({ variant: "outline", size: "md", className: "font-medium" })}>
              <ListChecks aria-hidden strokeWidth={1.5} />
              See how it works
            </a>
            <Link href={cta.href} className={lpButton({ variant: "white", size: "md", className: "font-medium" })}>
              {cta.label}
              <ArrowRight aria-hidden strokeWidth={1.5} />
            </Link>
          </div>
        </div>

        <div data-reveal="grow" className="relative mt-28 rounded-[24px] bg-white lg:mt-32">
          {/* Sized to the card (container units), so the whole word fits at every width. */}
          <div aria-hidden className="@container absolute inset-0 grid place-items-center overflow-hidden rounded-[24px]">
            <span className="font-lp-display text-[13cqw] leading-none whitespace-nowrap text-lp-n20 uppercase">
              Garage Desk
            </span>
          </div>
          <div className="relative grid items-center gap-6 px-5 pb-8 lg:grid-cols-[1fr_auto_1fr] lg:gap-10 lg:px-10 lg:pb-10">
            <Pills items={LEFT} className="order-2 lg:order-none lg:items-start" />
            <div className="order-1 mx-auto -mt-20 w-[220px] overflow-hidden rounded-[24px] bg-canvas shadow-[0_24px_48px_-24px_rgb(0_37_76/0.45)] outline outline-1 -outline-offset-1 outline-black/10 sm:w-[250px] lg:order-none lg:-mt-24">
              <Image
                src="/landing/phone-ready.webp"
                alt="The customer's page when the car is ready: where to collect it, with a call button"
                width={600}
                height={800}
                sizes="250px"
                className="h-auto w-full"
              />
            </div>
            <Pills items={RIGHT} className="order-3 lg:items-end" />
          </div>
        </div>
      </div>
    </section>
  );
}

function Pills({ items, className }: { items: { icon: typeof Percent; label: string }[]; className?: string }) {
  return (
    <ul className={cn("flex flex-col items-center gap-5", className)}>
      {items.map((p, i) => (
        <li key={p.label} className={cn("flex items-center gap-3", i === 1 && "lg:mx-6")}>
          <span className="grid size-10 place-items-center rounded-full bg-lp-blue text-white ring-4 ring-lp-surface">
            <p.icon aria-hidden className="size-[18px]" strokeWidth={1.75} />
          </span>
          <span className="rounded-full bg-white px-4 py-2 text-base font-medium text-lp-blue">{p.label}</span>
        </li>
      ))}
    </ul>
  );
}

/** Reference footer: black, name and line on top, three columns, then the small print. */
export function LandingFooter({ cta }: { cta: Cta }) {
  const linkClass = "text-[15px] text-white transition-colors duration-300 hover:text-lp-border";
  return (
    <footer className="lp-on-dark bg-lp-ink pt-16 pb-10 text-white lg:pt-20">
      <div className={lpContainer}>
        <div className="flex flex-col gap-6 border-b border-lp-body pb-10 sm:flex-row sm:items-center sm:justify-between">
          <LandingWordmark onDark />
          <p className="font-lp-display text-xl sm:text-2xl">Job cards, quotes and approvals for the garage.</p>
        </div>
        <div className="grid gap-10 border-b border-lp-body py-10 sm:grid-cols-3">
          <nav aria-label="Product">
            <h2 className="text-lg font-medium">Product</h2>
            <ul className="mt-6 grid gap-3">
              <li><a href="#how-it-works" className={linkClass}>How it works</a></li>
              <li><a href="#features" className={linkClass}>Features</a></li>
              <li><a href="#security" className={linkClass}>Security</a></li>
              <li><a href="#faq" className={linkClass}>FAQ</a></li>
            </ul>
          </nav>
          <nav aria-label="Account">
            <h2 className="text-lg font-medium">Staff</h2>
            <ul className="mt-6 grid gap-3">
              <li><Link href={cta.href} className={linkClass}>{cta.label}</Link></li>
              <li><Link href="/forgot-password" className={linkClass}>Forgot password</Link></li>
            </ul>
          </nav>
          <div>
            <h2 className="text-lg font-medium">The small print</h2>
            <ul className="mt-6 grid gap-3 text-[15px] text-lp-n40">
              <li>Prices in EUR, entered without VAT</li>
              <li>Times in Europe/Sofia</li>
              <li>English interface</li>
            </ul>
          </div>
        </div>
        <p className="pt-8 text-[15px] text-lp-n40">© {new Date().getFullYear()} Garage Desk · Built for a small garage in Bulgaria</p>
      </div>
    </footer>
  );
}
