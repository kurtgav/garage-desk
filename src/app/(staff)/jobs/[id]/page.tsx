import { ChevronLeft, Lock } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import { Money } from "@/components/money";
import { StatusBadge } from "@/components/status-badge";
import { Timeline, type TimelineItem } from "@/components/timeline";
import { TotalsBlock } from "@/components/totals-block";
import { Alert } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireStaff } from "@/lib/auth";
import { getJob, listMechanicOptions } from "@/lib/data/jobs";
import type { JobDetail, JobEvent } from "@/lib/data/types";
import { formatDate, formatDateTime, formatPhone, formatPlate } from "@/lib/format";
import { formatCents } from "@/lib/money";
import { CUSTOMER_STATUS_TEXT, REQUOTE_ON_EDIT_STATUSES, STATUS_LABEL } from "@/lib/status";
import { CustomerLinkPanel } from "./customer-link-panel";
import { LineForm, LineItems } from "./line-items";
import { PhoneApproval } from "./phone-approval";
import { ReassignMechanic } from "./reassign-mechanic";
import { StatusActions } from "./status-actions";

type Props = { params: Promise<{ id: string }> };

// One DB read per request for both the title and the page (getJob returns null for malformed ids too).
const loadJob = cache(getJob);

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const job = await loadJob((await params).id);
  return { title: job?.ref ?? "Page not found" };
}

