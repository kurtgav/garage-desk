import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { Eyebrow, delay, lpContainer, lpH2, lpH4 } from "./ui";

// From README "How the approval link stays safe" and D-012…D-111, in the customer's words.
const CARDS = [
  {
    name: "The link",
    sub: "What the customer opens",
    figure: "256-bit",
    figureNote: "random token, only its hash stored",
    chips: ["43 characters", "No expiry", "Revocable"],
    checks: [
      "Job numbers like GD-0042 open nothing",
      "The same 404 for every wrong, tampered or revoked link",
      "60 views and 10 decisions a minute per address",
      "Never indexed, cached or passed on to other sites",
    ],
  },
  {
    name: "The money",
    sub: "What the customer approves",
    badge: "On every quote",
    figure: "€145.50",
    figureNote: "exactly, VAT included",
    chips: ["Whole cents", "VAT once", "Half away from zero"],
    checks: [
      "Prices entered without VAT",
      "VAT added once, on the job total",
      "Approve works only on the version on screen",
      "A changed quote becomes a new version",
    ],
  },
  {
    name: "Staff accounts",
    sub: "Who can change a job",
    figure: "2-step",
    figureNote: "sign-in with an authenticator app, optional",
    chips: ["No public sign-up", "Owner adds staff", "Two roles"],
    checks: [
      "Sign-in pauses after 10 tries in 5 minutes",
      "Mechanics see only their own jobs",
      "The database checks every request, not just the screen",
      "Every status change lands on the timeline",
    ],
  },
];

/** Reference pricing: three cards (cream, sky, cream) with a figure box, a chip box and a check list. */
export function Security() {
  return (
    <section id="security" aria-labelledby="security-title" className={cn(lpContainer, "pt-28 lg:pt-[150px]")}>
      <header data-reveal className="mx-auto max-w-[760px] text-center">
        <Eyebrow>Security</Eyebrow>
        <h2 id="security-title" className={cn(lpH2, "mt-4")}>
          Safe link, exact money, few keys
        </h2>
        <p className="mx-auto mt-5 max-w-[36rem] text-lg text-pretty text-lp-body">
          The customer’s link shows one job and nothing else. The total they approve is the total they pay. Only staff
          the owner added can sign in.
        </p>
      </header>
      <div className="mt-14 grid gap-3 lg:mt-16 lg:grid-cols-3">
        {CARDS.map((c, i) => (
          <article
            key={c.name}
            data-reveal
            style={delay(i * 80)}
            className={cn("relative flex flex-col rounded-[20px] p-2", c.badge ? "bg-lp-sky" : "bg-lp-cream")}
          >
            {c.badge && (
              <span className="absolute top-6 right-6 rounded-full bg-lp-blue px-3 py-1 font-lp-mono text-[13px] text-white">{c.badge}</span>
            )}
            <div className="px-5 pt-5 pb-6">
              <h3 className={lpH4}>{c.name}</h3>
              <p className="mt-1.5 text-lp-body">{c.sub}</p>
            </div>
            <div className="rounded-[14px] bg-white p-5">
              <p className="font-lp-display text-5xl leading-none font-semibold tracking-[-0.05em] tabular-nums">{c.figure}</p>
              <p className="mt-3 font-lp-mono text-[13px] text-lp-body">{c.figureNote}</p>
            </div>
            <ul aria-label="In short" className="mt-2 flex flex-wrap gap-1.5 rounded-[14px] bg-white/55 p-3">
              {c.chips.map((chip) => (
                <li key={chip} className="rounded-full bg-white px-3 py-1.5 text-sm">
                  {chip}
                </li>
              ))}
            </ul>
            <ul className="grid gap-3.5 px-5 pt-6 pb-5">
              {c.checks.map((x) => (
                <li key={x} className="flex gap-3 text-[15px] text-pretty">
                  <span aria-hidden className="mt-px grid size-5 shrink-0 place-items-center rounded-full bg-lp-blue text-white">
                    <Check className="size-3" strokeWidth={3} />
                  </span>
                  {x}
                </li>
              ))}
            </ul>
          </article>
        ))}
      </div>
    </section>
  );
}
