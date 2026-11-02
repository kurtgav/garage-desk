import { AppShell } from "@/components/shell/shell-client";
import { Sidebar } from "@/components/shell/sidebar";
import { requireStaff } from "@/lib/auth";
import { getMyProfile } from "@/lib/data/profile";
import { getShellData } from "@/lib/data/shell";

export default async function StaffLayout({ children }: { children: React.ReactNode }) {
  const staff = await requireStaff();
  // getMyProfile is cached per request, so /profile reuses this read.
  const [shell, profile] = await Promise.all([getShellData(staff), getMyProfile()]);

  return (
    <AppShell
      sidebar={<Sidebar staff={staff} shell={shell} avatarUrl={profile.avatarUrl} />}
      user={{ name: staff.fullName, avatarUrl: profile.avatarUrl }}
    >
      {children}
    </AppShell>
  );
}
