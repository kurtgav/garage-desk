import { ChevronLeft, Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import { Money } from "@/components/money";
import { StatusBadge, StatusSquare } from "@/components/status-badge";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { requireStaff } from "@/lib/auth";
import { getCustomer } from "@/lib/data/customers";
import { formatDate, formatPhone, formatPlate } from "@/lib/format";
import {
  DeleteCustomer,
  EditCustomerForm,
  VehicleForm,
  VehicleRow,
} from "./customer-forms";

type Props = { params: Promise<{ id: string }> };

const loadCustomer = cache(getCustomer);

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const customer = await loadCustomer((await params).id);
  return { title: customer?.fullName ?? "Page not found" };
}

export default async function CustomerPage({ params }: Props) {
  const staff = await requireStaff();
  const customer = await loadCustomer((await params).id);
  if (!customer) notFound();

  const isOwner = staff.role === "owner";

  return (
    <>
      <Link
        href="/customers"
        className="mb-3 inline-flex h-10 items-center gap-1 rounded-md text-sm text-muted hover:text-ink"
      >
        <ChevronLeft aria-hidden className="size-4" />
        Customers
      </Link>

      <div className="mb-6 flex flex-wrap items-start justify-between gap-x-6 gap-y-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight text-ink sm:text-[30px] sm:leading-9">
            {customer.fullName}
          </h1>
          <p className="mt-1.5 text-[15px] text-faint sm:text-base">
            <a
              href={`tel:+${customer.phone}`}
              className="text-ink underline decoration-subtle underline-offset-4 hover:decoration-ink"
            >
              {formatPhone(customer.phone)}
            </a>
            {customer.email && <> · {customer.email}</>} · Customer since{" "}
            {formatDate(customer.createdAt)}
          </p>
        </div>
        {customer.canDelete && (
          <DeleteCustomer customerId={customer.id} name={customer.fullName} />
        )}
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="grid gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Vehicles</CardTitle>
            </CardHeader>
            <CardContent className="pb-0">
              {customer.vehicles.length === 0 ? (
                <p className="text-sm text-muted">
                  No vehicles yet. Add one below.
                </p>
              ) : (
                <ul className="grid divide-y divide-rule">
                  {customer.vehicles.map((v) => (
                    <li key={v.id} className="py-3 first:pt-0">
                      <VehicleRow customerId={customer.id} vehicle={v}>
                        <div className="min-w-0">
                          <p className="font-medium text-ink">
                            {formatPlate(v.plate)}
                          </p>
                          <p className="text-sm text-faint">
                            {v.make} {v.model}
                            {v.year != null && ` · ${v.year}`}
                          </p>
                        </div>
                        <Link
                          href={`/jobs/new?vehicle=${v.id}`}
                          className={buttonVariants({
                            variant: "secondary",
                            size: "sm",
                            className: "ml-auto",
                          })}
                        >
                          <Plus aria-hidden />
                          New job
                          <span className="sr-only">
                            {" "}
                            for {formatPlate(v.plate)}
                          </span>
                        </Link>
                      </VehicleRow>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
            <section
              aria-labelledby="add-vehicle-heading"
              className="mt-5 rounded-b-xl border-t border-rule bg-ground px-5 py-5"
            >
              <h3
                id="add-vehicle-heading"
                className="mb-3 text-sm font-semibold text-ink"
              >
                Add a vehicle
              </h3>
              <VehicleForm customerId={customer.id} />
            </section>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Details</CardTitle>
            </CardHeader>
            <CardContent>
              <EditCustomerForm customer={customer} />
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader className="pb-4">
            <CardTitle>Jobs</CardTitle>
            <CardDescription>
              {isOwner ? "All jobs for this customer" : "Jobs assigned to you"}
            </CardDescription>
          </CardHeader>
          {customer.jobs.length === 0 ? (
            <CardContent className="pt-0">
              <EmptyState
                title={isOwner ? "No jobs yet" : "No jobs assigned to you"}
                description={
                  isOwner
                    ? "Start one from a vehicle on the left."
                    : "Jobs for this customer that you create or the owner assigns to you show up here."
                }
              />
            </CardContent>
          ) : (
            <ul className="divide-y divide-rule border-t border-rule [&>li:last-child>a]:rounded-b-xl">
              {customer.jobs.map((job) => (
                <li key={job.id}>
                  <Link
                    href={`/jobs/${job.id}`}
                    className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-5 py-3 transition-colors duration-150 hover:bg-ground"
                  >
                    <span className="flex min-w-0 items-center gap-2.5">
                      <StatusSquare status={job.status} />
                      <span className="font-medium text-ink">{job.ref}</span>
                      <span className="text-sm text-faint">
                        {" "}
                        · {formatPlate(job.plate)} · {formatDate(job.createdAt)}
                      </span>
                    </span>
                    <span className="flex items-center gap-3">
                      <StatusBadge status={job.status} />
                      <Money
                        cents={job.totalCents}
                        className="text-sm font-medium text-ink"
                      />
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
