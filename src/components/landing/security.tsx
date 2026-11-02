import { EyeOff, FileX, Gauge, KeyRound, Layers, Link2Off, ShieldCheck } from "lucide-react";
import { ScrollerButtons } from "./scroller-buttons";
import { delay } from "./ui";

// From README "How the approval link stays safe" (D-012…D-071), in the customer's words.
const RULES = [
  {
    icon: KeyRound,
    spec: "256-bit",
    title: "Long random token",
    caption: "Every customer link",
    body: "32 random bytes from the operating system, 43 characters long. The database keeps only its hash, and job numbers like GD-0042 open nothing.",
  },
  {
    icon: EyeOff,
    spec: "1 job",
    title: "A fixed list of fields",
    caption: "What the customer sees",
    body: "Garage details, the car, the customer’s first name, the quote, the totals and the status. Never their phone, internal notes or staff names.",
  },
  {
    icon: FileX,
    spec: "404",
    title: "The same 404 for every bad link",
    caption: "Unknown, tampered or revoked",
    body: "A wrong or revoked link gets the same “page not found” as any other address, with the same headers. Guessing tells you nothing.",
  },
  {
    icon: Gauge,
    spec: "60/min",
    title: "Rate limits",
    caption: "Per IP address, counted in the database",
    body: "60 page views and 10 approve or decline attempts a minute. Sign-in pauses after 10 attempts in 5 minutes.",
  },
  {
    icon: Layers,
    spec: "v2",
    title: "Only the version shown",
    caption: "Approve and Decline",
    body: "The buttons work only while the job is Quoted, and only on the version on screen. If the quote changed, nothing is recorded: the page reloads the new version and asks the customer to check it.",
  },
  {
    icon: Link2Off,
    spec: "Revoke",
    title: "Staff stay in control",
    caption: "Owner or assigned mechanic",
    body: "Revoke the link at any time, or regenerate it while the job is Quoted, Declined, Approved, In progress or Ready. Signed-in staff who open the link cannot approve on the customer’s behalf.",
  },
  {
    icon: ShieldCheck,
    spec: "noindex",
    title: "Nothing leaks through headers",
    caption: "Every response",
    body: "Search engines skip the page, the link is never sent on to other sites, and browsers and proxies do not cache it.",
  },
];

/** Reference testimonials band: heading with the inline name pill, then a scroll-snap row of wide cards with round arrows. */
export function Security() {
  return (
    <section id="security" aria-labelledby="security-title" className="relative py-20 lg:py-[120px]">
      <div aria-hidden className="lp-dots pointer-events-none absolute top-0 right-0 hidden h-[420px] w-1/2 lg:block" />
      <div className="relative max-w-[48rem]">
        <h2 id="security-title" data-reveal className="font-lp-display text-balance text-[1.75rem] leading-[1.25] sm:text-[2.5rem] lg:text-5xl">
          The rules behind every{" "}
          <span className="inline-flex translate-y-[-0.06em] items-center gap-2 rounded-full bg-lp-n20 px-3 py-1 align-middle text-[0.7em] whitespace-nowrap">
            <span aria-hidden className="grid size-[1.1em] place-items-center rounded-full bg-lp-blue ring-[0.18em] ring-lp-surface">
              <span className="size-[0.36em] rounded-full bg-white" />
            </span>
            Garage Desk
          </span>{" "}
          link.
        </h2>
        <p data-reveal style={delay(90)} className="mt-5 text-lg leading-[1.5] text-lp-body">
          A customer link opens one job and nothing else. These rules live in the database and on the server, not just in
          what the screen hides.
        </p>
      </div>
      <ul
        id="security-rules"
        tabIndex={0}
        aria-label="Security rules"
        className="relative -mr-6 mt-12 flex snap-x snap-mandatory gap-6 overflow-x-auto pr-6 pb-2 [scrollbar-width:none] md:-mr-8 md:pr-8 lg:-mr-20 lg:pr-20 [&::-webkit-scrollbar]:hidden"
      >
        {RULES.map((r, i) => (
          <li key={r.title} data-reveal style={delay(Math.min(i, 2) * 90)} className="w-[min(616px,calc(100vw-48px))] shrink-0 snap-start">
            <article className="flex h-full flex-col gap-6 rounded-[32px] border border-lp-n30 bg-white p-6 sm:flex-row sm:gap-8 sm:px-10 sm:py-8">
              <div className="flex h-40 shrink-0 flex-col justify-between rounded-2xl bg-lp-surface p-5 text-lp-blue sm:h-auto sm:w-[45%]">
                <r.icon aria-hidden className="size-8" strokeWidth={1.5} />
                <p aria-hidden className="font-lp-display text-[2.5rem] leading-none">
                  {r.spec}
                </p>
              </div>
              <div className="flex flex-1 flex-col justify-between gap-8">
                <p className="text-lg leading-[1.5] text-lp-body">{r.body}</p>
                <div>
                  <h3 className="text-lg font-medium text-lp-ink">{r.title}</h3>
                  <p className="mt-1 text-sm text-lp-body">{r.caption}</p>
                </div>
              </div>
            </article>
          </li>
        ))}
      </ul>
      <ScrollerButtons targetId="security-rules" />
    </section>
  );
}
