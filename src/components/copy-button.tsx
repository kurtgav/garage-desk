"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";

/** Copies `value`; the result is announced politely and shown on the button for 2 s. */
export function CopyButton({ value, label = "Copy" }: { value: string; label?: string }) {
  const [result, setResult] = useState<"idle" | "copied" | "failed">("idle");

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setResult("copied");
      setTimeout(() => setResult("idle"), 2000);
    } catch {
      setResult("failed");
    }
  }

  return (
    <>
      <Button type="button" variant="secondary" onClick={copy}>
        {result === "copied" ? <Check aria-hidden /> : <Copy aria-hidden />}
        {result === "copied" ? "Copied" : label}
      </Button>
      <span role="status" className="sr-only">
        {result === "copied" ? "Copied to the clipboard." : ""}
      </span>
      {result === "failed" && (
        <p role="alert" className="basis-full text-sm font-medium text-danger">
          Copy did not work here. Select the link and copy it by hand.
        </p>
      )}
    </>
  );
}
