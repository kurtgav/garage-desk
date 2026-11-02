import { ChevronLeft, UserPlus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { requireStaff } from "@/lib/auth";
import { listMechanicOptions, listVehicleOptions } from "@/lib/data/jobs";
import { NewJobForm } from "./new-job-form";

export const metadata: Metadata = { title: "New job" };

export default async function NewJobPage({ searchParams }: { searchParams: Promise<{ vehicle?: string | string[] }> }) {
  const staff = await requireStaff();
  const isOwner = staff.role === "owner";
  const [vehicles, mechanics, { vehicle }] = await Promise.all([
    listVehicleOptions(),
    isOwner ? listMechanicOptions() : null,
    searchParams,
  ]);
  // Only preselect a vehicle the picker actually offers.
  const defaultVehicleId = vehicles.some((v) => v.id === vehicle) ? (vehicle as string) : undefined;

  return (
    <div className="max-w-2xl">
      <Link href="/jobs" className="mb-3 inline-flex h-10 items-center gap-1 rounded-md text-sm text-muted hover:text-ink">
        <ChevronLeft aria-hidden className="size-4" />
        Jobs
      </Link>
      <PageHeader title="New job" description="It starts as New. Add labour and parts on the next screen." />

      {vehicles.length === 0 ? (
        <EmptyState
          title="No vehicles yet"
          description="A job is for one vehicle. Add the customer and their car first."
          action={
            <Link href="/customers/new" className={buttonVariants()}>
              <UserPlus aria-hidden />
              New customer
            </Link>
          }
        />
      ) : mechanics?.length === 0 ? (
        <EmptyState
          title="No active mechanics"
          description="Every job is assigned to a mechanic. Ask your administrator to create a mechanic account first."
        />
      ) : (
        <Card>
          <CardContent>
            <NewJobForm vehicles={vehicles} mechanics={mechanics} defaultVehicleId={defaultVehicleId} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
