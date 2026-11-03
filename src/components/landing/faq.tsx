import { Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { Eyebrow, lpContainer, lpH2 } from "./ui";

const FAQ = [
  {
    q: "Does the customer need an account or an app?",
    a: "No. They open the link in any phone browser, see their car, the quote and the status, and tap Approve or Decline.",
  },
  {
    q: "Can a customer approve an old price?",
    a: "No. Changing a line after sending makes a new quote version, and Approve only works on the version on the customer’s screen.",
  },
  {
    q: "What if the customer says yes on the phone?",
    a: "The owner records a phone approval with a short note. The timeline shows that staff recorded it, and which version and total were approved.",
  },
  {
    q: "How is VAT worked out?",
    a: "Prices are entered without VAT. VAT is added once on the job total and rounded once, half away from zero, so the cents always add up.",
  },
  {
    q: "What can a mechanic see?",
    a: "Their own jobs, plus customers and cars. Revenue, settings and other mechanics’ jobs answer with the same “page not found” as any unknown page.",
  },
  {
    q: "Does the link expire?",
    a: "No, that was the garage’s choice. It shows the current status until staff revoke or regenerate it.",
  },
  {
    q: "Does Garage Desk text or email the customer?",
    a: "No. Staff copy the link or press “Share via WhatsApp”, which opens WhatsApp with the message and the link filled in.",
  },
  {
    q: "How do staff get an account?",
    a: "There is no public sign-up. The owner adds mechanics on the Staff page. Forgot a password? Ask the garage owner to reset it from the Staff page.",
  },
  {
    q: "What is left out on purpose?",
    a: "Payments and invoices, a parts inventory, appointments and booking, and more than one garage. It does one job well.",
  },
];

/** Reference FAQ: heading left, intro right, numbered rows; one open at a time (details name), the first open. */
export function Faq() {
  return (
    <section id="faq" aria-labelledby="faq-title" className={cn(lpContainer, "pt-28 lg:pt-[150px]")}>
      <header data-reveal className="grid gap-6 lg:grid-cols-2 lg:items-end">
        <div>
          <Eyebrow>FAQ</Eyebrow>
          <h2 id="faq-title" className={cn(lpH2, "mt-4")}>
            Questions, answered
          </h2>
        </div>
        <p className="max-w-[30rem] text-lg text-pretty text-lp-body lg:justify-self-end">
          Short answers about the link, the money and who sees what. Anything else? Ask the garage owner.
        </p>
      </header>
      <div className="mt-12 border-t border-lp-line lg:mt-16">
        {FAQ.map((f, i) => (
          <details key={f.q} name="faq" open={i === 0} className="lp-faq border-b border-lp-line transition-colors duration-300 ease-lp">
            <summary className="flex cursor-pointer list-none items-center gap-4 px-4 py-6 sm:gap-8 sm:px-6 lg:py-7">
              <span className="w-10 shrink-0 font-lp-mono text-sm text-lp-body">{String(i + 1).padStart(3, "0")}</span>
              <span className="lp-faq-q flex-1 font-lp-display text-lg font-semibold tracking-[-0.02em] text-pretty transition-colors duration-300 lg:text-2xl">
                {f.q}
              </span>
              <span
                aria-hidden
                className="lp-faq-icon grid size-9 shrink-0 place-items-center rounded-full bg-lp-ink text-white transition-[transform,background-color] duration-300 ease-lp"
              >
                <Plus className="size-4" strokeWidth={2} />
              </span>
            </summary>
            <p className="max-w-[44rem] px-4 pb-7 pl-[4.5rem] text-pretty text-lp-body sm:px-6 sm:pl-[6.5rem] lg:text-lg">{f.a}</p>
          </details>
        ))}
      </div>
    </section>
  );
}
