import {
  Banknote,
  CalendarDays,
  CircleCheckBig,
  ClipboardList,
  Clock,
  FileClock,
  Plus,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Money } from "@/components/money";
import { StatusBadge, StatusSquare } from "@/components/status-badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getStaff, requireOwner } from "@/lib/auth";
import { getDashboardCached } from "@/lib/data/shell";
import type { Dashboard } from "@/lib/data/types";
import { formatDate, formatPlate } from "@/lib/format";
import { OPEN_STATUSES, STATUS_LABEL, type JobStatus } from "@/lib/status";
import { cn } from "@/lib/utils";

export async function generateMetadata(): Promise<Metadata> {
  // Mechanics get the generic 404 (D-020); a static title would leak into it and confirm the page exists.
  return {
    title:
      (await getStaff())?.role === "owner" ? "Dashboard" : "Page not found",
  };
}

/** Bar segment fill per open status: the badge's text colour. */
const SEGMENT: Partial<Record<JobStatus, string>> = {
  new: "bg-status-new",
  quoted: "bg-status-quoted",
  declined: "bg-status-declined",
  approved: "bg-status-approved",
  in_progress: "bg-status-in-progress",
  ready: "bg-status-ready",
};

export default async function DashboardPage() {
  const staff = await requireOwner();
  const d = await getDashboardCached();
  const c = d.countsByStatus;
  const open = OPEN_STATUSES.reduce((sum, s) => sum + (c[s] ?? 0), 0);
  const oldestWait = Math.max(0, ...d.readyJobs.map((j) => j.daysWaiting));
  const firstName = staff.fullName.split(/\s+/)[0];
  const collected = d.revenue.jobsCount;

  return (
    <>
      <div className="mb-8 flex flex-wrap items-start justify-between gap-x-6 gap-y-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight text-balance text-ink sm:text-[30px] sm:leading-9">
            Welcome back, {firstName}!
          </h1>
          <p className="mt-1.5 text-[15px] text-faint sm:text-base">
            Here&apos;s the workshop today.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <p className="inline-flex h-11 items-center gap-2 rounded-md border border-edge bg-surface px-3.5 text-[15px] text-ink">
            <CalendarDays
              aria-hidden
              className="size-4 text-faint"
              strokeWidth={1.5}
            />
            <span className="sr-only">Today: </span>
            {formatDate(new Date().toISOString())}
          </p>
          <Link
            href="/jobs/new"
            className={buttonVariants({ className: "h-11" })}
          >
            <Plus aria-hidden />
            New job
          </Link>
        </div>
      </div>

      <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi
          icon={Banknote}
          label="Revenue this month"
          footerTone="success"
          footer={`${collected} ${collected === 1 ? "job" : "jobs"} collected`}
        >
          <span data-testid="revenue-net">
            <Money cents={d.revenue.netCents} />
          </span>
          <span className="ml-1.5 text-sm font-normal tracking-normal text-faint">
            net
          </span>
        </Kpi>
        <Kpi
          icon={ClipboardList}
          label="Open jobs"
          footer={`${c.in_progress ?? 0} in progress`}
        >
          <span data-testid="count-open">{open}</span>
        </Kpi>
        <Kpi
          icon={FileClock}
          label="Awaiting approval"
          footerTone={c.declined ? "danger" : undefined}
          footer={
            c.declined
              ? `${c.declined} declined ${c.declined === 1 ? "quote" : "quotes"}`
              : "None declined"
          }
        >
          <span data-testid="count-quoted">{c.quoted ?? 0}</span>
        </Kpi>
        <Kpi
          icon={CircleCheckBig}
          label="Ready for collection"
          footer={
            d.readyJobs.length === 0
              ? "No cars waiting"
              : `Oldest waiting ${waiting(oldestWait).toLowerCase()}`
          }
        >
          <span data-testid="count-ready">{c.ready ?? 0}</span>
        </Kpi>
      </ul>

      <ReadyList jobs={d.readyJobs} />
      <Workload rows={d.workload} />
    </>
  );
}

type KpiProps = {
  icon: typeof Banknote;
  label: string;
  footer: string;
  footerTone?: "success" | "danger";
  children: React.ReactNode;
};

