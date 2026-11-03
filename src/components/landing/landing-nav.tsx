"use client";

import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { LandingWordmark, LpCta } from "./ui";

const LINKS = [
  { href: "#how-it-works", label: "How it works" },
  { href: "#features", label: "Features" },
  { href: "#tour", label: "Tour" },
  { href: "#security", label: "Security" },
  { href: "#faq", label: "FAQ" },
];

type Props = { cta: { href: string; label: string } };

/**
 * The reference's floating white pill, fixed 16px from the top: wordmark, section links, a dark CTA pill.
 * Below 1024px the links fold into a menu behind a "+" that turns into a ×.
 */
export function LandingHeader({ cta }: Props) {
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const buttonRef = useRef<HTMLButtonElement>(null);

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
    <header className="fixed inset-x-3 top-3 z-50 flex justify-center sm:top-4">
      <nav
        aria-label="Main"
        className="relative flex w-full max-w-[720px] items-center justify-between gap-3 rounded-full bg-white/95 py-1.5 pr-1.5 pl-4 shadow-[0_0_0_1px_rgb(25_24_20/0.06),0_8px_24px_-12px_rgb(25_24_20/0.18)] backdrop-blur-md lg:w-auto lg:pl-3.5"
      >
        <Link href="/" aria-label="Garage Desk, home" className="rounded-[8px]">
          <LandingWordmark textClassName="max-[359px]:sr-only" />
        </Link>
        <ul className="hidden items-center lg:flex">
          {LINKS.map((l) => (
            <li key={l.href}>
              <a
                href={l.href}
                className="block rounded-full px-3 py-2 text-[15px] whitespace-nowrap text-lp-ink transition-colors duration-200 hover:text-lp-blue"
              >
                {l.label}
              </a>
            </li>
          ))}
        </ul>
        <div className="flex items-center gap-1">
          <LpCta href={cta.href} label={cta.label} tone="ink" pill className="h-11 pl-4 [&>span]:w-11" />
          <button
            ref={buttonRef}
            type="button"
            aria-expanded={open}
            aria-controls={menuId}
            onClick={() => setOpen((v) => !v)}
            className="grid size-11 place-items-center rounded-full bg-lp-cream text-lp-ink transition-colors duration-200 hover:bg-[#e6e8d6] lg:hidden"
          >
            <Plus aria-hidden className={cn("size-5 transition-transform duration-300 ease-lp", open && "rotate-45")} strokeWidth={1.75} />
            <span className="sr-only">Menu</span>
          </button>
        </div>
        <ul
          id={menuId}
          hidden={!open}
          className={cn(
            "absolute inset-x-0 top-full mt-2 grid gap-1 rounded-[24px] bg-white p-2 shadow-[0_0_0_1px_rgb(25_24_20/0.06),0_16px_40px_-16px_rgb(25_24_20/0.3)] lg:hidden",
            open && "animate-pop-in",
          )}
        >
          {LINKS.map((l) => (
            <li key={l.href}>
              <a
                href={l.href}
                onClick={() => setOpen(false)}
                className="block rounded-[16px] px-4 py-3 text-lg text-lp-ink transition-colors duration-200 hover:bg-lp-paper hover:text-lp-blue"
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
