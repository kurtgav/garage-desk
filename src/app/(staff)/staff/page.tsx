import type { Metadata } from "next";
import Link from "next/link";
import { Avatar } from "@/components/avatar";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/ui/page-header";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getStaff, requireOwner } from "@/lib/auth";
import type { StaffMember } from "@/lib/data/types";
import { listStaff } from "@/lib/data/staff";
import { jobsHref } from "../jobs/filters";
import { AddMechanic, StaffRowActions } from "./staff-forms";

export async function generateMetadata(): Promise<Metadata> {
  // Mechanics get the generic 404 (D-020); a static title would leak into it and confirm the page exists.
  return { title: (await getStaff())?.role === "owner" ? "Staff" : "Page not found" };
}

const ROLE_LABEL = { owner: "Owner", mechanic: "Mechanic" } as const;

/** Owner only (PLAN Phase 5). The server actions and DB guards repeat every rule shown here. */
export default async function StaffPage() {
  const me = await requireOwner();
  const staff = await listStaff();
  const activeOwners = staff.filter((s) => s.role === "owner" && s.active).length;
  const active = staff.filter((s) => s.active).length;

  // Never yourself, never the last active owner (the DB refuses both too).
  const rowActions = (s: StaffMember) => (
    <StaffRowActions
      member={{ id: s.id, fullName: s.fullName, active: s.active, openJobs: s.openJobs }}
      canToggle={s.id !== me.id && !(s.role === "owner" && s.active && activeOwners <= 1)}
      canReset={s.role !== "owner"}
    />
  );

  return (
    <>
      <PageHeader
        title="Staff"
        description={`${active} active · ${staff.length - active} inactive`}
        actions={<AddMechanic />}
      />

      <div className="hidden rounded-2xl border border-line bg-surface p-3 md:block">
        <Table className="[&_td]:px-3 [&_th]:px-3">
          <TableCaption className="sr-only">Staff accounts</TableCaption>
          <TableHeader>
            <TableRow>
              <TableHead scope="col">Name</TableHead>
              <TableHead scope="col">Role</TableHead>
              <TableHead scope="col">Status</TableHead>
              <TableHead scope="col" className="text-right">
                Open jobs
              </TableHead>
              <TableHead scope="col">
                <span className="sr-only">Actions</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {staff.map((s) => (
              <TableRow key={s.id}>
                <TableCell className="py-3">
                  <span className="flex items-center gap-3">
                    <Avatar name={s.fullName} src={s.avatarUrl} />
                    <span className="min-w-0">
                      <span className="block font-medium">
                        {s.fullName}
                        {s.id === me.id && <span className="font-normal text-faint"> (you)</span>}
                      </span>
                      <span className="block text-sm text-faint">{s.email}</span>
                    </span>
                  </span>
                </TableCell>
                <TableCell>
                  <Badge tone={s.role === "owner" ? "accent" : "neutral"}>{ROLE_LABEL[s.role]}</Badge>
                </TableCell>
                <TableCell>
                  <StatusPill active={s.active} />
                </TableCell>
                <TableCell className="text-right">{needsReassign(s) ? <ReassignLink member={s} /> : s.openJobs}</TableCell>
                <TableCell className="text-right whitespace-nowrap">
                  {s.id === me.id ? (
                    <Link href="/profile" className="text-sm text-muted underline decoration-subtle underline-offset-4 hover:text-ink">
                      Edit your profile
                    </Link>
                  ) : (
                    rowActions(s)
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <ul className="grid grid-cols-1 gap-3 md:hidden">
        {staff.map((s) => (
          <li key={s.id} className="rounded-xl border border-line bg-surface p-4">
            <div className="flex items-start gap-3">
              <Avatar name={s.fullName} src={s.avatarUrl} className="size-10" />
              <div className="min-w-0 flex-1">
                <p className="font-medium text-ink">
                  {s.fullName}
                  {s.id === me.id && <span className="font-normal text-faint"> (you)</span>}
                </p>
                <p className="truncate text-sm text-faint">{s.email}</p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <Badge tone={s.role === "owner" ? "accent" : "neutral"}>{ROLE_LABEL[s.role]}</Badge>
                  <StatusPill active={s.active} />
                  <span className="text-sm text-muted">
                    {needsReassign(s) ? <ReassignLink member={s} /> : openJobs(s.openJobs)}
                  </span>
                </div>
              </div>
            </div>
            {s.id !== me.id && <div className="mt-3 border-t border-rule pt-3">{rowActions(s)}</div>}
          </li>
        ))}
      </ul>
    </>
  );
}

const openJobs = (n: number) => `${n} open ${n === 1 ? "job" : "jobs"}`;

/** Deactivated, but jobs are still assigned to them: nobody works on those until the owner reassigns them (D-092). */
const needsReassign = (s: StaffMember) => !s.active && s.openJobs > 0;

function ReassignLink({ member }: { member: StaffMember }) {
  return (
    <Link
      href={jobsHref({ mechanicId: member.id })}
      className="whitespace-nowrap text-danger underline decoration-current/30 underline-offset-4 transition-[text-decoration-color] duration-150 hover:decoration-current"
    >
      {openJobs(member.openJobs)} · Reassign
      <span className="sr-only">, {member.fullName}</span>
    </Link>
  );
}

function StatusPill({ active }: { active: boolean }) {
  return active ? (
    <Badge tone="success">
      <span aria-hidden className="size-1.5 rounded-full bg-current" />
      Active
    </Badge>
  ) : (
    <Badge tone="cancelled">
      <span aria-hidden className="size-1.5 rounded-full bg-current" />
      Inactive
    </Badge>
  );
}
