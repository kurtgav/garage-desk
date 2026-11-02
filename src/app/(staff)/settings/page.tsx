import type { Metadata } from "next";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { getStaff, requireOwner } from "@/lib/auth";
import { getSettings } from "@/lib/data/settings";
import { SettingsForm } from "./settings-form";

export async function generateMetadata(): Promise<Metadata> {
  // Mechanics get the generic 404 (D-020); a static title would leak into it and confirm the page exists.
  return { title: (await getStaff())?.role === "owner" ? "Settings" : "Page not found" };
}

/** FR9, owner only: mechanics get the generic 404 (D-020). */
export default async function SettingsPage() {
  await requireOwner();
  const settings = await getSettings();
  return (
    <div className="max-w-3xl">
      <PageHeader title="Settings" description="Prices and garage details. Changes never alter existing lines, quotes or jobs." />
      <Card>
        <CardContent>
          <SettingsForm settings={settings} />
        </CardContent>
      </Card>
    </div>
  );
}
