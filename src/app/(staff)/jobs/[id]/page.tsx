import { ChevronLeft, Lock } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import { StatusBadge } from "@/components/status-badge";
import { Timeline, type TimelineItem } from "@/components/timeline";
import { TotalsBlock } from "@/components/totals-block";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireStaff } from "@/lib/auth";
import { getJob } from "@/lib/data/jobs";
import type { JobDetail, JobEvent } from "@/lib/data/types";
import { formatDate, formatDateTime, formatPhone, formatPlate } from "@/lib/format";
import { LINKABLE_STATUSES, STATUS_LABEL, type JobStatus } from "@/lib/status";
import { CustomerLinkPanel } from "./customer-link-panel";
import { LineForm, LineItems } from "./line-items";
import { StatusActions } from "./status-actions";

type Props = { params: Promise<{ id: string }> };

// One DB read per request for both the title and the page (getJob returns null for malformed ids too).
const loadJob = cache(getJob);

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const job = await loadJob((await params).id);
  return { title: job?.ref ?? "Page not found" };
}

export default async function JobPage({ params }: Props) {
  await requireStaff();
  const job = await loadJob((await params).id);
  // Missing, malformed and another mechanic's job all end here (FR1 AC, D-020): the same generic 404.
  if (!job) notFound();

  const isNew = job.status === "new";
  const linkable = LINKABLE_STATUSES.includes(job.status);
  const vehicleName = [job.vehicle.make, job.vehicle.model].join(" ");

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
        <StatusActions jobId={job.id} status={job.status} hasLines={job.lines.length > 0} />
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
            {job.customer.fullName}
            <a href={`tel:${job.customer.phone}`} className="block w-fit text-accent hover:underline">
              {formatPhone(job.customer.phone)}
            </a>
          </Fact>
          <Fact label="Mechanic">{job.mechanic.fullName}</Fact>
          <Fact label="Created">
            {formatDate(job.createdAt)}
            {job.quotedAt && <span className="block text-muted">Quoted {formatDate(job.quotedAt)}</span>}
          </Fact>
        </dl>
      </Card>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <Card>
          <CardHeader className="pb-4">
            <CardTitle>Line items</CardTitle>
            {!isNew && (
              <CardDescription className="inline-flex items-center gap-1.5">
                <Lock aria-hidden className="size-3.5" />
                Locked since the quote was sent
              </CardDescription>
            )}
          </CardHeader>
          <LineItems jobId={job.id} lines={job.lines} canEdit={job.canEditLines} />
          <div className="border-t border-line px-5 py-5">
            <TotalsBlock
              {...job.totals}
              vatBps={job.vatBps}
              totalLabel={isNew ? "Total" : "Quoted total (frozen)"}
              className="ml-auto max-w-sm"
            />
          </div>
          {job.canEditLines && (
            <section aria-labelledby="add-line-heading" className="rounded-b-lg border-t border-line bg-raised/40 px-5 py-5">
              <h3 id="add-line-heading" className="mb-3 text-sm font-semibold text-ink">
                Add a line
              </h3>
              <LineForm jobId={job.id} />
            </section>
          )}
        </Card>

        <div className="grid gap-6">
          {/* Always mounted: revoking on a New or Collected job removes the link, and the panel must stay to confirm it. */}
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
                canCreate={linkable}
                note={job.link ? LINK_NOTE[job.status] : undefined}
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
              <Timeline items={job.events.map(toTimelineItem)} />
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

/** What an existing link shows while the job is outside LINKABLE_STATUSES (D-015, D-023). */
const LINK_NOTE: Partial<Record<JobStatus, string>> = {
  new: "The customer's link shows “Your quote is being revised” until you send the quote again.",
  collected: "The customer can still open the link for 30 days after collection.",
};

function shareText(job: JobDetail, vehicleName: string): string {
  const firstName = job.customer.fullName.split(/\s+/)[0];
  return `Hi ${firstName}, here is the link for your ${vehicleName} (${formatPlate(job.vehicle.plate)}), job ${job.ref}. You can see the quote and its progress here:`;
}

const EVENT_TITLE: Partial<Record<JobEvent["toStatus"], string>> = {
  quoted: "Quote sent",
  approved: "Quote approved",
  in_progress: "Work started",
  ready: "Ready for collection",
  collected: "Collected",
};

function toTimelineItem(e: JobEvent): TimelineItem {
  const declined = e.toStatus === "new" && e.actorType === "customer";
  const title =
    e.fromStatus === null
      ? "Job created"
      : e.toStatus === "new"
        ? declined
          ? "Quote declined"
          : "Quote reopened for changes"
        : (EVENT_TITLE[e.toStatus] ?? STATUS_LABEL[e.toStatus]);
  return {
    key: e.id,
    title,
    at: e.createdAt,
    by: e.actorName,
    note: e.note ? `${declined ? "Reason" : "Note"}: ${e.note}` : null,
  };
}
