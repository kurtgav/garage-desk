"use client";

import {
  ChevronRight,
  ChevronsUpDown,
  CircleUserRound,
  ClipboardList,
  LayoutDashboard,
  LogOut,
  Menu,
  PanelLeft,
  Plus,
  Search,
  Settings,
  UserCog,
  Users,
  X,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Dialog as DialogPrimitive, DropdownMenu } from "radix-ui";
import { useRef, useState } from "react";
import { signOut } from "@/app/login/actions";
import { Avatar } from "@/components/avatar";
import { buttonVariants } from "@/components/ui/button";
import { Wordmark } from "@/components/wordmark";
import { cn } from "@/lib/utils";

/**
 * The floating app frame (docs/DESIGN.md): sidebar + top bar + content on the gray canvas.
 * Desktop (lg+): framed with a 24px margin, sidebar can collapse. Below lg: edge to edge, the
 * sidebar opens as a drawer from the top bar's menu button. `sidebar` is server-rendered once.
 */
export function AppShell({
  sidebar,
  user,
  children,
}: {
  sidebar: React.ReactNode;
  /** For the top bar's profile link, shown while the sidebar (and its user card) is out of view. */
  user: { name: string; avatarUrl: string | null };
  children: React.ReactNode;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);

  return (
    <div className="flex min-h-dvh flex-1 lg:p-6">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:bg-surface focus:px-3 focus:py-2 focus:shadow-menu"
      >
        Skip to content
      </a>
      <div className="flex w-full min-w-0 overflow-clip bg-ground lg:rounded-3xl lg:border lg:border-edge lg:shadow-frame">
        {!collapsed && (
          <div className="hidden w-66 shrink-0 border-r border-rule bg-sidebar lg:block">
            <aside
              aria-label="Sidebar"
              className="sticky top-6 flex max-h-[calc(100dvh-3rem)] min-h-[min(100%,calc(100dvh-3rem))] flex-col"
            >
              <LogoRow
                buttonLabel="Collapse sidebar"
                onButton={() => setCollapsed(true)}
              />
              {sidebar}
            </aside>
          </div>
        )}

        <DialogPrimitive.Root open={drawerOpen} onOpenChange={setDrawerOpen}>
          <DialogPrimitive.Portal>
            <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-ink/30 data-[state=closed]:animate-fade-out data-[state=open]:animate-fade-in lg:hidden" />
            <DialogPrimitive.Content
              aria-describedby={undefined}
              // Close after following a link inside (the frame persists across navigations).
              onClick={(e) =>
                (e.target as HTMLElement).closest("a") && setDrawerOpen(false)
              }
              className="fixed inset-y-0 left-0 z-50 flex w-[min(18rem,calc(100%-3rem))] flex-col bg-sidebar shadow-menu data-[state=closed]:animate-slide-out data-[state=open]:animate-slide-in lg:hidden"
            >
              <DialogPrimitive.Title className="sr-only">
                Menu
              </DialogPrimitive.Title>
              <LogoRow
                buttonLabel="Close menu"
                onButton={() => setDrawerOpen(false)}
                isClose
              />
              {sidebar}
            </DialogPrimitive.Content>
          </DialogPrimitive.Portal>
        </DialogPrimitive.Root>

        <div className="flex min-w-0 flex-1 flex-col">
          <TopBar
            user={user}
            onOpenMenu={() => setDrawerOpen(true)}
            onExpandSidebar={collapsed ? () => setCollapsed(false) : undefined}
          />
          <main
            id="main"
            className="flex-1 px-4 py-6 sm:px-6 sm:py-8 lg:px-10 lg:py-10"
          >
            <div className="mx-auto w-full max-w-[1360px]">{children}</div>
          </main>
        </div>
      </div>
    </div>
  );
}

const iconButton =
  "inline-flex size-10 shrink-0 items-center justify-center rounded-md text-faint transition-colors duration-150 hover:bg-raised hover:text-ink";

