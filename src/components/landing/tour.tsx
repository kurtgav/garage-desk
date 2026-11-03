import Image from "next/image";
import { Check, Copy, Link2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Eyebrow, lpContainer, lpH2, lpH3 } from "./ui";

type Shot = { src: string; width: number; height: number; alt: string };

const STEPS: { title: string; body: string; checks: string[]; shot?: Shot; phone?: boolean }[] = [
  {
    title: "The job card",
    body: "Customer, car, lines and totals on one screen. Net, VAT and total come from the database, never added up in the browser.",
    checks: ["Labour rate copied from Settings", "Line totals exact to the cent", "VAT once, on the job total"],
    shot: {
      src: "/landing/staff-job-quoted.webp",
      width: 1070,
      height: 520,
      alt: "A quoted job: two line items, net €114.25, VAT 20% €22.85, total €137.10, and the customer link panel",
    },
  },
  {
    title: "The customer link",
    body: "One link per job, made when the quote is sent. Copy it into any chat, or let WhatsApp write the message for you.",
    checks: ["256-bit random token", "Revoke or regenerate at any time", "No expiry unless staff end it"],
  },
  {
    title: "The customer’s phone",
    body: "Their car, the lines, net, VAT and the total, and two buttons. The garage’s address and phone are right there too.",
    checks: ["No account, no app", "Only the version on screen can be approved", "Never their phone number or staff notes"],
    phone: true,
    shot: {
      src: "/landing/customer-quote.webp",
      width: 600,
      height: 1234,
      alt: "The customer's page on a phone: the quote for a Renault Clio with net, VAT and an Approve €145.50 button",
    },
  },
  {
    title: "The timeline",
    body: "Every status change with who made it and when. A phone approval says staff recorded it, with the version and total.",
    checks: ["Created to collected, in order", "Phone approvals carry their note", "Nothing is edited after the fact"],
    shot: {
      src: "/landing/staff-job-timeline.webp",
      width: 1070,
      height: 805,
      alt: "A collected job with its timeline: job created, quote sent, phone approval recorded, work started, ready, collected",
    },
  },
  {
    title: "The owner’s dashboard",
    body: "Revenue for the month the cars left, open jobs, quotes waiting for a yes and cars ready to collect, at a glance.",
    checks: ["Revenue net of VAT", "Months in Europe/Sofia time", "Each mechanic’s open jobs"],
    shot: {
      src: "/landing/dashboard.webp",
      width: 1200,
      height: 750,
      alt: "Owner dashboard: revenue this month, open jobs, awaiting approval, ready for collection, mechanic workload",
    },
  },
  {
    title: "The mechanic’s list",
    body: "A mechanic signs in to their own jobs on the workshop tablet: status, car and total, and the next step on each.",
    checks: ["Only their own jobs", "Readable on a tablet", "Revenue and settings stay hidden"],
    shot: {
      src: "/landing/mechanic-jobs.webp",
      width: 1024,
      height: 700,
      alt: "A mechanic's jobs list on a tablet: four open jobs assigned to him, with status and total",
    },
  },
];

