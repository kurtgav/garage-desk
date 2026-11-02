import { Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Money } from "@/components/money";
import { StatusBadge } from "@/components/status-badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getStaff, requireOwner } from "@/lib/auth";
import { getDashboard } from "@/lib/data/dashboard";
import type { Dashboard } from "@/lib/data/types";
import { formatPlate, GARAGE_TZ } from "@/lib/format";
import { JOB_STATUSES, STATUS_LABEL, type JobStatus } from "@/lib/status";
import { cn } from "@/lib/utils";

export async function generateMetadata(): Promise<Metadata> {
  // Mechanics get the generic 404 (D-020); a static title would leak into it and confirm the page exists.
  return { title: (await getStaff())?.role === "owner" ? "Dashboard" : "Page not found" };
}

const monthFmt = new Intl.DateTimeFormat("en-PH", { timeZone: GARAGE_TZ, month: "long", year: "numeric" });

/** Open = every status except collected (FR8). */
const OPEN_STATUSES = JOB_STATUSES.filter((s) => s !== "collected");

/** Bar segment fill per status: the badge's text colour, so the column header dots double as the legend. */
const SEGMENT: Record<JobStatus, string> = {
  new: "bg-status-new",
  quoted: "bg-status-quoted",
  approved: "bg-status-approved",
  in_progress: "bg-status-in-progress",
  ready: "bg-status-ready",
  collected: "bg-status-collected",
};

const edges = "[&_td:first-child]:pl-5 [&_th:first-child]:pl-5 [&_td:last-child]:pr-5 [&_th:last-child]:pr-5";

export default async function DashboardPage() {
  await requireOwner();
  const d = await getDashboard();
  const month = monthFmt.format(new Date(d.revenue.monthStart));

  return (
    <>
      <PageHeader
        title="Dashboard"
        description={month}
        actions={
          <Link href="/jobs/new" className={buttonVariants()}>
            <Plus aria-hidden />
            New job
          </Link>
        }
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <RevenueCard revenue={d.revenue} month={month} />
        <StatusCounts counts={d.countsByStatus} />
      </div>

      <div className="mt-6 grid items-start gap-6 lg:grid-cols-2">
        <ReadyList jobs={d.readyJobs} />
        <Workload rows={d.workload} />
      </div>
    </>
  );
}

function RevenueCard({ revenue, month }: { revenue: Dashboard["revenue"]; month: string }) {
  const n = revenue.jobsCount;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Revenue this month</CardTitle>
        <CardDescription>{month}</CardDescription>
      </CardHeader>
      <CardContent>
        <p data-testid="revenue-excl-vat" className="text-4xl font-semibold tracking-tight text-ink tabular-nums">
          <Money cents={revenue.exclVatCents} />
        </p>
        <p className="mt-1 text-sm text-muted">excl. VAT</p>
        <p className="mt-4 text-sm text-ink">
          <span data-testid="revenue-incl-vat" className="font-medium tabular-nums">
            <Money cents={revenue.inclVatCents} />
          </span>{" "}
          <span className="text-muted">incl. VAT</span>
        </p>
        <p className="mt-1 text-sm text-muted">
          From {n} {n === 1 ? "job" : "jobs"} collected this month
        </p>
      </CardContent>
    </Card>
  );
}

