"use client";

import { useEffect } from "react";

/**
 * Scroll reveals for [data-reveal] inside the nearest .lp wrapper (CSS in globals.css "Landing").
 * Elements already on screen are marked first, so nothing blinks; the rest fade up once as they enter.
 */
export function Reveal() {
  useEffect(() => {
    const root = document.querySelector<HTMLElement>(".lp");
    if (!root || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const items = [...root.querySelectorAll<HTMLElement>("[data-reveal]")];
    for (const el of items) {
      if (el.getBoundingClientRect().top < innerHeight) el.classList.add("is-in");
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          entry.target.classList.add("is-in");
          io.unobserve(entry.target);
        }
      },
      { rootMargin: "0px 0px -8% 0px" },
    );
    items.filter((el) => !el.classList.contains("is-in")).forEach((el) => io.observe(el));
    root.classList.add("lp-js");
    return () => io.disconnect();
  }, []);

  return null;
}
