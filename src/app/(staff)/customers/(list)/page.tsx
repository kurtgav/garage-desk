import { Plus, Search } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Button, buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
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
import { searchCustomers } from "@/lib/data/customers";
import type { CustomerListItem } from "@/lib/data/types";
import { formatPhone, formatPlate } from "@/lib/format";

export const metadata: Metadata = { title: "Customers" };

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string | string[] }>;
}) {
  await requireStaff();
  const { q: raw } = await searchParams;
  const q = typeof raw === "string" ? raw.trim() : "";
  const customers = await searchCustomers(q);

  return (
    <>
      <PageHeader
        title="Customers"
        description={q ? `${customers.length} matching “${q}”` : "Newest first"}
        actions={
          <Link href="/customers/new" className={buttonVariants()}>
            <Plus aria-hidden />
            New customer
          </Link>
        }
      />

      {/* A GET form: the search lives in the URL (?q=), works without JavaScript and survives a reload. */}
      <form
        role="search"
        action="/customers"
        className="mb-6 flex max-w-xl gap-2"
      >
        <label htmlFor="customer-search" className="sr-only">
          Search by name, phone or plate
        </label>
        <Input
          id="customer-search"
          name="q"
          type="search"
          defaultValue={q}
          placeholder="Name, phone or plate"
          autoComplete="off"
          maxLength={100}
          className="flex-1"
        />
        <Button type="submit" variant="secondary">
          <Search aria-hidden />
          Search
        </Button>
      </form>

      {customers.length === 0 ? (
        <EmptyState
          title={q ? `No customer matches “${q}”` : "No customers yet"}
          description={
            q
              ? "Check the spelling, or add them as a new customer."
              : "Add a customer and their car to start a job."
          }
          action={
            <Link
              href="/customers/new"
              className={buttonVariants({
                variant: q ? "secondary" : "primary",
              })}
            >
              <Plus aria-hidden />
              New customer
            </Link>
          }
        />
      ) : (
        <>
          <div className="hidden rounded-2xl border border-line bg-surface p-3 md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead scope="col">Customer</TableHead>
                  <TableHead scope="col">Phone</TableHead>
                  <TableHead scope="col">Vehicles</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {customers.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="py-3 align-top">
                      <span className="flex items-start gap-3">
                        <Initials name={c.fullName} />
                        <span className="min-w-0">
                          <Link
                            href={`/customers/${c.id}`}
                            className="font-medium hover:underline"
                          >
                            {c.fullName}
                          </Link>
                          {c.email && (
                            <span className="block text-sm text-faint">
                              {c.email}
                            </span>
                          )}
                        </span>
                      </span>
                    </TableCell>
                    <TableCell className="py-3 align-top whitespace-nowrap text-ink">
                      {formatPhone(c.phone)}
                    </TableCell>
                    <TableCell className="py-3 align-top">
                      <VehicleList vehicles={c.vehicles} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <ul className="grid grid-cols-1 gap-3 md:hidden">
            {customers.map((c) => (
              <li key={c.id}>
                <Link
                  href={`/customers/${c.id}`}
                  className="block rounded-xl border border-line bg-surface p-4 transition-colors duration-150 hover:bg-ground active:bg-raised"
                >
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="min-w-0 truncate font-medium text-ink">
                      {c.fullName}
                    </span>
                    <span className="text-sm whitespace-nowrap text-faint">
                      {formatPhone(c.phone)}
                    </span>
                  </div>
                  <div className="mt-2 text-sm">
                    <VehicleList vehicles={c.vehicles} />
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}

function VehicleList({ vehicles }: { vehicles: CustomerListItem["vehicles"] }) {
  if (vehicles.length === 0)
    return <span className="text-muted">No vehicles</span>;
  return (
    <ul className="grid gap-0.5">
      {vehicles.map((v) => (
        <li key={v.id} className="text-ink">
          <span className="font-medium whitespace-nowrap">
            {formatPlate(v.plate)}
          </span>
          <span className="text-muted">
            {" "}
            · {v.make} {v.model}
            {v.year != null && ` · ${v.year}`}
          </span>
        </li>
      ))}
    </ul>
  );
}

/** Decorative initials circle (the name sits next to it). */
function Initials({ name }: { name: string }) {
  const initials = name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
  return (
    <span
      aria-hidden
      className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-full bg-raised text-[13px] font-medium text-muted"
    >
      {initials}
    </span>
  );
}
