import Image from "next/image";
import { delay, lpButton, SectionLabel } from "./ui";

const ROWS = [
  {
    title: "Quotes that add up to the cent",
    body: "Parts and labour are stored exactly. VAT is added once on the job total and rounded once, so the total the customer approves is the total you collect.",
    quote: "“Net, VAT and total come from the database, never from a spreadsheet.”",
    image: { src: "/landing/staff-job-quoted.webp", width: 1070, height: 520, alt: "A quoted job: two line items, net €114.25, VAT 20% €22.85, total €137.10, and the customer link panel" },
    action: { href: "#how-it-works", label: "See the steps" },
  },
  {
    title: "Every step on the record",
    body: "Who created the job, which quote version the customer approved, when work started and who handed the keys back. The timeline writes itself as the job moves.",
    quote: "“Approved by phone? The owner records it with a note, and the timeline says so.”",
    image: { src: "/landing/staff-job-timeline.webp", width: 1070, height: 805, alt: "A collected job with its timeline: job created, quote sent, phone approval recorded, work started, ready, collected" },
    action: { href: "#security", label: "Read the data rules" },
  },
];

/** Reference "Featured": heading + intro in two columns, then picture-left rows with a quote line and a pill. */
export function Why() {
  return (
    <section aria-labelledby="why-title" className="py-20 lg:py-[120px]">
      <div data-reveal>
        <SectionLabel>Why Garage Desk</SectionLabel>
      </div>
      <div className="mt-4 grid gap-6 lg:grid-cols-2 lg:gap-12">
        <h2 id="why-title" data-reveal className="font-lp-display text-balance text-[1.75rem] leading-[1.2] sm:text-[2.5rem] lg:text-5xl">
          One job card, from the first call to the keys.
        </h2>
        <p data-reveal style={delay(90)} className="text-lg leading-[1.5] text-lp-body lg:pt-3">
          Built for a small garage: the owner, a few mechanics, and customers who would rather tap a link than call back.
          Every job, quote and approval lives on one record.
        </p>
      </div>
      <div className="mt-16 grid gap-16 lg:mt-20 lg:gap-24">
        {ROWS.map((row) => (
          <div key={row.title} className="grid items-center gap-8 lg:grid-cols-2 lg:gap-12">
            <div data-reveal="grow" className="overflow-hidden rounded-[24px] bg-canvas outline outline-1 -outline-offset-1 outline-black/10">
              <Image
                src={row.image.src}
                alt={row.image.alt}
                width={row.image.width}
                height={row.image.height}
                sizes="(min-width: 1024px) 600px, 100vw"
                className="h-auto w-full"
              />
            </div>
            <div>
              <h3 data-reveal className="font-lp-display text-2xl leading-[1.2] sm:text-[2rem]">
                {row.title}
              </h3>
              <p data-reveal style={delay(80)} className="mt-4 text-lg leading-[1.5] text-lp-body">
                {row.body}
              </p>
              <p data-reveal style={delay(160)} className="mt-4 text-lg leading-[1.5] text-lp-body">
                {row.quote}
              </p>
              <div data-reveal style={delay(240)} className="mt-8">
                <a href={row.action.href} className={lpButton({ size: "md", className: "font-medium" })}>
                  {row.action.label}
                </a>
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