function LogoRow({
  buttonLabel,
  onButton,
  isClose,
}: {
  buttonLabel: string;
  onButton: () => void;
  isClose?: boolean;
}) {
  const Icon = isClose ? X : PanelLeft;
  return (
    <div className="flex h-16 shrink-0 items-center justify-between gap-2 pr-3 pl-5">
      <Link href="/" className="rounded-md">
        <Wordmark />
      </Link>
      <button
        type="button"
        className={iconButton}
        aria-label={buttonLabel}
        onClick={onButton}
      >
        <Icon aria-hidden className="size-[18px]" strokeWidth={1.5} />
      </button>
    </div>
  );
}

const SECTIONS = [
  { prefix: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { prefix: "/jobs", label: "Jobs", icon: ClipboardList },
  { prefix: "/customers", label: "Customers", icon: Users },
  { prefix: "/settings", label: "Settings", icon: Settings },
  { prefix: "/staff", label: "Staff", icon: UserCog },
  { prefix: "/profile", label: "Profile", icon: CircleUserRound },
];

function useSectionTitle(): {
  label: string;
  icon: typeof Users;
  sub?: string;
} | null {
  const pathname = usePathname();
  const status = useSearchParams().get("status");
  const section = SECTIONS.find(
    (s) => pathname === s.prefix || pathname.startsWith(`${s.prefix}/`),
  );
  if (!section) return null;
  const sub =
    pathname === "/jobs/new"
      ? "New job"
      : pathname === "/customers/new"
        ? "New customer"
        : pathname === "/jobs" && status === "ready"
          ? "Ready for collection"
          : undefined;
  return { ...section, sub };
}

function TopBar({
  user,
  onOpenMenu,
  onExpandSidebar,
}: {
  user: { name: string; avatarUrl: string | null };
  onOpenMenu: () => void;
  onExpandSidebar?: () => void;
}) {
  const title = useSectionTitle();
  const Icon = title?.icon;

  return (
    <header className="flex h-16 shrink-0 items-center gap-2 border-b border-rule px-3 sm:px-6">
      <button
        type="button"
        className={cn(iconButton, "lg:hidden")}
        aria-label="Open menu"
        onClick={onOpenMenu}
      >
        <Menu aria-hidden className="size-5" strokeWidth={1.5} />
      </button>
      {onExpandSidebar && (
        <button
          type="button"
          className={cn(iconButton, "hidden lg:inline-flex")}
          aria-label="Expand sidebar"
          onClick={onExpandSidebar}
        >
          <PanelLeft aria-hidden className="size-[18px]" strokeWidth={1.5} />
        </button>
      )}
      {title && Icon && (
        <p className="flex min-w-0 items-center gap-2.5 text-base text-[#3f3f46]">
          <Icon
            aria-hidden
            className="size-[18px] shrink-0 text-faint"
            strokeWidth={1.5}
          />
          <span className="truncate">{title.label}</span>
          {title.sub && (
            <>
              <ChevronRight
                aria-hidden
                className="hidden size-4 shrink-0 text-subtle sm:block"
              />
              <span className="hidden truncate sm:inline">{title.sub}</span>
            </>
          )}
        </p>
      )}
      <div className="ml-auto flex items-center gap-2">
        <form
          action="/customers"
          role="search"
          className="relative hidden md:block"
        >
          <label htmlFor="shell-search" className="sr-only">
            Search customers
          </label>
          <Search
            aria-hidden
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-faint"
          />
          <input
            id="shell-search"
            type="search"
            name="q"
            placeholder="Search customers, phones, plates…"
            className="h-10 w-64 rounded-md border border-control bg-surface pr-3 pl-9 text-sm text-ink transition-[border-color] duration-150 placeholder:text-faint hover:border-muted xl:w-72"
          />
        </form>
        <Link
          href="/jobs/new"
          aria-label="New job"
          className={buttonVariants({
            variant: "secondary",
            size: "sm",
            className: "h-10",
          })}
        >
          <Plus aria-hidden />
          <span className="hidden sm:inline">New job</span>
        </Link>
        {/* Desktop shows the user card in the sidebar; this link stands in while it is hidden. */}
        <Link
          href="/profile"
          aria-label="Your profile"
          className={cn("grid size-10 shrink-0 place-items-center rounded-full", !onExpandSidebar && "lg:hidden")}
        >
          <Avatar name={user.name} src={user.avatarUrl} className="size-9" />
        </Link>
      </div>
    </header>
  );
}

type NavLinkProps = {
  href: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  /** Count pill (e.g. open jobs). Read out as ", {count} {countNoun}". */
  count?: number;
  countNoun?: string;
  tone?: "info" | "success";
};

/** Sidebar item. Active = gray fill and ink text; `/jobs?status=ready` is its own item. */
export function NavLink({
  href,
  icon,
  children,
  count,
  countNoun,
  tone = "info",
}: NavLinkProps) {
  const pathname = usePathname();
  const status = useSearchParams().get("status");
  const [path, query] = href.split("?");
  const isReadyItem = query === "status=ready";
  const active = isReadyItem
    ? pathname === path && status === "ready"
    : (pathname === path || pathname.startsWith(`${path}/`)) &&
      !(path === "/jobs" && pathname === "/jobs" && status === "ready");

  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "group flex h-10 items-center gap-3 rounded-md px-3 text-[15px] transition-colors duration-150",
        active
          ? "bg-[#ededef] font-medium text-ink"
          : "text-[#3f3f46] hover:bg-raised hover:text-ink",
      )}
    >
      <span
        aria-hidden
        className={cn(
          "flex shrink-0 [&_svg]:size-[18px]",
          active ? "text-ink" : "text-faint group-hover:text-ink",
        )}
      >
        {icon}
      </span>
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {count != null && count > 0 && (
        <span
          className={cn(
            "rounded-full px-2 py-0.5 text-xs font-medium tabular-nums",
            tone === "info"
              ? "bg-info-soft text-info"
              : "bg-success-soft text-success",
          )}
        >
          <span aria-hidden>{count}</span>
          <span className="sr-only">
            , {count} {countNoun}
          </span>
        </span>
      )}
    </Link>
  );
}

