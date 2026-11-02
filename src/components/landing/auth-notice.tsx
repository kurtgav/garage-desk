"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

type Props = {
  /** The action state; each new object is a new result. */
  result: unknown;
  /** The Alert to show, or nothing. */
  children?: React.ReactNode;
};

/**
 * Top-of-form notice on the sign-in pages. Opens by animating its height (no jump), stays put while a retry is
 * pending, and remounts its Alert on every new result so a repeated message is announced again.
 */
export function AuthNotice({ result, children }: Props) {
  const [seen, setSeen] = useState(result);
  const [count, setCount] = useState(0);
  if (result !== seen) {
    setSeen(result);
    setCount(count + 1);
  }

  return (
    <div
      className={cn(
        "grid transition-[grid-template-rows,opacity] duration-300 ease-lp",
        children ? "grid-rows-[1fr]" : "grid-rows-[0fr] opacity-0",
      )}
    >
      <div key={count} className="min-h-0 overflow-hidden">
        {children && <div className="pb-6">{children}</div>}
      </div>
    </div>
  );
}
