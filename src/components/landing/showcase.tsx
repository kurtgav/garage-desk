import Image from "next/image";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { delay, lpButton, SectionLabel } from "./ui";

const SCREENS = [
  {
    role: "Owner",
    title: "Dashboard",
    image: { src: "/landing/dashboard.webp", width: 1200, height: 750, alt: "Owner dashboard: revenue this month, open jobs, awaiting approval, ready for collection, mechanic workload" },
    specs: [
      ["Device", "Desktop"],
      ["Shows", "Revenue and workload"],
      ["Sees", "Every job"],
    ],
  },
  {
    role: "Mechanic",
    title: "Jobs",
    image: { src: "/landing/mechanic-jobs.webp", width: 1024, height: 700, alt: "A mechanic's jobs list on a tablet: four open jobs assigned to him, with status and total" },
    specs: [
      ["Device", "Tablet"],
      ["Shows", "Status and totals"],
      ["Sees", "Own jobs only"],
    ],
  },
  {
    role: "Customer",
    title: "Job page",
    image: { src: "/landing/phone-progress.webp", width: 600, height: 1040, alt: "The customer's page on a phone while the car is in progress" },
    specs: [
      ["Device", "Phone"],
      ["Shows", "Quote and progress"],
      ["Sees", "This one car"],
    ],
  },
];

/** Reference "Box & Prices": three cards with a picture on grey, a two-column spec table and a round arrow. */
export function Showcase({ cta }: { cta: { href: string; label: string } }) {
  return (
    <section aria-labelledby="tour-title" className="py-20 lg:py-[120px]">
      <div className="mx-auto max-w-[45rem] text-center">
        <div data-reveal>
          <SectionLabel>Product tour</SectionLabel>
        </div>
        <h2 id="tour-title" data-reveal className="mt-3 font-lp-display text-balance text-[1.75rem] leading-[1.2] sm:text-[2.5rem] lg:text-5xl">
          One app, three views.
        </h2>
        <p data-reveal style={delay(90)} className="mt-4 text-lg leading-[1.5] text-lp-body">
          The owner, the mechanic and the customer each see what they need, and the database decides who sees what.
        </p>
      </div>
      <ul className="mt-12 grid gap-4 md:grid-cols-3 lg:mt-16">
        {SCREENS.map((s, i) => (
          <li key={s.title} data-reveal style={delay(i * 90)}>
            <article className="group h-full rounded-[28px_28px_16px_16px] border border-lp-n30 p-2 transition-colors duration-500 ease-lp hover:border-lp-border">
              <div className="overflow-hidden rounded-t-[22px] bg-lp-n20">
                <Image
                  src={s.image.src}
                  alt={s.image.alt}
                  width={s.image.width}
                  height={s.image.height}
                  sizes="(min-width: 768px) 400px, 100vw"
                  className="aspect-[4/3] h-auto w-full object-cover object-left-top transition-transform duration-500 ease-lp group-hover:scale-[1.06]"
                />
              </div>
              <dl className="grid grid-cols-2 overflow-hidden rounded-b-[12px] border border-t-0 border-lp-n30 text-base">
                {s.specs.map(([k, v]) => (
                  <div key={k} className="contents">
                    <dt className="border-t border-lp-n30 bg-[#fafafa] px-3 py-3">{k}</dt>
                    <dd className="border-t border-lp-n30 bg-[#fafafa] px-3 py-3 text-lp-body">{v}</dd>
                  </div>
                ))}
              </dl>
              <div className="flex items-end justify-between gap-3 px-1 pt-6 pb-2">
                <div>
                  <p className="text-lg text-lp-body">{s.role}</p>
                  <h3 className="font-lp-display text-[2rem] leading-[1.2]">{s.title}</h3>
                </div>
                <a
                  href={s.image.src}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="grid size-12 shrink-0 place-items-center rounded-full border border-lp-n50 text-lp-blue transition-colors duration-500 ease-lp hover:border-lp-blue hover:bg-lp-blue hover:text-white"
                >
                  <ArrowUpRight aria-hidden className="size-6" strokeWidth={1.5} />
                  <span className="sr-only">Open the {s.title.toLowerCase()} screenshot</span>
                </a>
              </div>
            </article>
          </li>
        ))}
      </ul>
      <div data-reveal className="mt-12 text-center">
        <Link href={cta.href} className={lpButton()}>
          {cta.label}
        </Link>
      </div>
    </section>
  );
}
