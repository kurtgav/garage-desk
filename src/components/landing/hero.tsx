import Image from "next/image";
import Link from "next/link";
import { Smartphone } from "lucide-react";
import { cn } from "@/lib/utils";
import { lpButton } from "./ui";

type Props = { cta: { href: string; label: string } };

/** First screen: headline, one action, three honest facts; the product collage on the right. */
export function Hero({ cta }: Props) {
  return (
    <section aria-labelledby="hero-title" className="grid gap-12 xl:grid-cols-[54fr_46fr] xl:gap-10">
      <div className="pt-14">
        <h1
          id="hero-title"
          className="animate-lp-rise font-lp-display text-[2.5rem] leading-[1.2] text-lp-ink sm:text-5xl lg:text-[4rem]"
        >
          Quotes your customers{" "}
          <span aria-hidden className="relative mx-1 inline-grid size-[0.95em] translate-y-[0.12em] place-items-center align-baseline">
            <span className="absolute inset-0 translate-x-[0.12em] translate-y-[0.06em] rotate-[14deg] rounded-[0.24em] bg-lp-surface" />
            <span className="relative grid size-full rotate-[6deg] place-items-center rounded-[0.24em] bg-lp-blue text-white shadow-[0_0.18em_0.4em_-0.12em_rgb(12_106_206/0.6)]">
              <Smartphone className="size-[0.48em]" strokeWidth={1.75} />
            </span>
          </span>{" "}
          approve on their phone.
        </h1>
        <p className="mt-8 max-w-[37rem] animate-lp-rise text-lg leading-[1.5] text-lp-body [animation-delay:90ms]">
          Garage Desk keeps the job card, the quote and the customer&apos;s yes in one place. Staff build the quote, send one
          link, and the customer approves the exact total, VAT included, on their phone.
        </p>
        <Link href={cta.href} className={cn(lpButton(), "mt-8 animate-lp-rise [animation-delay:180ms]")}>
          {cta.label}
        </Link>
        <dl className="mt-14 grid animate-lp-rise grid-cols-1 gap-6 [animation-delay:270ms] sm:grid-cols-3 xl:mt-[88px]">
          <div className="flex flex-col-reverse justify-end">
            <dt className="text-base text-lp-body">Random token in every link</dt>
            <dd className="text-[2.5rem] leading-[1.2] tabular-nums">
              256<span className="ml-1 align-super text-2xl font-medium text-lp-blue">bit</span>
            </dd>
          </div>
          <div className="flex flex-col-reverse justify-end">
            <dt className="text-base text-lp-body">Job statuses, every change on the timeline</dt>
            <dd className="flex h-12 items-center">
              <span aria-hidden className="flex">
                {["bg-status-quoted", "bg-status-approved", "bg-status-in-progress", "bg-status-ready"].map((c) => (
                  <span key={c} className={cn("-mr-2.5 size-10 rounded-full ring-2 ring-white", c)} />
                ))}
              </span>
              <span className="relative grid size-10 place-items-center rounded-full bg-lp-n30 text-base font-medium text-lp-blue ring-2 ring-white tabular-nums">
                8
              </span>
            </dd>
          </div>
          <div className="flex flex-col-reverse justify-end">
            <dt className="text-base text-lp-body">VAT rounding, on the total</dt>
            <dd className="text-[2.5rem] leading-[1.2] tabular-nums">
              1<span className="ml-1 align-super text-2xl font-medium text-lp-blue">×</span>
            </dd>
          </div>
        </dl>
      </div>
      <HeroCollage />
    </section>
  );
}

const card = "rounded-[20px] bg-white";

/**
 * Grey panel of product fragments, after the reference's 2-column hero collage. Data from the demo screenshots.
 * The HTML fragments are pictures of the app (aria-hidden); the screenshots carry the alt text.
 */
