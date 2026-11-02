import { MapPin, Phone } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";
import { Money } from "@/components/money";
import { Timeline } from "@/components/timeline";
import { TotalsBlock } from "@/components/totals-block";
import { buttonVariants } from "@/components/ui/button";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatCents, formatQuantity } from "@/lib/money";
import { formatDateTime, formatPhone, formatPlate } from "@/lib/format";
import { getPublicJob, type PublicJob } from "@/lib/public-job";
import { isRateLimited } from "@/lib/rate-limit";
import { CUSTOMER_STATUS_TEXT, type JobStatus } from "@/lib/status";
import { cn } from "@/lib/utils";
import { QuoteActions } from "./quote-actions";

type Props = { params: Promise<{ token: string }> };

// One rate-limit hit and one lookup per request, shared by generateMetadata and the page.
// Over the limit, unknown, revoked or expired all give null (D-012, D-013).
const loadPublicJob = cache(async (token: string) => ((await isRateLimited("publicView")) ? null : getPublicJob(token)));

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const job = await loadPublicJob((await params).token);
  // Generic on purpose (no ref, no names). Without a job: the not-found title, so a bad link's 404
  // looks like any other unknown URL's (a static `metadata` export would leak into the 404).
  return job
    ? { title: { absolute: "Your repair quote" }, robots: { index: false, follow: false } }
    : { title: "Page not found" };
}

/** Customer wording for the public timeline (status + time only, D-014). */
const STEP_LABEL: Record<JobStatus, string> = {
  new: "Quote in preparation",
  quoted: "Quote ready",
  approved: "Quote approved",
  in_progress: "Work started",
  ready: "Ready for collection",
  collected: "Collected",
};

const BANNER: Record<JobStatus, string> = {
  new: "bg-status-new-bg text-status-new",
  quoted: "bg-status-quoted-bg text-status-quoted",
  approved: "bg-status-approved-bg text-status-approved",
  in_progress: "bg-status-in-progress-bg text-status-in-progress",
  ready: "bg-status-ready-bg text-status-ready",
  collected: "border border-line bg-surface text-status-collected",
};

