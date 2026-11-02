"use client";

import { ClipboardList, LayoutDashboard, Settings, Users } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { StaffRole } from "@/lib/auth";
import { cn } from "@/lib/utils";

// Cosmetic only: RLS and requireOwner() are the real boundary (PRD FR1, D-020).
const ITEMS = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, ownerOnly: true },
  { href: "/jobs", label: "Jobs", icon: ClipboardList, ownerOnly: false },
  { href: "/customers", label: "Customers", icon: Users, ownerOnly: false },
  { href: "/settings", label: "Settings", icon: Settings, ownerOnly: true },
];

export function StaffNav({ role, className }: { role: StaffRole; className?: string }) {
  const pathname = usePathname();
  const items = ITEMS.filter((item) => role === "owner" || !item.ownerOnly);

  return (
    <nav aria-label="Main" className={className}>
      <ul className="flex gap-1">
        {items.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(`${href}/`);
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "inline-flex h-10 items-center gap-2 rounded-md px-3 text-sm font-medium whitespace-nowrap transition-colors duration-150",
                  active ? "bg-raised text-ink" : "text-muted hover:bg-raised/60 hover:text-ink",
                )}
              >
                <Icon aria-hidden className="size-4" strokeWidth={1.75} />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
