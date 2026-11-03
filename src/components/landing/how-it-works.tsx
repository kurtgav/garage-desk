import { Calculator, Check, ClipboardList, KeyRound, Smartphone, Wrench } from "lucide-react";
import { cn } from "@/lib/utils";
import { Eyebrow, LpCta, delay, lpContainer, lpH2, lpH3, lpH4 } from "./ui";

type Props = { cta: { href: string; label: string } };

const STEPS = [
  {
    icon: ClipboardList,
    title: "Log the job",
    body: "Customer, car and what is wrong. The job gets its number, like GD-0099, and a mechanic.",
  },
  {
    icon: Calculator,
    title: "Build the quote",
    body: "Parts and labour lines. The labour rate comes from Settings, and VAT is added once on the total.",
  },
  {
    icon: Smartphone,
    title: "Approve on the phone",
    body: "Send the link by copy or WhatsApp. The customer checks the total and taps Approve or Decline.",
  },
  {
    icon: KeyRound,
    title: "Hand over the keys",
    body: "Start the work, mark it ready, then collected. Revenue counts in the month the car leaves.",
  },
];

// GD-0099's day on the timeline (sample times).
const DAY = [
  { time: "09:12", label: "Created" },
  { time: "09:40", label: "Quote sent" },
  { time: "10:31", label: "Approved" },
  { time: "16:50", label: "Ready" },
  { time: "17:30", label: "Collected" },
];

const CHANNELS = ["WhatsApp", "Viber", "SMS", "Email", "Messenger", "Telegram"];

