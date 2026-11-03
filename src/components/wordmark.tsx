import Image from "next/image";
import { cn } from "@/lib/utils";

export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2 font-semibold tracking-tight whitespace-nowrap text-ink", className)}>
      <Image src="/brand/mark.webp" alt="" width={192} height={192} sizes="48px" className="size-7 shrink-0" />
      Garage Desk
    </span>
  );
}