function StatusCounts({ counts }: { counts: Dashboard["countsByStatus"] }) {
  return (
    <Card className="lg:col-span-2">
      <CardHeader className="pb-4">
        <CardTitle>Jobs by status</CardTitle>
        <Link href="/jobs" className="text-sm font-medium text-accent hover:underline">
          All jobs
        </Link>
      </CardHeader>
      <ul className="grid grid-cols-2 gap-px overflow-hidden rounded-b-lg border-t border-line bg-rule sm:grid-cols-3">
        {JOB_STATUSES.map((status) => (
          <li key={status} className="bg-surface">
            <Link
              href={`/jobs?status=${status}`}
              className="flex h-full flex-col items-start gap-2 px-5 py-4 transition-colors duration-150 hover:bg-raised/60"
            >
              <span data-testid={`count-${status}`} className="text-2xl font-semibold text-ink tabular-nums">
                {counts[status] ?? 0}
              </span>
              <StatusBadge status={status} />
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function ReadyList({ jobs }: { jobs: Dashboard["readyJobs"] }) {
  return (
    <Card>
      <CardHeader className="pb-4">
        <CardTitle>Ready for collection</CardTitle>
        <CardDescription>{jobs.length > 0 ? "Longest waiting first" : null}</CardDescription>
      </CardHeader>
      {jobs.length === 0 ? (
        <CardContent className="pt-0">
          <EmptyState title="No cars waiting" description="Jobs marked ready for collection show up here." />
        </CardContent>
      ) : (
        <Table className={edges}>
          <TableCaption className="sr-only">Jobs ready for collection, longest waiting first</TableCaption>
          <TableHeader>
            <TableRow>
              <TableHead scope="col">Job</TableHead>
              <TableHead scope="col">Customer</TableHead>
              <TableHead scope="col" className="text-right">
                Total
              </TableHead>
              <TableHead scope="col" className="text-right">
                Waiting
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {jobs.map((job) => (
              <TableRow key={job.id}>
                <TableCell>
                  <Link href={`/jobs/${job.id}`} className="font-medium whitespace-nowrap text-accent hover:underline">
                    {job.ref}
                  </Link>
                  <span className="block whitespace-nowrap text-muted">{formatPlate(job.plate)}</span>
                </TableCell>
                <TableCell className="text-ink">{job.customerName}</TableCell>
                <TableCell className="text-right font-medium">
                  <Money cents={job.totalCents} />
                </TableCell>
                <TableCell className="text-right whitespace-nowrap">{waiting(job.daysWaiting)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
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
    <Card>
      <CardHeader className="pb-4">
        <CardTitle>Mechanic workload</CardTitle>
        <CardDescription>Open jobs by status</CardDescription>
      </CardHeader>
      {rows.length === 0 ? (
        <CardContent className="pt-0">
          <EmptyState title="No active mechanics" />
        </CardContent>
      ) : (
        <ul className="divide-y divide-rule border-t border-line">
          {rows.map((r) => {
            const parts = OPEN_STATUSES.map((s) => ({ s, count: r.byStatus[s] ?? 0 })).filter((p) => p.count > 0);
            return (
              <li key={r.mechanicId} className="px-5 py-4">
                <div className="flex items-baseline justify-between gap-4">
                  <span className="font-medium text-ink">{r.mechanicName}</span>
                  <span className="text-sm whitespace-nowrap text-muted tabular-nums">
                    <span className="font-semibold text-ink">{r.totalOpen}</span> open
                  </span>
                </div>
                {/* Visual only: the bar's length is open jobs against the busiest mechanic; the text below carries the numbers. */}
                <div aria-hidden className="mt-2 h-2 rounded-full bg-raised">
                  <div className="flex h-full overflow-hidden rounded-full" style={{ width: `${(r.totalOpen / max) * 100}%` }}>
                    {parts.map((p) => (
                      <span key={p.s} className={SEGMENT[p.s]} style={{ width: `${(p.count / r.totalOpen) * 100}%` }} />
                    ))}
                  </div>
                </div>
                {parts.length === 0 ? (
                  <p className="mt-2 text-sm text-muted">No open jobs</p>
                ) : (
                  <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted">
                    {parts.map((p) => (
                      <li key={p.s} className="inline-flex items-center gap-1.5 whitespace-nowrap">
                        <span aria-hidden className={cn("size-2 rounded-full", SEGMENT[p.s])} />
                        <span className="font-medium text-ink tabular-nums">{p.count}</span> {STATUS_LABEL[p.s]}
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