/** Signed-in staff member: photo, name, role. The menu holds Profile and Sign out. */
export function UserMenu({
  name,
  email,
  roleLabel,
  avatarUrl,
}: {
  name: string;
  email: string;
  roleLabel: string;
  avatarUrl: string | null;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const item =
    "flex h-10 cursor-default items-center gap-2 rounded-md px-2.5 text-sm text-ink outline-none select-none data-highlighted:bg-raised";

  return (
    <>
      {/* Outside the menu so it survives the menu closing while the action runs. */}
      <form ref={formRef} action={signOut} hidden />
      {/* Not modal: a modal menu aria-hides the whole app while open (axe aria-hidden-focus); focus still moves into the menu. */}
      <DropdownMenu.Root modal={false}>
        <DropdownMenu.Trigger className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left transition-colors duration-150 hover:bg-raised data-[state=open]:bg-raised">
          <Avatar name={name} src={avatarUrl} />
          <span className="min-w-0 flex-1 leading-tight">
            <span className="block truncate text-sm font-medium text-ink">{name}</span>
            <span className="mt-1 inline-flex rounded-full border border-edge bg-surface px-1.5 text-xs leading-[18px] text-muted">
              {roleLabel}
            </span>
          </span>
          <ChevronsUpDown aria-hidden className="size-4 shrink-0 text-faint" />
          <span className="sr-only">Account menu</span>
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content
            side="top"
            align="start"
            sideOffset={6}
            className="z-50 w-(--radix-dropdown-menu-trigger-width) min-w-52 rounded-lg bg-surface p-1 shadow-menu data-[state=closed]:animate-fade-out data-[state=open]:animate-pop-in"
          >
            <DropdownMenu.Label className="px-2.5 py-2 text-[13px] break-all text-faint">{email}</DropdownMenu.Label>
            <DropdownMenu.Item asChild className={item}>
              <Link href="/profile">
                <CircleUserRound aria-hidden className="size-4 text-faint" />
                Profile
              </Link>
            </DropdownMenu.Item>
            <DropdownMenu.Item onSelect={() => formRef.current?.requestSubmit()} className={item}>
              <LogOut aria-hidden className="size-4 text-faint" />
              Sign out
            </DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
    </>
  );
}
