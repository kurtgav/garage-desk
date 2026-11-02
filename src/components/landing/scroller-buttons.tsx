"use client";

import { ArrowLeft, ArrowRight } from "lucide-react";

/** Prev / next for a horizontal scroll-snap list (the list itself also scrolls by touch, wheel and keyboard). */
export function ScrollerButtons({ targetId }: { targetId: string }) {
  function go(dir: -1 | 1) {
    const list = document.getElementById(targetId);
    const card = list?.querySelector("li");
    if (!list || !card) return;
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    list.scrollBy({ left: dir * (card.getBoundingClientRect().width + 24), behavior: reduce ? "auto" : "smooth" });
  }

  const btn =
    "grid size-12 place-items-center rounded-full bg-[#878787] text-white transition-[background-color,scale] duration-300 ease-lp hover:bg-lp-blue active:scale-[0.96]";
  return (
    <div className="mt-8 flex gap-4">
      <button type="button" aria-controls={targetId} onClick={() => go(-1)} className={btn}>
        <ArrowLeft aria-hidden className="size-6" strokeWidth={1.5} />
        <span className="sr-only">Previous rule</span>
      </button>
      <button type="button" aria-controls={targetId} onClick={() => go(1)} className={btn}>
        <ArrowRight aria-hidden className="size-6" strokeWidth={1.5} />
        <span className="sr-only">Next rule</span>
      </button>
    </div>
  );
}
