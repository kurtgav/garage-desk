import {
  Banknote,
  CircleCheckBig,
  ClipboardList,
  LayoutDashboard,
  Settings,
  Users,
} from "lucide-react";
import Link from "next/link";
import { StatusSquare } from "@/components/status-badge";
import type { Staff } from "@/lib/auth";
import type { ShellData } from "@/lib/data/shell";
import { formatPlate } from "@/lib/format";
import { formatCents } from "@/lib/money";
import { STATUS_LABEL } from "@/lib/status";
import { cn } from "@/lib/utils";
import { NavLink, UserMenu } from "./shell-client";

const ROLE_LABEL = { owner: "Owner", mechanic: "Mechanic" } as const;

/** Sidebar contents (server-rendered; the frame places it in the desktop column and the phone drawer). */
export function Sidebar({ staff, shell }: { staff: Staff; shell: ShellData }) {
  const isOwner = staff.role === "owner";

  return (
    <>
      <nav
        aria-label="Main"
        className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto px-3 pt-2 pb-4"
      >
        <NavGroup label="Workshop">
          {isOwner && (
            <NavLink
              href="/dashboard"
              icon={<LayoutDashboard strokeWidth={1.5} />}
            >
              Dashboard
            </NavLink>
          )}
          <NavLink
            href="/jobs"
            icon={<ClipboardList strokeWidth={1.5} />}
            count={shell.openCount}
            countNoun="open"
          >
            Jobs
          </NavLink>
          <NavLink
            href="/jobs?status=ready"
            icon={<CircleCheckBig strokeWidth={1.5} />}
            count={shell.readyCount}
            countNoun="ready"
            tone="success"
          >
            Ready for collection
          </NavLink>
          <NavLink href="/customers" icon={<Users strokeWidth={1.5} />}>
            Customers
          </NavLink>
        </NavGroup>

        {isOwner && (
          <NavGroup label="Garage">
            <NavLink href="/settings" icon={<Settings strokeWidth={1.5} />}>
              Settings
            </NavLink>
          </NavGroup>
        )}

        {shell.recentJobs.length > 0 && (
          <NavGroup label="Recent jobs" className="mt-auto">
            {shell.recentJobs.map((job) => (
              <Link
                key={job.id}
                href={`/jobs/${job.id}`}
                className="flex h-10 items-center gap-3 rounded-md px-3 text-sm text-[#3f3f46] transition-colors duration-150 hover:bg-raised hover:text-ink"
              >
                <StatusSquare status={job.status} />
                <span className="min-w-0 flex-1 truncate">
                  {job.ref} · {formatPlate(job.plate)}
                  <span className="sr-only"> ({STATUS_LABEL[job.status]})</span>
                </span>
              </Link>
            ))}
          </NavGroup>
        )}
      </nav>

      <div className="grid shrink-0 grid-cols-[minmax(0,1fr)] gap-2 border-t border-rule p-3">
        <InfoCard isOwner={isOwner} shell={shell} />
        <UserMenu
          name={staff.fullName}
          email={staff.email}
          roleLabel={ROLE_LABEL[staff.role]}
        />
      </div>
    </>
  );
}

function NavGroup({
  label,
  className,
  children,
}: {
  label: string;
  className?: string;
  children: React.ReactNode;
}) {
  const id = `nav-${label.toLowerCase().replace(/\s+/g, "-")}`;
  return (
    <div className={cn("grid gap-0.5", className)}>
      <p
        id={id}
        className="flex h-8 items-center gap-2 px-3 text-[13px] text-faint"
      >
        <span
          aria-hidden
          className="size-3 rounded-full border border-dashed border-subtle"
        />
        {label}
      </p>
      <ul aria-labelledby={id} className="grid gap-0.5">
        {[children]
          .flat()
          .filter(Boolean)
          .map((child, i) => (
            <li key={i}>{child}</li>
          ))}
      </ul>
    </div>
  );
}

/** Owner: this month's net revenue. Mechanic: their open jobs. */
function InfoCard({ isOwner, shell }: { isOwner: boolean; shell: ShellData }) {
  const value = isOwner
    ? formatCents(shell.revenueNetCents)
    : String(shell.openCount);
  // Not "assigned to you": the jobs pages use that phrase and the e2e suite finds it by text.
  const label = isOwner
    ? "Revenue this month (net)"
    : shell.openCount === 1
      ? "My open job"
      : "My open jobs";
  const Icon = isOwner ? Banknote : ClipboardList;

  return (
    <div className="rounded-[14px] border border-line bg-surface p-2">
      <div className="px-2 pt-1.5 pb-2.5">
        <p className="flex items-center gap-2 text-[15px] font-medium text-ink tabular-nums">
          <Icon aria-hidden className="size-4 text-faint" strokeWidth={1.5} />
          {value}
        </p>
        <p className="mt-0.5 pl-6 text-[13px] text-faint">{label}</p>
      </div>
      <Link
        href={isOwner ? "/dashboard" : "/jobs"}
        className="flex h-9 items-center justify-center rounded-md bg-raised text-sm font-medium text-ink transition-colors duration-150 hover:bg-[#e9e9ec]"
      >
        {isOwner ? "View dashboard" : "View my jobs"}
      </Link>
    </div>
  );
}