/** Reference "how it works": 2×2 cards around a round centre, a timed progress bar, two tap cards, a wide closer. */
export function HowItWorks({ cta }: Props) {
  return (
    <section id="how-it-works" aria-labelledby="how-title" className={cn(lpContainer, "pt-28 lg:pt-[150px]")}>
      <header data-reveal className="mx-auto max-w-[720px] text-center">
        <Eyebrow>How it works</Eyebrow>
        <h2 id="how-title" className={cn(lpH2, "mt-4")}>
          From the first call to the keys
        </h2>
        <p className="mx-auto mt-5 max-w-[36rem] text-lg text-pretty text-lp-body">
          Four steps on one job card. The customer needs only their phone, and only for one of them.
        </p>
      </header>

      <div className="relative mt-14 grid gap-3 sm:grid-cols-2 lg:mt-16">
        {STEPS.map((s, i) => (
          <article
            key={s.title}
            data-reveal
            style={delay(i * 80)}
            className={cn(
              "flex flex-col justify-between gap-6 rounded-[24px] bg-lp-cream p-7 sm:min-h-[240px] sm:gap-10 lg:min-h-[280px] lg:p-10",
              i % 2 === 1 && "sm:items-end sm:text-right",
            )}
          >
            <span className="flex items-center gap-3 font-lp-mono text-sm text-lp-blue">
              <s.icon aria-hidden className="size-5" strokeWidth={1.75} />
              Step {i + 1}
            </span>
            <div className="max-w-[24rem]">
              <h3 className={lpH3}>{s.title}</h3>
              <p className="mt-3 text-pretty text-lp-body">{s.body}</p>
            </div>
          </article>
        ))}
        <span
          aria-hidden
          className="absolute top-1/2 left-1/2 hidden size-32 -translate-1/2 place-items-center rounded-full bg-lp-blue text-white ring-[14px] ring-white sm:grid"
        >
          <Wrench className="size-10" strokeWidth={1.5} />
        </span>
      </div>

      <figure data-reveal className="lp-day mt-3 rounded-[24px] bg-lp-paper p-7 shadow-[inset_0_0_0_1px_var(--color-lp-line)] lg:p-10">
        <figcaption className="flex flex-wrap items-center justify-between gap-3">
          <span className={lpH4}>GD-0099 · Renault Clio, CA 1234 BP</span>
          <span className="rounded-full bg-white px-3 py-1.5 font-lp-mono text-[13px] shadow-[0_0_0_1px_var(--color-lp-line)]">
            Same day, first call to keys
          </span>
        </figcaption>
        <div className="relative mt-10 hidden h-2 rounded-full bg-lp-sky sm:block">
          <span className="lp-dayline absolute inset-0 rounded-full" />
        </div>
        <ol className="mt-8 grid gap-4 sm:mt-0 sm:flex sm:justify-between">
          {DAY.map((d, i) => (
            <li
              key={d.label}
              className={cn(
                "flex items-center gap-3 sm:-mt-4 sm:flex-col",
                i === 0 ? "sm:items-start" : i === DAY.length - 1 ? "sm:items-end sm:text-right" : "sm:text-center",
              )}
            >
              <span aria-hidden className="grid size-6 shrink-0 place-items-center rounded-full bg-lp-blue text-white ring-4 ring-lp-paper">
                <Check className="size-3.5" strokeWidth={3} />
              </span>
              <span className="flex items-baseline gap-2 sm:flex-col sm:gap-1">
                <span className="font-lp-mono text-sm text-lp-blue">{d.time}</span>
                <span>{d.label}</span>
              </span>
            </li>
          ))}
        </ol>
      </figure>

      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <TapCard
          tone="bg-lp-cream"
          who="The customer"
          taps="1 tap"
          body="Open the link, check the car, the lines and the total, tap Approve. Nothing to install, nothing to sign up for."
          keys={["Approve"]}
        />
        <TapCard
          tone="bg-lp-sky"
          who="Staff"
          taps="2 taps"
          body="Copy the link, or press Share via WhatsApp and the message is written for you. The timeline shows when it was sent."
          keys={["Copy", "Share via WhatsApp"]}
          d={80}
        />
      </div>

      <div
        data-reveal
        className="mt-3 grid overflow-hidden rounded-[24px] bg-lp-cream lg:grid-cols-[minmax(0,1fr)_380px]"
      >
        <div className="flex flex-col justify-between gap-10 p-7 lg:p-12">
          <p className="max-w-[34rem] font-lp-display text-2xl leading-[1.2] font-semibold tracking-[-0.03em] text-balance lg:text-[2rem]">
            No account, no app. The link opens in the browser already on the customer’s phone.
          </p>
          <LpCta href={cta.href} label={cta.label} className="self-start" />
        </div>
        <div aria-hidden className="lp-marquee relative h-[220px] overflow-hidden lg:h-auto lg:min-h-[340px]">
          <ul className="flex animate-lp-marquee-y flex-col gap-3 px-7 pb-3 lg:px-10 motion-reduce:animate-none">
            {[...CHANNELS, ...CHANNELS].map((c, i) => (
              <li key={c + i} className="rounded-[12px] bg-white px-5 py-4 font-lp-mono text-sm">
                Link pasted into {c}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

function TapCard({ tone, who, taps, body, keys, d = 0 }: { tone: string; who: string; taps: string; body: string; keys: string[]; d?: number }) {
  return (
    <article data-reveal style={delay(d)} className={cn("flex flex-col gap-8 rounded-[24px] p-7 lg:p-10", tone)}>
      <p className="font-lp-mono text-sm tracking-[0.14em] text-lp-blue uppercase">{who}</p>
      <p className="font-lp-display text-[3.5rem] leading-none font-semibold tracking-[-0.05em] lg:text-[76px] lg:tracking-[-2.56px]">{taps}</p>
      <p className="max-w-[28rem] text-pretty text-lp-body">{body}</p>
      <div aria-hidden className="mt-auto flex flex-wrap gap-2">
        {keys.map((k, i) => (
          <span
            key={k}
            className={cn(
              "rounded-[10px] px-4 py-3 text-[15px]",
              i === 0 && keys.length === 1 ? "bg-lp-blue text-white" : "bg-white text-lp-ink",
            )}
          >
            {k}
          </span>
        ))}
      </div>
    </article>
  );
}