export default async function CustomerJobPage({ params }: Props) {
  const { token } = await params;
  const job = await loadPublicJob(token);
  // The same generic 404 as any other URL.
  if (!job) notFound();

  const { garage, vehicle, totals } = job;
  const status = job.job.status;
  const tel = `tel:${garage.phone.replace(/[^\d+]/g, "")}`;
  const phoneText = formatPhone(garage.phone);
  const totalText = totals ? formatCents(totals.total_cents) : null;

  return (
    <main className="mx-auto flex w-full max-w-lg flex-1 flex-col px-4 pt-5 pb-8 sm:pt-10">
      <header className="flex items-center justify-between gap-4 pb-6">
        <p className="min-w-0 font-semibold text-ink">{garage.name}</p>
        <a href={tel} className={buttonVariants({ variant: "secondary" })}>
          <Phone aria-hidden />
          Call
        </a>
      </header>

      <h1 className="text-2xl font-semibold tracking-tight text-ink">Hi {job.customer.first_name}</h1>
      <p className="mt-1 text-muted">
        {vehicle.make} {vehicle.model} · <span className="whitespace-nowrap">{formatPlate(vehicle.plate)}</span> · Job{" "}
        <span className="whitespace-nowrap">{job.job.ref}</span>
      </p>

      {/* Live region: after Approve/Decline the refreshed page changes this text and it is announced. */}
      <div role="status" className={cn("mt-5 rounded-lg px-4 py-4", BANNER[status])}>
        <p className="text-lg font-semibold">{CUSTOMER_STATUS_TEXT[status]}</p>
        <p className="mt-1 text-sm text-ink">{bannerDetail(job, totalText)}</p>
      </div>

      {status === "ready" && (
        <section aria-labelledby="collect-heading" className="mt-4 rounded-lg border border-line bg-surface p-4">
          <h2 id="collect-heading" className="text-base font-semibold text-ink">
            Where to collect
          </h2>
          <p className="mt-2 flex gap-2 text-ink">
            <MapPin aria-hidden className="mt-0.5 size-4 shrink-0 text-muted" />
            <span>
              {garage.name}
              <br />
              {garage.address}
            </span>
          </p>
          <a href={tel} className={buttonVariants({ size: "lg", className: "mt-4 w-full" })}>
            <Phone aria-hidden />
            Call {phoneText}
          </a>
        </section>
      )}

      {job.lines.length > 0 && totals && (
        <section aria-labelledby="quote-heading" className="mt-8">
          <h2 id="quote-heading" className="text-lg font-semibold text-ink">
            Your quote
          </h2>
          <div className="mt-3 rounded-lg border border-line bg-surface">
            <Table className="[&_td:first-child]:pl-4 [&_th:first-child]:pl-4 [&_td:last-child]:pr-4 [&_th:last-child]:pr-4">
              <TableCaption className="sr-only">Work and parts in this quote</TableCaption>
              <TableHeader>
                <TableRow>
                  <TableHead scope="col">Item</TableHead>
                  <TableHead scope="col" className="text-right">
                    Amount
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {job.lines.map((line, i) => (
                  <TableRow key={i}>
                    <TableCell className="align-top text-base">
                      <span className="block text-ink">{line.description}</span>
                      <span className="block text-sm text-muted tabular-nums">
                        {formatQuantity(line.quantity)} × {formatCents(line.unit_price_cents)}
                      </span>
                    </TableCell>
                    <TableCell className="text-right align-top text-base font-medium text-ink">
                      <Money cents={line.line_total_cents} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <div className="border-t border-line px-4 py-4">
              <TotalsBlock
                subtotalCents={totals.subtotal_cents}
                vatCents={totals.vat_cents}
                totalCents={totals.total_cents}
                vatBps={totals.vat_bps}
                className="text-base"
              />
            </div>
          </div>
        </section>
      )}

      {status === "quoted" && totals && (
        <QuoteActions
          token={token}
          expectedTotalCents={String(totals.total_cents)}
          totalText={formatCents(totals.total_cents)}
        />
      )}

      <section aria-labelledby="progress-heading" className="mt-8">
        <h2 id="progress-heading" className="mb-4 text-lg font-semibold text-ink">
          Progress
        </h2>
        <Timeline
          items={job.timeline.map((step, i) => ({
            key: i,
            // A later `new` is a decline or a staff revision; the DTO deliberately does not say which.
            title: step.status === "new" && i > 0 ? "Quote being revised" : STEP_LABEL[step.status],
            at: step.at,
          }))}
        />
      </section>

      <footer className="mt-10 border-t border-line pt-5 text-sm text-muted">
        <p className="font-medium text-ink">{garage.name}</p>
        <p>{garage.address}</p>
        <a href={tel} className="-ml-1 inline-flex h-11 items-center rounded-md px-1 text-accent hover:underline">
          {phoneText}
        </a>
      </footer>
    </main>
  );
}

function bannerDetail(job: PublicJob, totalText: string | null): string {
  switch (job.job.status) {
    case "quoted":
      return "Check the work and the price below, then approve or decline.";
    case "new":
      return "The garage is updating your quote. Open this link again later to see the new one.";
    case "approved": {
      const approvedAt = job.timeline.findLast((s) => s.status === "approved")?.at;
      const when = approvedAt ? ` on ${formatDateTime(approvedAt)}` : "";
      return totalText ? `You approved ${totalText}${when}.` : `You approved the quote${when}.`;
    }
    case "in_progress":
      return "The garage is working on your car.";
    case "ready":
      return "Bring this page or your job number when you collect.";
    case "collected":
      return `Thanks for choosing ${job.garage.name}.`;
  }
}
