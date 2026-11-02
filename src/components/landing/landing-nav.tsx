"use client";

import { useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { Menu, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { LandingWordmark, lpButton, lpContainer } from "./ui";

const LINKS = [
  { href: "#how-it-works", label: "How it works" },
  { href: "#features", label: "Features" },
  { href: "#security", label: "Security" },
  { href: "#faq", label: "FAQ" },
];

type Props = { cta: { href: string; label: string } };

const subscribeScroll = (onChange: () => void) => {
  window.addEventListener("scroll", onChange, { passive: true });
  return () => window.removeEventListener("scroll", onChange);
};

/**
 * Sticky bar for the whole page: transparent over the top of the hero, white and blurred once the page
 * scrolls. Server and no-JS render the white bar (no data-scrolled), so content never shows through it.
 * Section links from 1024px, a menu below that.
 */
export function LandingHeader({ cta }: Props) {
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const scrolled = useSyncExternalStore<boolean | null>(subscribeScroll, () => window.scrollY > 8, () => null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setOpen(false);
      buttonRef.current?.focus();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <header
      data-scrolled={scrolled === null ? undefined : scrolled}
      className="sticky top-0 z-50 bg-white/85 shadow-[0_1px_0_rgb(16_16_16/0.08)] backdrop-blur-md transition-[background-color,box-shadow,backdrop-filter] duration-300 ease-lp motion-reduce:transition-none data-[scrolled=false]:bg-transparent data-[scrolled=false]:shadow-none data-[scrolled=false]:backdrop-blur-none"
    >
      <nav aria-label="Main" className={cn(lpContainer, "relative flex h-[76px] items-center justify-between gap-3 lg:h-[88px]")}>
        <Link href="/" aria-label="Garage Desk, home" className="rounded-full">
          <LandingWordmark textClassName="max-[359px]:sr-only" />
        </Link>
        <ul className="hidden items-center lg:flex">
          {LINKS.map((l) => (
            <li key={l.href}>
              <a
                href={l.href}
                className="block rounded-full px-4 py-3 text-[17px] text-lp-body transition-colors duration-300 hover:text-lp-blue"
              >
                {l.label}
              </a>
            </li>
          ))}
        </ul>
        <div className="flex items-center gap-1">
          <Link href={cta.href} className={lpButton({ size: "md", className: "h-11 px-4 text-base sm:px-6" })}>
            {cta.label}
          </Link>
          <button
            ref={buttonRef}
            type="button"
            aria-expanded={open}
            aria-controls={menuId}
            onClick={() => setOpen((v) => !v)}
            className="grid size-11 place-items-center rounded-full text-lp-ink transition-colors duration-300 hover:bg-lp-n20 lg:hidden"
          >
            {open ? <X aria-hidden className="size-6" strokeWidth={1.75} /> : <Menu aria-hidden className="size-6" strokeWidth={1.75} />}
            <span className="sr-only">Menu</span>
          </button>
        </div>
        <ul
          id={menuId}
          hidden={!open}
          className={cn(
            "absolute inset-x-6 top-full z-20 mt-2 grid gap-1 rounded-3xl bg-white p-3 shadow-[0_12px_40px_-12px_rgb(16_16_16/0.25),0_0_0_1px_rgb(16_16_16/0.06)] md:inset-x-8 lg:hidden",
            open && "animate-pop-in",
          )}
        >
          {LINKS.map((l) => (
            <li key={l.href}>
              <a
                href={l.href}
                onClick={() => setOpen(false)}
                className="block rounded-2xl px-4 py-3 text-lg text-lp-ink transition-colors duration-300 hover:bg-lp-n20 hover:text-lp-blue"
              >
                {l.label}
              </a>
            </li>
          ))}
        </ul>
      </nav>
    </header>
  );
}
