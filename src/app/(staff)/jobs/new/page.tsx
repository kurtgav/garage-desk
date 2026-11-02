import { ChevronLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { getStaff, requireOwner } from "@/lib/auth";
import { listMechanicOptions, listVehicleOptions } from "@/lib/data/jobs";
import { NewJobForm } from "./new-job-form";

export async function generateMetadata(): Promise<Metadata> {
  // Mechanics get the generic 404 (D-020); a static title would leak into it.
  return { title: (await getStaff())?.role === "owner" ? "New job" : "Page not found" };
}

export default async function NewJobPage() {
  await requireOwner();
  const [vehicles, mechanics] = await Promise.all([listVehicleOptions(), listMechanicOptions()]);

  return (
    <div className="max-w-2xl">
      <Link href="/jobs" className="mb-3 inline-flex h-10 items-center gap-1 rounded-md text-sm text-muted hover:text-ink">
        <ChevronLeft aria-hidden className="size-4" />
        Jobs
      </Link>
      <PageHeader title="New job" description="It starts as New. Add labour and parts on the next screen." />

      {/* Customers and vehicles are managed in Phase 3's Customers page; no link until that route exists. */}
      {vehicles.length === 0 ? (
        <EmptyState
          title="No vehicles yet"
          description="A job is for one vehicle. Add the customer and their vehicle under Customers first, then come back here."
        />
      ) : mechanics.length === 0 ? (
        <EmptyState
          title="No active mechanics"
          description="Every job is assigned to a mechanic. Ask your administrator to create a mechanic account first."
        />
      ) : (
        <Card>
          <CardContent>
            <NewJobForm vehicles={vehicles} mechanics={mechanics} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
