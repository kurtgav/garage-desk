import { Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Money } from "@/components/money";
import { StatusBadge } from "@/components/status-badge";
import { buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireStaff } from "@/lib/auth";
import { listJobs } from "@/lib/data/jobs";
import { formatDate, formatPlate } from "@/lib/format";
import { isJobStatus, JOB_STATUSES, OPEN_STATUSES, STATUS_LABEL, type JobStatus } from "@/lib/status";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Jobs" };

const FILTERS: { status?: JobStatus; label: string }[] = [
  { label: "Open" },
  ...JOB_STATUSES.map((status) => ({ status, label: STATUS_LABEL[status] })),
];

export default async function JobsPage({ searchParams }: { searchParams: Promise<{ status?: string | string[] }> }) {
  const staff = await requireStaff();
  const { status: raw } = await searchParams;
  const status = isJobStatus(raw) ? raw : undefined;
  // shortcut: "Open" filters the full list in memory; add a status-set filter to listJobs if the list grows past a few hundred jobs.
  const jobs = status ? await listJobs({ status }) : (await listJobs()).filter((j) => OPEN_STATUSES.includes(j.status));
  const isOwner = staff.role === "owner";

  const scope = isOwner ? "All mechanics" : "Assigned to you";
  const noun = jobs.length === 1 ? "job" : "jobs";
  const count = `${jobs.length} ${status ? STATUS_LABEL[status].toLowerCase() : "open"} ${noun}`;

  return (
    <>
      <PageHeader
        title="Jobs"
        description={`${scope} · ${count}, newest first`}
        actions={
          <Link href="/jobs/new" className={buttonVariants()}>
            <Plus aria-hidden />
            New job
          </Link>
        }
      />

      {/* Plain links: the filter lives in the URL (?status=), so it is shareable and needs no client state. */}
      <nav aria-label="Filter jobs by status" className="mb-6 overflow-x-auto border-b border-line">
        <ul className="flex min-w-max gap-1">
          {FILTERS.map((f) => {
            const active = f.status === status;
            return (
              <li key={f.label}>
                <Link
                  href={f.status ? `/jobs?status=${f.status}` : "/jobs"}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "-mb-px inline-flex h-11 items-center border-b-2 px-3 text-sm font-medium whitespace-nowrap transition-colors duration-150",
                    active ? "border-accent text-ink" : "border-transparent text-muted hover:text-ink",
                  )}
                >
                  {f.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {jobs.length === 0 ? (
        <JobsEmpty status={status} isOwner={isOwner} />
      ) : (
        <>
          {/* Tablet and up: a table. */}
          <div className="hidden rounded-lg border border-line bg-surface md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead scope="col" className="pl-5">
                    Job
                  </TableHead>
                  <TableHead scope="col">Vehicle</TableHead>
                  <TableHead scope="col">Customer</TableHead>
                  {isOwner && <TableHead scope="col">Mechanic</TableHead>}
                  <TableHead scope="col">Status</TableHead>
                  <TableHead scope="col" className="text-right">
                    Total
                  </TableHead>
                  <TableHead scope="col" className="pr-5 text-right">
                    Created
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {jobs.map((job) => (
                  <TableRow key={job.id} className="transition-colors duration-150 hover:bg-raised/50">
                    <TableCell className="pl-5">
                      <Link href={`/jobs/${job.id}`} className="font-medium whitespace-nowrap text-accent hover:underline">
                        {job.ref}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <p className="font-medium whitespace-nowrap text-ink">{formatPlate(job.plate)}</p>
                      <p className="text-muted">{job.vehicleLabel}</p>
                    </TableCell>
                    <TableCell className="text-ink">{job.customerName}</TableCell>
                    {isOwner && <TableCell className="text-muted">{job.mechanicName}</TableCell>}
                    <TableCell>
                      <StatusBadge status={job.status} />
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      <Money cents={job.totalCents} />
                    </TableCell>
                    <TableCell className="pr-5 text-right whitespace-nowrap text-muted">
                      <time dateTime={job.createdAt}>{formatDate(job.createdAt)}</time>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Phones: one tappable card per job. */}
          <ul className="grid grid-cols-1 gap-3 md:hidden">
            {jobs.map((job) => (
              <li key={job.id}>
                <Link
                  href={`/jobs/${job.id}`}
                  className="block rounded-lg border border-line bg-surface p-4 transition-colors duration-150 active:bg-raised"
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-medium text-accent">{job.ref}</span>
                    <StatusBadge status={job.status} />
                  </div>
                  <div className="mt-2 flex items-baseline justify-between gap-3">
                    <p className="min-w-0 truncate text-ink">
                      <span className="font-medium">{formatPlate(job.plate)}</span> · {job.vehicleLabel}
                    </p>
                    <Money cents={job.totalCents} className="font-medium text-ink" />
                  </div>
                  <p className="mt-1 text-sm text-muted">
                    {job.customerName}
                    {isOwner && ` · ${job.mechanicName}`} · {formatDate(job.createdAt)}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}

function JobsEmpty({ status, isOwner }: { status?: JobStatus; isOwner: boolean }) {
  if (status) {
    return (
      <EmptyState
        title={`No ${STATUS_LABEL[status].toLowerCase()} jobs`}
        description="Jobs show up here when they reach this status."
        action={
          <Link href="/jobs" className={buttonVariants({ variant: "secondary" })}>
            Show open jobs
          </Link>
        }
      />
    );
  }
  return (
    <EmptyState
      title={isOwner ? "No open jobs" : "No open jobs assigned to you"}
      description={
        isOwner
          ? "Create a job for a customer's car, then add labour and parts to build the quote."
          : "Jobs the owner assigns to you, and jobs you create, show up here."
      }
      action={
        <Link href="/jobs/new" className={buttonVariants()}>
          <Plus aria-hidden />
          New job
        </Link>
      }
    />
  );
}
