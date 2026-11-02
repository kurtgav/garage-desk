import { MapPin, Phone } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";
import { Timeline } from "@/components/timeline";
import { TotalsBlock } from "@/components/totals-block";
import { buttonVariants } from "@/components/ui/button";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatCents, formatLineAmount, formatQuantity } from "@/lib/money";
import { formatDateTime, formatPhone, formatPlate } from "@/lib/format";
import { getPublicJob, type PublicJob } from "@/lib/public-job";
import { CUSTOMER_STATUS_TEXT, type JobStatus } from "@/lib/status";
import { cn } from "@/lib/utils";
import { QuoteActions } from "./quote-actions";

type Props = { params: Promise<{ token: string }> };
type Step = PublicJob["timeline"][number];

// One lookup per request, shared by generateMetadata and the page. The proxy already
// rate-limited this view and 404s unknown/revoked tokens (D-012, D-013, D-071).
const loadPublicJob = cache(async (token: string) => getPublicJob(token));

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
  declined: "Quote declined",
  approved: "Quote approved",
  in_progress: "Work started",
  ready: "Ready for collection",
  collected: "Collected",
  cancelled: "Job cancelled",
};

const BANNER: Record<JobStatus, string> = {
  new: "bg-status-new-bg text-status-new",
  quoted: "bg-status-quoted-bg text-status-quoted",
  declined: "bg-status-declined-bg text-status-declined",
  approved: "bg-status-approved-bg text-status-approved",
  in_progress: "bg-status-in-progress-bg text-status-in-progress",
  ready: "bg-status-ready-bg text-status-ready",
  collected: "border border-line bg-surface text-status-collected",
  cancelled: "border border-line bg-surface text-status-cancelled",
};

function stepTitle(step: Step, i: number, steps: Step[]): string {
  if (step.status === "approved" && step.channel === "phone") return "Approved by phone (recorded by the garage)";
  if (step.status === "quoted" && steps.slice(0, i).some((s) => s.status === "quoted")) return "Updated quote ready";
  if (step.status === "in_progress" && steps[i - 1]?.status === "ready") return "Back in the workshop";
  return STEP_LABEL[step.status];
}

export default async function CustomerJobPage({ params }: Props) {
  const { token } = await params;
  const job = await loadPublicJob(token);
  // Fallback only: src/proxy.ts already rewrites closed links to the server-rendered 404 before render.
  if (!job) notFound();

  const { garage, vehicle, totals } = job;
  const status = job.job.status;
  const version = job.job.quote_version;
  const tel = `tel:${garage.phone.replace(/[^\d+]/g, "")}`;
  const phoneText = formatPhone(garage.phone);

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
        <p className="mt-1 text-sm text-ink">{bannerDetail(job)}</p>
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
          <div className="flex items-baseline justify-between gap-4">
            <h2 id="quote-heading" className="text-lg font-semibold text-ink">
              Your quote
            </h2>
            {version != null && (
              <span data-testid="quote-version" className="text-sm font-medium text-muted">
                Quote v{version}
              </span>
            )}
          </div>
          <p className="mt-1 text-sm text-muted">Prices excl. VAT; VAT is added once on the total.</p>
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
                    <TableCell className="text-right align-top text-base font-medium whitespace-nowrap text-ink">
                      {formatLineAmount(line.line_total_cents)}
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

      {status === "quoted" && totals && version != null && (
        <QuoteActions token={token} expectedVersion={String(version)} totalText={formatCents(totals.total_cents)} />
      )}

      <section aria-labelledby="progress-heading" className="mt-8">
        <h2 id="progress-heading" className="mb-4 text-lg font-semibold text-ink">
          Progress
        </h2>
        <Timeline
          items={job.timeline.map((step, i, steps) => ({ key: i, title: stepTitle(step, i, steps), at: step.at }))}
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

function bannerDetail(job: PublicJob): string {
  const total = job.totals ? formatCents(job.totals.total_cents) : null;
  switch (job.job.status) {
    case "new":
      return "The garage is preparing your quote. Open this link again later to see it.";
    case "quoted":
      // An earlier approval means the garage added or changed work since (D-050).
      return job.timeline.some((s) => s.status === "approved")
        ? "The garage updated your quote — please review the new total."
        : "Check the work and the price below, then approve or decline.";
    case "declined":
      return "If the garage sends a new quote, it will appear on this page.";
    case "approved": {
      const approval = job.timeline.findLast((s) => s.status === "approved");
      const words = [
        `You approved ${total ?? "the quote"}`,
        approval?.channel === "phone" && "by phone",
        approval && `on ${formatDateTime(approval.at)}`,
      ];
      return `${words.filter(Boolean).join(" ")}.`;
    }
    case "in_progress":
      return "The garage is working on your car.";
    case "ready":
      return "Bring this page or your job number when you collect.";
    case "collected":
      return `Thanks for choosing ${job.garage.name}.`;
    case "cancelled":
      return "Call the garage if you have any questions.";
  }
}
