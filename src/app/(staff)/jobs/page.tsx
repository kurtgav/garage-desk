import { Plus, X } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Money } from "@/components/money";
import { StatusBadge, StatusSquare } from "@/components/status-badge";
import { buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { requireStaff } from "@/lib/auth";
import { getMechanicName, listJobs } from "@/lib/data/jobs";
import { formatDate, formatPlate } from "@/lib/format";
import { garageMonthBounds } from "@/lib/period";
import {
  JOB_STATUSES,
  OPEN_STATUSES,
  STATUS_LABEL,
  type JobStatus,
} from "@/lib/status";
import { cn } from "@/lib/utils";
import { jobsHref, parseJobFilters, type JobFilters } from "./filters";

export const metadata: Metadata = { title: "Jobs" };

const FILTERS: { status?: JobStatus; label: string }[] = [
  { label: "Open" },
  ...JOB_STATUSES.map((status) => ({ status, label: STATUS_LABEL[status] })),
];

export default async function JobsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const staff = await requireStaff();
  const isOwner = staff.role === "owner";
  const parsed = parseJobFilters(await searchParams, isOwner);
  const mechanicName = parsed.mechanicId ? await getMechanicName(parsed.mechanicId) : null;
  // An unknown mechanic id is dropped like any other invalid parameter.
  const filters = { ...parsed, mechanicId: mechanicName ? parsed.mechanicId : undefined };
  const { status, mechanicId, thisMonth } = filters;
  // Same Europe/Sofia month as the dashboard's revenue figure (D-090).
  const month = thisMonth ? garageMonthBounds() : undefined;

  // shortcut: "Open" filters the full list in memory; add a status-set filter to listJobs if the list grows past a few hundred jobs.
  const all = await listJobs({ status, mechanicId, collectedFrom: month?.start, collectedTo: month?.end });
  const jobs = status ? all : all.filter((j) => OPEN_STATUSES.includes(j.status));

  const scope = mechanicName ?? (isOwner ? "All mechanics" : "Assigned to you");
  const noun = jobs.length === 1 ? "job" : "jobs";
  const count = `${jobs.length} ${status ? STATUS_LABEL[status].toLowerCase() : "open"} ${noun}${thisMonth ? " this month" : ""}`;
  const chips = [
    mechanicName && { label: `Mechanic: ${mechanicName}`, href: jobsHref({ ...filters, mechanicId: undefined }) },
    thisMonth && { label: "Collected this month", href: jobsHref({ ...filters, thisMonth: undefined }) },
  ].filter((c) => !!c);

  return (
    <>
      <PageHeader
        title="Jobs"
        description={
          <>
            {scope} · <span data-testid="jobs-count">{count}</span>, newest first
          </>
        }
        actions={
          <Link href="/jobs/new" className={buttonVariants()}>
            <Plus aria-hidden />
            New job
          </Link>
        }
      />

      {/* Plain links: the filter lives in the URL (?status=), so it is shareable and needs no client state. */}
      <nav aria-label="Filter jobs by status" className="mb-6 overflow-x-auto">
        <ul className="flex w-max gap-1 rounded-[14px] bg-raised p-1">
          {FILTERS.map((f) => {
            const active = f.status === status;
            return (
              <li key={f.label}>
                <Link
                  href={jobsHref({ ...filters, status: f.status })}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "inline-flex h-9 items-center rounded-[10px] px-3 text-sm whitespace-nowrap transition-colors duration-150",
                    active
                      ? "bg-surface font-medium text-ink shadow-[0_1px_2px_rgb(24_24_27/0.08),0_0_0_1px_rgb(24_24_27/0.06)]"
                      : "text-muted hover:text-ink",
                  )}
                >
                  {f.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {chips.length > 0 && (
        <ul aria-label="Active filters" className="-mt-2 mb-6 flex flex-wrap gap-2">
          {chips.map((c) => (
            <li key={c.label}>
              <Link
                href={c.href}
                aria-label={`Remove filter ${c.label}`}
                className="inline-flex h-8 items-center gap-1.5 rounded-full border border-edge bg-surface pr-2 pl-3 text-sm text-ink transition-colors duration-150 hover:border-control/40 hover:bg-raised"
              >
                {c.label}
                <X aria-hidden className="size-3.5 text-faint" />
              </Link>
            </li>
          ))}
        </ul>
      )}

      {jobs.length === 0 ? (
        <JobsEmpty filters={filters} mechanicName={mechanicName} isOwner={isOwner} />
      ) : (
        <>
          {/* Tablet and up: a table. */}
          <div className="hidden rounded-2xl border border-line bg-surface p-3 md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead scope="col">Job</TableHead>
                  <TableHead scope="col">Vehicle</TableHead>
                  <TableHead scope="col">Customer</TableHead>
                  {isOwner && <TableHead scope="col">Mechanic</TableHead>}
                  <TableHead scope="col">Status</TableHead>
                  <TableHead scope="col" className="text-right">
                    Total
                  </TableHead>
                  <TableHead scope="col" className="text-right">
                    Created
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {jobs.map((job) => (
                  <TableRow key={job.id}>
                    <TableCell>
                      <span className="flex items-center gap-2.5">
                        <StatusSquare status={job.status} />
                        <Link
                          href={`/jobs/${job.id}`}
                          className="font-medium whitespace-nowrap hover:underline"
                        >
                          {job.ref}
                        </Link>
                      </span>
                    </TableCell>
                    <TableCell>
                      <p className="font-medium whitespace-nowrap text-ink">
                        {formatPlate(job.plate)}
                      </p>
                      <p className="text-sm text-faint">{job.vehicleLabel}</p>
                    </TableCell>
                    <TableCell className="text-ink">
                      {job.customerName}
                    </TableCell>
                    {isOwner && (
                      <TableCell className="text-muted">
                        {job.mechanicName}
                      </TableCell>
                    )}
                    <TableCell>
                      <StatusBadge status={job.status} />
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      <Money cents={job.totalCents} />
                    </TableCell>
                    <TableCell className="text-right whitespace-nowrap text-muted">
                      <time dateTime={job.createdAt}>
                        {formatDate(job.createdAt)}
                      </time>
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
                  className="block rounded-xl border border-line bg-surface p-4 transition-colors duration-150 hover:bg-ground active:bg-raised"
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="flex items-center gap-2.5 font-medium text-ink">
                      <StatusSquare status={job.status} />
                      {job.ref}
                    </span>
                    <StatusBadge status={job.status} />
                  </div>
                  <div className="mt-2 flex items-baseline justify-between gap-3">
                    <p className="min-w-0 truncate text-ink">
                      <span className="font-medium">
                        {formatPlate(job.plate)}
                      </span>{" "}
                      · {job.vehicleLabel}
                    </p>
                    <Money
                      cents={job.totalCents}
                      className="font-medium text-ink"
                    />
                  </div>
                  <p className="mt-1 text-sm text-faint">
                    {job.customerName}
                    {isOwner && ` · ${job.mechanicName}`} ·{" "}
                    {formatDate(job.createdAt)}
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

function JobsEmpty({
  filters: { status, thisMonth },
  mechanicName,
  isOwner,
}: {
  filters: JobFilters;
  mechanicName: string | null;
  isOwner: boolean;
}) {
  if (mechanicName || thisMonth) {
    const what = `No ${status ? STATUS_LABEL[status].toLowerCase() : "open"} jobs`;
    return (
      <EmptyState
        title={`${what}${mechanicName ? ` for ${mechanicName}` : ""}${thisMonth ? " this month" : ""}`}
        description="Remove a filter above to see more."
        action={
          <Link href="/jobs" className={buttonVariants({ variant: "secondary" })}>
            Show all open jobs
          </Link>
        }
      />
    );
  }
  if (status) {
    return (
      <EmptyState
        title={`No ${STATUS_LABEL[status].toLowerCase()} jobs${isOwner ? "" : " assigned to you"}`}
        description="Jobs show up here when they reach this status."
        action={
          <Link
            href="/jobs"
            className={buttonVariants({ variant: "secondary" })}
          >
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
