import { cva, type VariantProps } from "class-variance-authority";
import { LoaderCircle } from "lucide-react";
import { cn } from "@/lib/utils";

/** Also use on links: `<Link className={buttonVariants({ variant: "secondary" })}>`. */
export const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 rounded-md font-medium whitespace-nowrap select-none transition-[color,background-color,border-color,scale] duration-150 ease-out active:scale-[0.98] disabled:pointer-events-none disabled:opacity-60 [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        primary: "bg-accent text-on-accent hover:bg-accent-hover",
        secondary: "border border-edge bg-surface text-ink hover:border-control/40 hover:bg-raised",
        ghost: "text-ink hover:bg-raised",
        danger: "bg-danger text-white hover:bg-danger-hover",
      },
      size: {
        sm: "h-9 px-3 text-sm",
        md: "h-11 px-4 text-[15px]",
        lg: "h-12 px-5 text-base",
        icon: "size-11",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

type ButtonProps = React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    /** Shows a spinner, disables the button and sets aria-busy. The label stays visible. */
    loading?: boolean;
  };

export function Button({ className, variant, size, loading = false, disabled, children, ...props }: ButtonProps) {
  return (
    <button
      className={cn(buttonVariants({ variant, size }), loading && "cursor-wait disabled:opacity-100", className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading && <LoaderCircle aria-hidden className="animate-spin" />}
      {children}
    </button>
  );
}
