"use client";

import { useId, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { Eye, EyeOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { controlClass } from "./input";

type PasswordInputProps = Omit<React.ComponentProps<"input">, "type"> & {
  /** Toggle's name; give the second field on a form its own ("Show confirmation"). */
  toggleLabel?: string;
};

/**
 * Password field with a reveal toggle. Drop-in for <Input type="password"> inside <Field>:
 * id, aria-describedby and aria-invalid land on the <input>, so the label association holds.
 * The toggle's name is static ("Show password") and its state is aria-pressed (WAI-ARIA APG toggle button):
 * no aria-label, so page.getByLabel(/password/i) still matches only the input.
 */
export function PasswordInput({ id, className, toggleLabel = "Show password", ...props }: PasswordInputProps) {
  const fallbackId = useId();
  const inputId = id ?? fallbackId;
  const inputRef = useRef<HTMLInputElement>(null);
  const [visible, setVisible] = useState(false);

  function toggle() {
    const input = inputRef.current;
    const start = input?.selectionStart ?? null;
    const end = input?.selectionEnd ?? null;
    // Commit the type change now so the caret can be put back where it was.
    flushSync(() => setVisible((v) => !v));
    if (input && document.activeElement === input && start !== null && end !== null) {
      input.setSelectionRange(start, end);
    }
  }

  return (
    <div className="relative">
      <input
        ref={inputRef}
        id={inputId}
        type={visible ? "text" : "password"}
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        // pr-12 last: the toggle's room is not up to the caller's className.
        className={cn(controlClass, "h-11 pl-3", className, "pr-12")}
        {...props}
      />
      <button
        type="button"
        aria-controls={inputId}
        aria-pressed={visible}
        onClick={toggle}
        // Pointer presses keep focus (and the caret) in the input; keyboard users stay on the button.
        onMouseDown={(e) => e.preventDefault()}
        disabled={props.disabled}
        // Full-height hit area; the focus ring is drawn inside it so it never spills past the field.
        className="absolute inset-y-0 right-0 grid w-11 place-items-center rounded-lg text-faint transition-[color] duration-150 hover:text-ink focus-visible:outline-offset-[-6px] disabled:pointer-events-none disabled:opacity-60 [&_svg]:size-[18px]"
      >
        {visible ? <EyeOff aria-hidden strokeWidth={1.75} /> : <Eye aria-hidden strokeWidth={1.75} />}
        <span className="sr-only">{toggleLabel}</span>
      </button>
    </div>
  );
}
