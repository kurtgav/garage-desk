import { ChevronLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { requireStaff } from "@/lib/auth";
import { NewCustomerForm } from "./new-customer-form";

export const metadata: Metadata = { title: "New customer" };

export default async function NewCustomerPage() {
  await requireStaff();
  return (
    <div className="max-w-3xl">
      <Link href="/customers" className="mb-3 inline-flex h-10 items-center gap-1 rounded-md text-sm text-muted hover:text-ink">
        <ChevronLeft aria-hidden className="size-4" />
        Customers
      </Link>
      <PageHeader title="New customer" description="The customer and their car. You can add more vehicles afterwards." />
      <Card>
        <CardContent>
          <NewCustomerForm />
        </CardContent>
      </Card>
    </div>
  );
}