/** Nested KPI card (docs/DESIGN.md): grey shell, white card with the figure, a footer fact underneath. */
function Kpi({ icon: Icon, label, footer, footerTone, children }: KpiProps) {
  return (
    <li className="flex min-w-0 flex-col rounded-[18px] bg-raised p-1.5">
      <div className="flex-1 rounded-lg border border-line bg-surface p-4">
        <h2 className="flex items-center gap-2 text-[15px] font-normal text-muted">
          <span
            aria-hidden
            className="grid size-7 shrink-0 place-items-center rounded-[8px] border border-line bg-surface text-ink"
          >
            <Icon className="size-4" strokeWidth={1.5} />
          </span>
          {label}
        </h2>
        <p className="mt-3 truncate text-[32px] leading-10 font-medium tracking-tight text-ink tabular-nums">
          {children}
        </p>
      </div>
      <p className="flex items-start gap-2 px-2.5 pt-2.5 pb-1.5 text-sm">
        <Glyph />
        <span
          className={cn(
            "min-w-0 flex-1",
            footerTone === "success"
              ? "text-success"
              : footerTone === "danger"
                ? "text-danger"
                : "text-muted",
          )}
        >
          {footer}
        </span>
        <Glyph />
      </p>
    </li>
  );
}

/** The reference's small dashed circle (decorative). */
function Glyph() {
  return (
    <span
      aria-hidden
      className="mt-[3px] size-3.5 shrink-0 rounded-full border border-dashed border-subtle"
    />
  );
}