export default async function JobPage({ params }: Props) {
  const staff = await requireStaff();
  const job = await loadJob((await params).id);
  // Missing, malformed and another mechanic's job all end here (FR1 AC, D-020): the same generic 404.
  if (!job) notFound();

  const isOwner = staff.role === "owner";
  const mechanics = job.can.reassign ? await listMechanicOptions() : [];
  const vehicleName = [job.vehicle.make, job.vehicle.model].join(" ");
  const requotes = job.can.editLines && job.quoteVersion != null && REQUOTE_ON_EDIT_STATUSES.includes(job.status);

  return (
    <>
      <Link href="/jobs" className="mb-3 inline-flex h-10 items-center gap-1 rounded-md text-sm text-muted hover:text-ink">
        <ChevronLeft aria-hidden className="size-4" />
        Jobs
      </Link>

      <div className="mb-6 flex flex-wrap items-start justify-between gap-x-6 gap-y-4">
        <div className="min-w-0 flex-1 basis-80">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight text-ink">{job.ref}</h1>
            <StatusBadge status={job.status} />
          </div>
          <p className="mt-2 max-w-prose whitespace-pre-line text-ink">{job.description}</p>
        </div>
        <div className="grid w-full gap-3 sm:w-auto sm:justify-items-end">
          <StatusActions jobId={job.id} status={job.status} hasLines={job.lines.length > 0} isOwner={isOwner} />
          {job.quoteVersion != null && (
            <PhoneApproval
              jobId={job.id}
              version={job.quoteVersion}
              totalText={formatCents(job.totals.totalCents)}
              canRecord={job.can.recordPhoneApproval}
            />
          )}
        </div>
      </div>

      <Card className="mb-6">
        <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-lg bg-rule md:grid-cols-4">
          <Fact label="Vehicle">
            <span className="font-medium">{formatPlate(job.vehicle.plate)}</span>
            <span className="block text-muted">
              {vehicleName}
              {job.vehicle.year != null && ` · ${job.vehicle.year}`}
            </span>
          </Fact>
          <Fact label="Customer">
            {/* min-h-6: two stacked links need 24px targets (WCAG 2.5.8). */}
            <Link href={`/customers/${job.customer.id}`} className="flex min-h-6 w-fit items-center text-accent hover:underline">
              {job.customer.fullName}
            </Link>
            <a href={`tel:+${job.customer.phone}`} className="flex min-h-6 w-fit items-center text-accent hover:underline">
              {formatPhone(job.customer.phone)}
            </a>
          </Fact>
          <Fact label="Mechanic">
            {job.mechanic.fullName}
            {job.can.reassign && mechanics.length > 0 && (
              <span className="block">
                <ReassignMechanic jobId={job.id} currentId={job.mechanic.id} mechanics={mechanics} />
              </span>
            )}
          </Fact>
          <Fact label="Created">
            {formatDate(job.createdAt)}
            {job.quotedAt && <span className="block text-muted">Quoted {formatDate(job.quotedAt)}</span>}
          </Fact>
        </dl>
      </Card>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <Card>
          <CardHeader className="pb-4">
            <div>
              <CardTitle>Line items</CardTitle>
              <CardDescription className="mt-1">
                {job.quoteVersion != null ? (
                  <>
                    <span data-testid="quote-version" className="font-medium text-ink">
                      Quote v{job.quoteVersion}
                    </span>
                    {job.quotedAt && <> · sent {formatDateTime(job.quotedAt)}</>}
                    {job.approval && (
                      <>
                        {" "}
                        · v{job.approval.version} approved {job.approval.channel === "phone" ? "by phone" : "via link"}
                      </>
                    )}
                  </>
                ) : (
                  "Not quoted yet"
                )}
              </CardDescription>
            </div>
            {!job.can.editLines && (
              <CardDescription className="inline-flex items-center gap-1.5">
                <Lock aria-hidden className="size-3.5" />
                Locked while {STATUS_LABEL[job.status]}
              </CardDescription>
            )}
          </CardHeader>
          {requotes && (
            <Alert tone="warning" role="note" className="mx-5 mb-4">
              Changing lines creates quote v{(job.quoteVersion ?? 0) + 1}; the customer must approve again.
              {job.approval &&
                ` The earlier approval (v${job.approval.version}, ${formatCents(job.approval.totalCents)}) stays on record.`}
            </Alert>
          )}
          <LineItems jobId={job.id} lines={job.lines} canEdit={job.can.editLines} />
          <div className="border-t border-line px-5 py-5">
            <TotalsBlock {...job.totals} vatBps={job.vatBps} className="ml-auto max-w-sm" />
          </div>
          {job.quotes.length > 0 && <QuoteHistory job={job} />}
          {job.can.editLines && (
            <section aria-labelledby="add-line-heading" className="rounded-b-lg border-t border-line bg-raised/40 px-5 py-5">
              <h3 id="add-line-heading" className="mb-3 text-sm font-semibold text-ink">
                Add a line
                {requotes && (
                  <span className="font-normal text-muted"> · creates quote v{(job.quoteVersion ?? 0) + 1}</span>
                )}
              </h3>
              <LineForm jobId={job.id} />
            </section>
          )}
        </Card>

        <div className="grid gap-6">
          {/* Always mounted: revoking on a job that cannot get a new link removes the link, and the panel must stay to confirm it. */}
          <Card>
            <CardHeader>
              <CardTitle>Customer link</CardTitle>
            </CardHeader>
            <CardContent>
              <CustomerLinkPanel
                jobId={job.id}
                link={
                  job.link && {
                    created: formatDateTime(job.link.createdAt),
                    lastViewed: job.link.lastViewedAt ? formatDateTime(job.link.lastViewedAt) : null,
                  }
                }
                canCreate={job.can.createLink}
                note={
                  job.link && !job.can.createLink
                    ? `The link keeps working and shows “${CUSTOMER_STATUS_TEXT[job.status]}”.`
                    : undefined
                }
                customerPhone={job.customer.phone}
                shareText={shareText(job, vehicleName)}
              />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Timeline</CardTitle>
            </CardHeader>
            <CardContent>
              <Timeline items={toTimelineItems(job.events)} />
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0 bg-surface px-5 py-4">
      <dt className="text-sm text-muted">{label}</dt>
      <dd className="mt-1 text-sm text-ink">{children}</dd>
    </div>
  );
}

