import { AppShell } from "@/components/shell/shell-client";
import { Sidebar } from "@/components/shell/sidebar";
import { requireStaff } from "@/lib/auth";
import { getShellData } from "@/lib/data/shell";

export default async function StaffLayout({ children }: { children: React.ReactNode }) {
  const staff = await requireStaff();
  const shell = await getShellData(staff);

  return <AppShell sidebar={<Sidebar staff={staff} shell={shell} />}>{children}</AppShell>;
}