/** Reference use cases: numbered rows on the left; on the right their pictures stack on each other as the page scrolls. */
export function Tour() {
  return (
    <section id="tour" aria-labelledby="tour-title" className={cn(lpContainer, "pt-28 lg:pt-[150px]")}>
      <header data-reveal className="mx-auto max-w-[760px] text-center">
        <Eyebrow>The product</Eyebrow>
        <h2 id="tour-title" className={cn(lpH2, "mt-4")}>
          Three people, one job card
        </h2>
        <p className="mx-auto mt-5 max-w-[36rem] text-lg text-pretty text-lp-body">
          The owner, the mechanic and the customer each see their part of the same job. Six screens, in the order a job
          meets them.
        </p>
      </header>

      <div className="mt-10 lg:mt-16 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] lg:gap-16">
        <ol>
          {STEPS.map((s, i) => (
            <li key={s.title} className="border-t border-lp-line py-12 first:border-0 lg:flex lg:min-h-[600px] lg:flex-col lg:justify-center lg:border-0 lg:py-0">
              <p className="font-lp-mono text-sm text-lp-blue">{String(i + 1).padStart(2, "0")}</p>
              <h3 className={cn(lpH3, "mt-3")}>{s.title}</h3>
              <p className="mt-4 max-w-[30rem] text-pretty text-lp-body">{s.body}</p>
              <ul className="mt-7 ml-2.5 grid gap-4 border-l border-dashed border-lp-blue/40 py-1 pl-6">
                {s.checks.map((c) => (
                  <li key={c} className="relative">
                    <span aria-hidden className="absolute top-0.5 -left-[35px] grid size-5 place-items-center rounded-full bg-lp-blue text-white">
                      <Check className="size-3" strokeWidth={3} />
                    </span>
                    {c}
                  </li>
                ))}
              </ul>
              <div aria-hidden className="mt-8 flex gap-1.5">
                {STEPS.map((_, j) => (
                  <span key={j} className={cn("h-1 w-8 rounded-full", j === i ? "bg-lp-blue" : "bg-lp-line")} />
                ))}
              </div>
              <div className="mt-8 lg:hidden">
                <Panel step={s} />
              </div>
            </li>
          ))}
        </ol>
        <div className="hidden lg:block">
          {STEPS.map((s) => (
            <div key={s.title} className="sticky top-[110px] mb-[100px] h-[500px]">
              <Panel step={s} />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Panel({ step }: { step: (typeof STEPS)[number] }) {
  return (
    <div className="grid h-full min-h-[300px] grid-cols-[minmax(0,1fr)] place-items-center rounded-[24px] bg-lp-sky p-5 sm:p-8">
      {step.shot ? (
        step.phone ? (
          <Image
            src={step.shot.src}
            width={step.shot.width}
            height={step.shot.height}
            alt={step.shot.alt}
            sizes="240px"
            className="h-[440px] w-auto rounded-[28px] shadow-[0_0_0_6px_#fff,0_30px_60px_-30px_rgb(0_37_76/0.45)] max-lg:h-[380px]"
          />
        ) : (
          <div className="w-full overflow-hidden rounded-[14px] bg-white shadow-[0_0_0_1px_rgb(25_24_20/0.06),0_30px_60px_-30px_rgb(0_37_76/0.45)]">
            <div aria-hidden className="flex gap-1.5 border-b border-lp-line px-4 py-3">
              {[0, 1, 2].map((d) => (
                <span key={d} className="size-2.5 rounded-full bg-lp-line" />
              ))}
            </div>
            <Image
              src={step.shot.src}
              width={step.shot.width}
              height={step.shot.height}
              alt={step.shot.alt}
              sizes="(min-width: 1024px) 640px, 100vw"
              className="h-[260px] w-full object-cover object-left-top sm:h-[380px]"
            />
          </div>
        )
      ) : (
        <LinkPanel />
      )}
    </div>
  );
}

/** The job page's customer-link panel, drawn in HTML (the real panel's controls and wording). */
function LinkPanel() {
  return (
    <figure className="w-full max-w-[460px] min-w-0 rounded-[14px] bg-white p-5 sm:p-6 shadow-[0_0_0_1px_rgb(25_24_20/0.06),0_30px_60px_-30px_rgb(0_37_76/0.45)]">
      <figcaption className="flex items-center gap-2 font-medium">
        <Link2 aria-hidden className="size-4 text-lp-blue" strokeWidth={2} />
        Customer link
      </figcaption>
      <p className="mt-4 truncate rounded-[10px] bg-lp-paper px-3.5 py-3 font-lp-mono text-[13px] text-lp-body shadow-[inset_0_0_0_1px_var(--color-lp-line)]">
        garage-desk-tau.vercel.app/Xq7…e3Kw
      </p>
      <div aria-hidden className="mt-3 grid grid-cols-2 gap-2 text-[15px]">
        <span className="flex items-center justify-center gap-2 rounded-[10px] bg-lp-cream py-3">
          <Copy className="size-4" strokeWidth={1.75} />
          Copy
        </span>
        <span className="rounded-[10px] bg-lp-blue py-3 text-center text-white">Share via WhatsApp</span>
      </div>
      <p className="mt-4 flex flex-wrap gap-x-4 gap-y-1 font-lp-mono text-[13px] text-lp-body">
        <span>Link created 09:40</span>
        <span>Last viewed 10:28</span>
        <span>Revoke link · Regenerate link</span>
      </p>
    </figure>
  );
}
