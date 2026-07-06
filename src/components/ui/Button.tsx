import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "../../lib/cn";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  children: ReactNode;
  /** Leading icon/element. */
  icon?: ReactNode;
}

const variants: Record<Variant, string> = {
  primary:
    "bg-aws-orange text-ink-900 font-semibold hover:bg-aws-orange-soft border border-aws-orange shadow-[0_8px_24px_-12px_rgba(255,153,0,0.7)]",
  secondary:
    "bg-ink-700 text-fog-100 border border-line-bright hover:border-cyan/60 hover:text-cyan-soft",
  ghost:
    "bg-transparent text-fog-300 border border-transparent hover:bg-ink-700/70 hover:text-fog-100",
  danger:
    "bg-transparent text-danger border border-danger/50 hover:bg-danger/10",
};

const sizes: Record<Size, string> = {
  sm: "px-3 py-1.5 text-xs gap-1.5",
  md: "px-4 py-2 text-sm gap-2",
};

/** Primary action button. Disabled + aria-busy states are handled by callers. */
export function Button({
  variant = "primary",
  size = "md",
  icon,
  children,
  className,
  type = "button",
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(
        "inline-flex items-center justify-center rounded-md font-sans transition-colors duration-150",
        "disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none",
        variants[variant],
        sizes[size],
        className,
      )}
      {...rest}
    >
      {icon && <span className="grid place-items-center">{icon}</span>}
      {children}
    </button>
  );
}
