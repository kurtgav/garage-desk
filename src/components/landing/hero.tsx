import Image from "next/image";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { Eyebrow, LandingWordmark, LpCta, lpButton, lpContainer, lpH1 } from "./ui";

type Props = { cta: { href: string; label: string } };

const HEADLINE = "Quotes approved on the phone";

// One real job's morning (GD-0099, the seed's worked example): v1 declined, v2 approved on her phone.
const RUN = [
  { title: "Job created", detail: "Petrov Auto Service · 09:12" },
  { title: "Quote v1 sent", detail: "3 lines · €168.18" },
  { title: "Declined by customer", detail: "v1 · cabin filter not wanted" },
  { title: "Quote v2 sent", detail: "2 lines · €145.50" },
  { title: "Approved by customer", detail: "v2 · €145.50 incl. VAT" },
];

/** Reference hero: full-bleed dithered landscape, copy left, a live app card right that plays one job through. */
export function Hero({ cta }: Props) {
  const words = HEADLINE.split(" ");
  return (
    <section aria-labelledby="hero-title" className="relative isolate overflow-hidden bg-lp-paper">
      <Image
        src="/landing/vitosha-dither.webp"
        alt=""
        fill
        unoptimized
        loading="eager"
        fetchPriority="high"
        sizes="100vw"
        className="lp-pixels -z-10 object-cover object-[50%_100%]"
      />
      <div
        className={cn(
          lpContainer,
          "grid gap-12 pt-28 pb-16 sm:pt-36 lg:min-h-[900px] lg:grid-cols-[minmax(0,1fr)_490px] lg:items-center lg:gap-16 lg:pt-28 lg:pb-24",
        )}
      >
        <div>
          <Eyebrow className="animate-lp-rise">Job cards for independent garages</Eyebrow>
          <h1 id="hero-title" className={cn(lpH1, "mt-4 max-w-[640px]")}>
            {words.map((w, i) => (
              <span key={w + i} className="inline-block animate-lp-rise" style={{ animationDelay: `${80 + i * 70}ms` }}>
                {w}
                {i < words.length - 1 && " "}
              </span>
            ))}
          </h1>
          <p className="mt-8 max-w-[34rem] animate-lp-rise text-base leading-[1.3] text-pretty [animation-delay:450ms] sm:text-lg">
            Garage Desk keeps the job card, the quote and the customer’s yes in one place. Staff send one link; the
            customer checks the exact total, VAT included, and taps Approve. No account, no app.
          </p>
          <div className="mt-10 inline-flex max-w-full animate-lp-rise flex-col gap-3 rounded-[16px] bg-white p-2 shadow-[0_0_0_1px_rgb(25_24_20/0.05)] [animation-delay:550ms]">
            <div className="flex flex-wrap gap-2">
              <LpCta href={cta.href} label={cta.label} />
              <a href="#how-it-works" className={lpButton({ variant: "cream" })}>
                See how it works
              </a>
            </div>
            <p className="flex items-center gap-2 px-2 pb-1 font-lp-mono text-[13px] text-lp-body">
              <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-lp-blue" />
              No public sign-up · Staff accounts from the owner
            </p>
          </div>
        </div>
        <HeroCard />
      </div>
    </section>
  );
}

/** The app card: the request types in, then the job's timeline fills row by row (CSS only; reduced motion shows it whole). */
function HeroCard() {
  return (
    <figure className="w-full max-w-[490px] animate-lp-rise justify-self-start overflow-hidden rounded-[24px] bg-white shadow-[0_0_0_1px_rgb(25_24_20/0.05),0_40px_80px_-40px_rgb(0_37_76/0.35)] [animation-delay:300ms]">
      <div className="flex items-center justify-between border-b border-lp-line px-5 py-4">
        <LandingWordmark className="text-lg" markClassName="size-6 rounded-[6px] [&_svg]:size-3.5" />
        <span className="rounded-full bg-lp-ink px-3 py-1 font-lp-mono text-[13px] text-white">GD-0099</span>
      </div>
      <div className="px-5 pt-5 pb-6">
        <p className="ml-auto w-fit max-w-[92%] animate-lp-type rounded-[12px] bg-lp-sky px-3.5 py-2.5 text-[15px] [animation-delay:900ms]">
          Renault Clio, CA 1234 BP. A/C not cooling. Elena needs it back today.
        </p>
        <p className="mt-6 flex items-center gap-2 font-medium">
          Job timeline
          <span aria-hidden className="flex gap-1">
            {[0, 1, 2].map((i) => (
              <span key={i} className="size-1.5 animate-pulse rounded-full bg-lp-blue" style={{ animationDelay: `${i * 200}ms` }} />
            ))}
          </span>
        </p>
        <ol className="mt-3 ml-1.5 border-l-2 border-lp-sky">
          {RUN.map((r, i) => (
            <li
              key={r.title}
              className="relative animate-lp-row py-2 pl-5 before:absolute before:top-[15px] before:-left-[7px] before:size-3 before:rounded-full before:border-2 before:border-white before:bg-lp-blue"
              style={{ animationDelay: `${2200 + i * 650}ms` }}
            >
              <span className="text-[15px]">{r.title}</span>
              <span className="mt-0.5 block font-lp-mono text-[13px] text-lp-body">{r.detail}</span>
            </li>
          ))}
        </ol>
        <figcaption
          className="mt-4 flex animate-lp-row items-center gap-3 rounded-[12px] bg-lp-cream px-3.5 py-3 text-[15px]"
          style={{ animationDelay: `${2200 + RUN.length * 650}ms` }}
        >
          <span aria-hidden className="grid size-7 shrink-0 place-items-center rounded-full bg-lp-blue text-white">
            <Check className="size-4" strokeWidth={2.5} />
          </span>
          Approved on her phone at 10:31. Work can start.
        </figcaption>
      </div>
    </figure>
  );
}