/** Every quote version the customer was sent, newest first (immutable, D-049). */
function QuoteHistory({ job }: { job: JobDetail }) {
  const n = job.quotes.length;
  return (
    <details className="group border-t border-line">
      <summary className="flex h-12 cursor-pointer items-center px-5 text-sm font-medium text-accent hover:underline">
        Quote history ({n} {n === 1 ? "version" : "versions"})
      </summary>
      <ol className="grid gap-px border-t border-rule bg-rule">
        {job.quotes.map((q) => (
          <li key={q.version} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 bg-surface px-5 py-3 text-sm">
            <span className="text-ink">
              <span className="font-medium">v{q.version}</span>
              <span className="text-muted"> · {formatDateTime(q.createdAt)}</span>
              {job.approval?.version === q.version && <span className="text-status-approved"> · Approved</span>}
            </span>
            <span className="text-muted tabular-nums">
              Net <Money cents={q.subtotalCents} className="text-ink" /> · VAT <Money cents={q.vatCents} className="text-ink" />{" "}
              · Total <Money cents={q.totalCents} className="font-medium text-ink" />
            </span>
          </li>
        ))}
      </ol>
    </details>
  );
}

function shareText(job: JobDetail, vehicleName: string): string {
  const firstName = job.customer.fullName.split(/\s+/)[0];
  return `Hi ${firstName}, here is the link for your ${vehicleName} (${formatPlate(job.vehicle.plate)}), job ${job.ref}. You can see the quote and its progress here:`;
}

/** " — v2 · {formatted total}" when the event names a quote version (quotes, re-quotes, approvals). */
function versionSuffix(e: JobEvent): string {
  if (e.quoteVersion == null) return "";
  return ` — v${e.quoteVersion}${e.totalCents != null ? ` · ${formatCents(e.totalCents)}` : ""}`;
}

/** A line change on a quoted/approved/in-progress job re-quotes automatically (D-050). */
function isAutoRequote(e: JobEvent): boolean {
  return e.toStatus === "quoted" && e.fromStatus != null && REQUOTE_ON_EDIT_STATUSES.includes(e.fromStatus);
}

function toTimelineItem(e: JobEvent): TimelineItem {
  const base = { key: e.id, at: e.createdAt, by: e.actorName, note: e.note };
  if (e.fromStatus === null) return { ...base, title: "Job created" };
  switch (e.toStatus) {
    case "quoted":
      if (isAutoRequote(e)) return { ...base, title: `Quote revised after line change${versionSuffix(e)}`, note: null };
      return { ...base, title: `${e.fromStatus === "declined" ? "New quote sent" : "Quote sent"}${versionSuffix(e)}` };
    case "approved":
      // The actor is in the title, so no separate "by".
      return e.channel === "phone"
        ? { ...base, by: undefined, title: `Phone approval recorded by ${e.actorName}${versionSuffix(e)}` }
        : { ...base, by: undefined, title: `Approved by customer via link${versionSuffix(e)}` };
    case "declined":
      return { ...base, by: undefined, title: `Declined by customer${versionSuffix(e)}`, note: e.note && `Reason: ${e.note}` };
    case "in_progress":
      return e.fromStatus === "ready"
        ? { ...base, title: "Back to work (rework)" }
        : { ...base, title: "Work started" };
    case "ready":
      return { ...base, title: "Ready for collection" };
    case "cancelled":
      return { ...base, title: "Job cancelled", note: e.note && `Reason: ${e.note}` };
    default:
      return { ...base, title: STATUS_LABEL[e.toStatus] };
  }
}

/** Consecutive automatic re-quotes collapse into one entry: "v3–v5", latest total and time (D-050). */
function toTimelineItems(events: JobEvent[]): TimelineItem[] {
  const items: TimelineItem[] = [];
  let runFrom: number | null = null; // first version of the current run of automatic re-quotes
  events.forEach((e, i) => {
    const prev = events[i - 1];
    if (isAutoRequote(e) && e.fromStatus === "quoted" && prev && isAutoRequote(prev)) {
      const total = e.totalCents != null ? ` · ${formatCents(e.totalCents)}` : "";
      items[items.length - 1] = {
        ...toTimelineItem(e),
        title: `Quote revised after line changes — v${runFrom}–v${e.quoteVersion}${total}`,
      };
      return;
    }
    runFrom = isAutoRequote(e) ? e.quoteVersion : null;
    items.push(toTimelineItem(e));
  });
  return items;
}