function HeroCollage() {
  return (
    <div className="min-w-0 animate-lp-rise rounded-[32px] bg-lp-n30 p-3 [animation-delay:120ms]">
      <div className="flex gap-3 sm:gap-4">
        <div className="flex min-w-0 flex-1 flex-col gap-3 sm:gap-4">
          <div aria-hidden className={cn(card, "hidden p-5 sm:block")}>
            {/* The staff job page's panel right after the link is created (customer-link-panel.tsx). */}
            <p className="text-sm text-lp-body">Customer link</p>
            <div className="mt-3 flex gap-2 text-[13px] font-medium">
              <span className="flex h-9 min-w-0 flex-1 items-center rounded-xl border border-lp-n40 px-3 font-normal">
                <span className="truncate">garage-desk-tau.vercel.app/kQ3vR9x…</span>
              </span>
              <span className="flex h-9 items-center rounded-xl border border-lp-n40 px-3">Copy</span>
            </div>
            <p className="mt-2 text-xs text-lp-body">Shown only now. Send it to the customer before you leave this page.</p>
            <span className="mt-3 flex h-9 items-center justify-center rounded-xl border border-lp-n40 text-[13px] font-medium">
              Share via WhatsApp
            </span>
          </div>
          <div aria-hidden className={cn(card, "hidden p-5 sm:block")}>
            {/* GD-0099 in the demo data: v1 declined (the customer skipped the cabin filter), v2 waiting. */}
            <p className="text-sm text-lp-body">Timeline</p>
            <ol className="mt-3 grid gap-3">
              <StatusRow tone="bg-status-quoted-bg text-status-quoted" label="Quoted" title="Quote sent — v1 · €168.18" />
              <StatusRow tone="bg-status-declined-bg text-status-declined" label="Declined" title="Declined by customer — v1" />
              <StatusRow tone="bg-status-quoted-bg text-status-quoted" label="Quoted" title="New quote sent — v2 · €145.50" />
            </ol>
          </div>
          <QuoteCard />
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-3 sm:gap-4">
          <div className="overflow-hidden rounded-[20px] bg-canvas outline outline-1 -outline-offset-1 outline-black/10">
            <Image
              src="/landing/customer-quote.webp"
              alt="The customer's page on a phone: the quote for a Renault Clio with net, VAT and an Approve €145.50 button"
              width={600}
              height={1234}
              sizes="(min-width: 1440px) 300px, (min-width: 1280px) 22vw, 45vw"
              preload
              className="h-auto w-full"
            />
          </div>
          <div className={cn(card, "hidden p-3 sm:block")}>
            <p className="px-2 pt-1 text-sm text-lp-body">Owner dashboard</p>
            <Image
              src="/landing/kpis.webp"
              alt="Dashboard cards: revenue this month €286.15 net, 13 open jobs"
              width={515}
              height={164}
              sizes="(min-width: 1280px) 260px, 45vw"
              className="mt-2 h-auto w-full rounded-xl"
            />
          </div>
          <div aria-hidden className={cn(card, "hidden p-5 sm:block")}>
            <p className="text-sm text-lp-body">Ready for collection</p>
            <ul className="mt-3 grid gap-3 text-sm">
              {[
                ["GD-0093", "CB 7310 AH", "€145.50"],
                ["GD-0094", "CA 2745 TM", "€137.10"],
              ].map(([ref, plate, total]) => (
                <li key={ref} className="flex items-center justify-between gap-2">
                  <span className="min-w-0">
                    <span className="block font-medium">{ref}</span>
                    <span className="block truncate text-lp-body">{plate}</span>
                  </span>
                  <span className="text-right">
                    <span className="block font-medium tabular-nums">{total}</span>
                    <span className="mt-0.5 inline-block rounded-full bg-status-ready-bg px-2 py-0.5 text-xs font-medium text-status-ready">
                      Ready
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatusRow({ tone, label, title }: { tone: string; label: string; title: string }) {
  return (
    <li className="grid justify-items-start gap-1">
      <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium", tone)}>
        <span aria-hidden className="size-1.5 rounded-full bg-current" />
        {label}
      </span>
      <span className="text-[13px] tabular-nums">{title}</span>
    </li>
  );
}

/** Blue totals card (the reference's tilted "Deposit Data" card): net vs VAT as a ring, the approve pill. */
function QuoteCard() {
  // Elena's quote v2 from the demo data: net €121.25, VAT 20% €24.25, total €145.50.
  const r = 52;
  const c = 2 * Math.PI * r;
  const netShare = 121.25 / 145.5;
  return (
    <div aria-hidden className="@container rotate-[1.5deg] rounded-[24px] bg-lp-blue p-4 text-white sm:p-6">
      <div className="flex items-center justify-between text-[13px] sm:text-sm">
        <span>Quote v2</span>
        <span className="hidden rounded-full bg-lp-blue-hover px-2.5 py-1 sm:inline">GD-0099</span>
      </div>
      <div className="relative mx-auto mt-4 aspect-square w-full max-w-[200px]">
        <svg viewBox="0 0 128 128" aria-hidden className="size-full -rotate-90">
          <circle cx="64" cy="64" r={r} fill="none" stroke="var(--color-lp-border)" strokeWidth="14" />
          <circle cx="64" cy="64" r={r} fill="none" stroke="#fff" strokeWidth="14" strokeDasharray={`${c * netShare} ${c}`} />
        </svg>
        <div className="absolute inset-0 grid place-content-center text-center">
          {/* Sized to the card (cqw): the ring is narrow on phones. */}
          <span className="font-lp-display text-[length:clamp(0.75rem,13cqw,1.75rem)] tabular-nums">€145.50</span>
          <span className="text-xs @max-[10rem]:hidden">Total</span>
        </div>
      </div>
      <p className="mt-5 flex h-11 items-center justify-center rounded-full bg-white text-sm font-semibold text-lp-blue sm:h-12 sm:text-lg">
        Approve<span className="hidden min-[400px]:inline">&nbsp;€145.50</span>
      </p>
      <dl className="mt-4 grid gap-2 text-[13px] @max-[10rem]:hidden sm:text-sm">
        <div className="flex justify-between gap-2">
          <dt className="flex items-center gap-2">
            <span aria-hidden className="size-2 rounded-full bg-white" />
            Net (excl. VAT)
          </dt>
          <dd className="tabular-nums">€121.25</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="flex items-center gap-2">
            <span aria-hidden className="size-2 rounded-full bg-lp-border" />
            VAT 20%
          </dt>
          <dd className="tabular-nums">€24.25</dd>
        </div>
      </dl>
    </div>
  );
}
