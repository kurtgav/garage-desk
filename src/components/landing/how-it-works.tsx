import {
  Calculator,
  ClipboardPlus,
  Layers,
  LayoutDashboard,
  Link2,
  KeyRound,
  Percent,
  Search,
  Send,
  Smartphone,
  Users,
  Wrench,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { delay, lpContainer, SectionLabel } from "./ui";

const STEPS = [
  { icon: ClipboardPlus, title: "Log the job", body: "Pick the car, assign a mechanic and write down what needs doing." },
  { icon: Calculator, title: "Build the quote", body: "Add parts and labour. Labour takes the hourly rate from Settings." },
  { icon: Send, title: "Send the link", body: "Copy it or share it on WhatsApp. One private link per job." },
  { icon: Smartphone, title: "Approve on the phone", body: "The customer checks net, VAT and total, then taps Approve or Decline." },
  { icon: Wrench, title: "Do the work", body: "Start work, mark it ready. The customer’s page follows every step." },
  { icon: KeyRound, title: "Hand over the keys", body: "Mark it collected. Revenue counts in the month the car leaves." },
];

const FEATURES = [
  { icon: Link2, title: "Customer approval link", body: "The customer sees the car, the quote and the status, and approves without an account or an app." },
  { icon: Percent, title: "Exact VAT on the total", body: "Lines are stored exactly. VAT is worked out once on the job total and rounded once, to the cent." },
  { icon: Layers, title: "Quote versions", body: "Change a line after sending and the quote becomes v2. The customer approves the new total, never an old one." },
  { icon: Users, title: "Owner and mechanic roles", body: "Mechanics see their own jobs. Revenue, settings, staff accounts and other mechanics’ work stay with the owner." },
  { icon: LayoutDashboard, title: "Owner dashboard", body: "Revenue this month, open jobs, quotes awaiting approval and cars ready for collection, at a glance." },
  { icon: Search, title: "Customer search", body: "Search customers by name, phone or plate from the top bar or the Customers page." },
];

/** Blue band (reference "How to Rent a Locker"): centred intro, white steps card with dashed connectors, then the feature cards. */
export function HowItWorks() {
  return (
    <div className="lp-pegboard lp-on-dark py-20 lg:py-[120px]">
      <div className={lpContainer}>
        <section id="how-it-works" aria-labelledby="how-title">
          <div className="mx-auto max-w-[45rem] text-center">
            <div data-reveal>
              <SectionLabel onBlue>How it works</SectionLabel>
            </div>
            <h2 id="how-title" data-reveal className="mt-3 font-lp-display text-balance text-[1.75rem] leading-[1.2] text-white sm:text-[2.5rem] lg:text-5xl">
              From the first call to collection.
            </h2>
            <p data-reveal style={delay(90)} className="mt-4 text-lg leading-[1.5] text-white">
              Six steps on one record. The customer never needs an account: the link is enough.
            </p>
          </div>
          <ol data-reveal="grow" className="lp-steps mt-12 grid gap-x-6 gap-y-10 rounded-[24px] bg-white px-6 py-10 sm:grid-cols-2 lg:mt-16 lg:grid-cols-3 lg:px-10 lg:py-14">
            {STEPS.map((step, i) => (
              <li key={step.title} className="relative flex flex-col items-center text-center" style={delay(i * 120)}>
                <span className="lp-step-icon relative z-10 grid size-16 place-items-center rounded-full bg-white text-lp-blue ring-1 ring-lp-n30">
                  <step.icon aria-hidden className="size-7" strokeWidth={1.5} />
                </span>
                {/* Dashed connector to the next step in the row; it fills blue once the card is on screen. */}
                <span aria-hidden className={cn("lp-step-line absolute top-8 left-[calc(50%+44px)] hidden h-0 w-[calc(100%-88px+24px)]", i % 3 !== 2 && "lg:block")} />
                <h3 className="mt-5 font-lp-display text-xl leading-[1.5] sm:text-2xl">{step.title}</h3>
                <p className="mt-2 max-w-[19rem] text-base leading-[1.5] text-lp-body">{step.body}</p>
              </li>
            ))}
          </ol>
        </section>

        <section id="features" aria-labelledby="features-title" className="mt-16 lg:mt-20">
          <h2 id="features-title" data-reveal className="font-lp-display text-balance text-2xl leading-[1.2] text-white sm:text-[2rem]">
            Everything a small garage needs, nothing it doesn’t.
          </h2>
          <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f, i) => (
              <li key={f.title} data-reveal style={delay((i % 3) * 90)}>
                <div className="group h-full rounded-[24px] bg-white p-6 transition-colors duration-300 ease-in-out hover:bg-lp-blue-hover">
                  <span className="grid size-[60px] place-items-center rounded-full bg-lp-blue text-white transition-colors duration-300 group-hover:bg-white group-hover:text-lp-blue">
                    <f.icon aria-hidden className="size-6" strokeWidth={1.5} />
                  </span>
                  <h3 className="mt-10 font-lp-display text-2xl leading-[1.5] transition-colors duration-300 group-hover:text-white">{f.title}</h3>
                  <p className="mt-2 text-base leading-[1.5] text-lp-body transition-colors duration-300 group-hover:text-lp-n40">{f.body}</p>
                </div>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
