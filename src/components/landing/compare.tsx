import Image from "next/image";
import { cn } from "@/lib/utils";
import { Eyebrow, delay, lpContainer, lpH2 } from "./ui";

const ROWS = [
  { label: "Who records it", phone: "The owner, with a short note", link: "The customer, on their phone" },
  { label: "What is approved", phone: "The version on the owner’s screen", link: "The version on the customer’s screen" },
  { label: "When", phone: "When someone picks up", link: "Whenever they open the link" },
  { label: "On the timeline", phone: "Phone approval recorded", link: "Approved by customer" },
];

/** Reference "what you get back": copy and two stat cards left, a picture panel right holding a two-column comparison. */
export function Compare() {
  return (
    <section aria-labelledby="compare-title" className={cn(lpContainer, "grid gap-12 pt-28 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:items-center lg:gap-16 lg:pt-[150px]")}>
      <div data-reveal>
        <Eyebrow>Two ways to say yes</Eyebrow>
        <h2 id="compare-title" className={cn(lpH2, "mt-4")}>
          A yes you can point to
        </h2>
        <p className="mt-5 max-w-[30rem] text-lg text-pretty text-lp-body">
          Some customers tap Approve, some still call. Either way the timeline keeps the version, the total and who
          recorded it, so nobody argues about the price at the counter.
        </p>
        <div className="mt-10 grid gap-3 sm:grid-cols-2">
          <Stat label="On the phone" value="1 note" body="The owner records the yes with the version and total." />
          <Stat label="On the link" value="1 tap" body="The customer records it, on the quote they are reading." blue />
        </div>
      </div>
      <div data-reveal style={delay(120)} className="relative isolate overflow-hidden rounded-[24px] p-4 sm:p-10 lg:p-12">
        <Image src="/landing/vitosha-dither.webp" alt="" fill unoptimized sizes="50vw" className="lp-pixels -z-10 object-cover object-[70%_60%]" />
        <table className="w-full overflow-hidden rounded-[16px] bg-white text-left text-[15px] shadow-[0_30px_60px_-30px_rgb(0_37_76/0.5)]">
          <caption className="sr-only">Phone approval and link approval, side by side</caption>
          <thead>
            <tr className="font-lp-mono text-[13px] tracking-[0.1em] uppercase">
              <td className="sr-only" />
              <th scope="col" className="p-4 font-normal text-lp-body sm:p-5">Phone</th>
              <th scope="col" className="bg-lp-sky p-4 font-normal text-lp-blue sm:p-5">Link</th>
            </tr>
          </thead>
          <tbody>
            {ROWS.map((r) => (
              <tr key={r.label} className="border-t border-lp-line align-top">
                <th scope="row" className="sr-only">
                  {r.label}
                </th>
                <td className="p-4 sm:p-5">
                  <span aria-hidden className="block font-lp-mono text-[13px] tracking-[0.08em] text-lp-body uppercase">
                    {r.label}
                  </span>
                  <span className="mt-1.5 block">{r.phone}</span>
                </td>
                <td className="bg-lp-sky p-4 sm:p-5">
                  <span aria-hidden className="block font-lp-mono text-[13px] tracking-[0.08em] text-lp-body uppercase">
                    {r.label}
                  </span>
                  <span className="mt-1.5 block">{r.link}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Stat({ label, value, body, blue = false }: { label: string; value: string; body: string; blue?: boolean }) {
  return (
    <div className={cn("lp-dotgrid rounded-[24px] p-6", blue ? "bg-lp-sky" : "bg-lp-paper")}>
      <p className="font-lp-mono text-[13px] tracking-[0.14em] text-lp-body uppercase">{label}</p>
      <p className={cn("mt-6 font-lp-display text-5xl leading-none font-semibold tracking-[-0.05em]", blue && "text-lp-blue")}>{value}</p>
      <p className="mt-4 text-[15px] text-pretty text-lp-body">{body}</p>
    </div>
  );
}
