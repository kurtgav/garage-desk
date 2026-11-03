import { History, Layers, LayoutDashboard, Link2, Percent, Search, ShieldCheck, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { Eyebrow, lpContainer, lpH2, lpH4 } from "./ui";

const FEATURES = [
  { icon: Link2, title: "Customer approval link", body: "One link per job: the car, the quote, the totals and the status. Approve or Decline on the phone." },
  { icon: Percent, title: "Exact VAT on the total", body: "Prices without VAT. VAT is added once on the job total and rounded once, so the cents add up." },
  { icon: Layers, title: "Quote versions", body: "Change a line after sending and a new version is made. Approve works only on the version shown." },
  { icon: Users, title: "Owner and mechanic roles", body: "Mechanics see their own jobs. Revenue, settings and other mechanics’ jobs stay with the owner." },
  { icon: LayoutDashboard, title: "Owner dashboard", body: "Revenue this month, open jobs, quotes waiting for a yes, cars ready to collect, who has what." },
  { icon: Search, title: "Customer search", body: "Find a customer by name, phone or plate, with every car and every job they have had." },
  { icon: History, title: "A timeline on every job", body: "Each status change with who made it and when, phone approvals and their notes included." },
  { icon: ShieldCheck, title: "Two-step sign-in", body: "Staff can add a code from an authenticator app to their sign-in. Optional, per account." },
];

function Card({ f, i }: { f: (typeof FEATURES)[number]; i: number }) {
  return (
    <li className={cn("flex w-[300px] shrink-0 flex-col gap-12 rounded-[24px] p-7 sm:w-[360px] sm:p-8", i % 2 ? "bg-lp-sky" : "bg-lp-cream")}>
      <span className="grid size-11 place-items-center rounded-[10px] bg-white text-lp-blue">
        <f.icon aria-hidden className="size-5" strokeWidth={1.75} />
      </span>
      <div>
        <h3 className={lpH4}>{f.title}</h3>
        <p className="mt-3 text-pretty text-lp-body">{f.body}</p>
      </div>
    </li>
  );
}

/** Reference "why": centred heading over an endless row of cream and sky cards. Pauses on hover; still with reduced motion. */
export function Features() {
  return (
    <section id="features" aria-labelledby="features-title" className="pt-28 lg:pt-[150px]">
      <header data-reveal className={cn(lpContainer, "max-w-[760px] text-center")}>
        <Eyebrow>Features</Eyebrow>
        <h2 id="features-title" className={cn(lpH2, "mt-4")}>
          Built around one job card
        </h2>
        <p className="mx-auto mt-5 max-w-[36rem] text-lg text-pretty text-lp-body">
          Everything a small garage needs between the phone ringing and the keys going back. Nothing it does not.
        </p>
      </header>
      <div data-reveal className="lp-marquee mt-14 overflow-hidden lg:mt-16">
        <div className="lp-marquee-track flex w-max animate-lp-marquee-x motion-reduce:w-auto motion-reduce:animate-none motion-reduce:justify-center motion-reduce:px-4">
          <ul className="flex gap-3 pr-3 motion-reduce:flex-wrap motion-reduce:pr-0 motion-reduce:justify-center">
            {FEATURES.map((f, i) => (
              <Card key={f.title} f={f} i={i} />
            ))}
          </ul>
          <ul aria-hidden className="flex gap-3 pr-3 motion-reduce:hidden">
            {FEATURES.map((f, i) => (
              <Card key={f.title} f={f} i={i} />
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