function ReadyList({ jobs }: { jobs: Dashboard["readyJobs"] }) {
  return (
    <Card className="mt-6 rounded-2xl">
      <CardHeader className="items-center pb-4">
        <CardTitle>Ready for collection</CardTitle>
        {jobs.length > 0 && (
          <Link
            href="/jobs?status=ready"
            className="text-[15px] text-ink underline underline-offset-4 decoration-subtle hover:decoration-ink"
          >
            View all
          </Link>
        )}
      </CardHeader>
      {jobs.length === 0 ? (
        <div className="px-5 pb-5">
          <EmptyState
            title="No cars waiting"
            description="Jobs marked ready for collection show up here."
          />
        </div>
      ) : (
        <div className="px-3 pb-3 sm:px-4 sm:pb-4">
          <Table className="[&_td]:px-3 [&_th]:px-3">
            <TableCaption className="sr-only">
              Jobs ready for collection, longest waiting first
            </TableCaption>
            <TableHeader>
              <TableRow>
                <TableHead scope="col">Job</TableHead>
                <TableHead scope="col" className="hidden sm:table-cell">
                  Customer
                </TableHead>
                <TableHead scope="col" className="hidden sm:table-cell">
                  Plate
                </TableHead>
                <TableHead scope="col">Waiting</TableHead>
                <TableHead scope="col" className="text-right">
                  Total
                </TableHead>
                <TableHead scope="col" className="hidden lg:table-cell">
                  Status
                </TableHead>
                <TableHead scope="col" className="hidden md:table-cell">
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {jobs.map((job) => (
                <TableRow key={job.id}>
                  <TableCell>
                    <span className="flex items-center gap-2.5">
                      <StatusSquare status="ready" />
                      <Link
                        href={`/jobs/${job.id}`}
                        className="font-medium whitespace-nowrap hover:underline"
                      >
                        {job.ref}
                      </Link>
                    </span>
                    <span className="block pl-7.5 text-sm text-faint sm:hidden">
                      {job.customerName} ·{" "}
                      <span className="whitespace-nowrap">
                        {formatPlate(job.plate)}
                      </span>
                    </span>
                  </TableCell>
                  <TableCell className="hidden min-w-36 sm:table-cell">
                    {job.customerName}
                  </TableCell>
                  <TableCell className="hidden whitespace-nowrap text-muted sm:table-cell">
                    {formatPlate(job.plate)}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-muted">
                    <span className="inline-flex items-center gap-1.5">
                      <Clock
                        aria-hidden
                        className="size-4 text-faint"
                        strokeWidth={1.5}
                      />
                      {waiting(job.daysWaiting)}
                    </span>
                  </TableCell>
                  <TableCell className="text-right font-medium">
                    <Money cents={job.totalCents} />
                  </TableCell>
                  <TableCell className="hidden lg:table-cell">
                    <StatusBadge status="ready" />
                  </TableCell>
                  <TableCell className="hidden text-right md:table-cell">
                    {/* Mouse shortcut only: the job ref is the link for keyboard and screen readers. */}
                    <Link
                      href={`/jobs/${job.id}`}
                      tabIndex={-1}
                      aria-hidden
                      className="text-muted hover:text-ink"
                    >
                      View
                    </Link>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </Card>
  );
}

function waiting(days: number): string {
  if (days <= 0) return "Today";
  return days === 1 ? "1 day" : `${days} days`;
}

function Workload({ rows }: { rows: Dashboard["workload"] }) {
  const max = Math.max(1, ...rows.map((r) => r.totalOpen));
  return (
    <Card className="mt-6 rounded-2xl">
      <CardHeader className="pb-4">
        <CardTitle>Mechanic workload</CardTitle>
      </CardHeader>
      {rows.length === 0 ? (
        <div className="px-5 pb-5">
          <EmptyState title="No active mechanics" />
        </div>
      ) : (
        <ul className="grid gap-3 px-3 pb-3 sm:grid-cols-2 sm:px-4 sm:pb-4 xl:grid-cols-4">
          {rows.map((r) => (
            <MechanicCard key={r.mechanicId} row={r} max={max} />
          ))}
        </ul>
      )}
    </Card>
  );
}

function MechanicCard({
  row,
  max,
}: {
  row: Dashboard["workload"][number];
  max: number;
}) {
  const parts = OPEN_STATUSES.map((s) => ({
    s,
    count: row.byStatus[s] ?? 0,
  })).filter((p) => p.count > 0);
  const inProgress = row.byStatus.in_progress ?? 0;
  return (
    <li className="min-w-0 rounded-2xl border border-line bg-surface p-2">
      <div className="relative flex h-32 flex-col justify-end rounded-lg bg-raised px-4 pt-3 pb-4">
        <span
          className={cn(
            "absolute top-2.5 right-2.5 rounded-full bg-surface px-2 py-0.5 text-[13px]",
            inProgress > 0 ? "text-status-in-progress" : "text-muted",
          )}
        >
          {inProgress > 0 ? "Working" : "Free"}
        </span>
        <p className="text-[32px] leading-10 font-medium tracking-tight text-ink tabular-nums">
          {row.totalOpen}
          <span className="ml-1.5 text-sm font-normal tracking-normal text-faint">
            open
          </span>
        </p>
        {/* Visual only: length is open jobs against the busiest mechanic; the chips below carry the numbers. */}
        <div aria-hidden className="mt-2 h-1.5 rounded-full bg-surface">
          <div
            className="flex h-full overflow-hidden rounded-full"
            style={{ width: `${(row.totalOpen / max) * 100}%` }}
          >
            {parts.map((p) => (
              <span
                key={p.s}
                className={SEGMENT[p.s]}
                style={{ width: `${(p.count / row.totalOpen) * 100}%` }}
              />
            ))}
          </div>
        </div>
      </div>
      <div className="px-2 pt-3">
        <h3 className="truncate text-[17px] font-medium text-ink">
          {row.mechanicName}
        </h3>
        <p className="mt-0.5 text-sm text-faint">
          {inProgress} in progress <span aria-hidden>•</span>{" "}
          {row.totalOpen - inProgress} waiting
        </p>
      </div>
      <div className="flex items-end justify-between gap-2 px-2 pt-3 pb-1">
        {parts.length === 0 ? (
          <p className="text-sm text-faint">No open jobs</p>
        ) : (
          <ul className="flex min-w-0 flex-wrap gap-1.5">
            {parts.map((p) => (
              <li
                key={p.s}
                className="inline-flex h-7 items-center gap-1.5 rounded-md border border-line px-2 text-[13px] whitespace-nowrap text-muted"
              >
                <span
                  aria-hidden
                  className={cn("size-1.5 rounded-full", SEGMENT[p.s])}
                />
                <span className="font-medium text-ink tabular-nums">
                  {p.count}
                </span>{" "}
                {STATUS_LABEL[p.s]}
              </li>
            ))}
          </ul>
        )}
      </div>
    </li>
  );
}
