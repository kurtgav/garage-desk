import Image from "next/image";
import { ChevronRight } from "lucide-react";
import { delay } from "./ui";

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

/** Reference "Find a Location": heading + intro in two columns, a wide picture left and a list with blue links right. */
export function Faq() {
  return (
    <section id="faq" aria-labelledby="faq-title" className="pb-20 lg:pb-[120px]">
      <div className="grid gap-6 lg:grid-cols-2 lg:gap-12">
        <h2 id="faq-title" data-reveal className="font-lp-display text-balance text-[1.75rem] leading-[1.2] sm:text-[2.5rem] lg:text-5xl">
          Questions, answered.
        </h2>
        <p data-reveal style={delay(90)} className="text-lg leading-[1.5] text-lp-body lg:pt-2">
          Short answers about the link, the money and who sees what. Anything else? Ask the garage owner.
        </p>
      </div>
      <div className="mt-12 grid items-start gap-8 lg:mt-16 lg:grid-cols-[60fr_40fr] lg:gap-6">
        <div data-reveal="grow" className="overflow-hidden rounded-[24px] bg-canvas outline outline-1 -outline-offset-1 outline-black/10 lg:sticky lg:top-8">
          <Image
            src="/landing/jobs-list.webp"
            alt="The jobs list: open jobs with tabs for each status, car, customer, mechanic, status and total"
            width={1200}
            height={750}
            sizes="(min-width: 1024px) 760px, 100vw"
            className="aspect-[16/10] h-auto w-full object-cover object-left-top"
          />
        </div>
        <div className="grid gap-2">
          {FAQ.map((item) => (
            <details key={item.q} data-reveal className="group rounded-2xl px-1 py-3 [&_summary::-webkit-details-marker]:hidden">
              <summary className="cursor-pointer list-none rounded-xl text-lg leading-[1.4] text-lp-ink">
                {item.q}
                <span aria-hidden className="mt-1.5 flex items-center gap-1 text-base text-lp-blue transition-colors duration-300 group-hover:text-lp-blue-hover">
                  <span className="group-open:hidden">Show answer</span>
                  <span className="hidden group-open:inline">Hide answer</span>
                  <ChevronRight
                    aria-hidden
                    className="size-4 transition-transform duration-300 ease-lp group-hover:translate-x-[5px] group-open:rotate-90 group-open:group-hover:translate-x-0"
                    strokeWidth={2}
                  />
                </span>
              </summary>
              <p className="mt-3 text-base leading-[1.5] text-lp-body">{item.a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
