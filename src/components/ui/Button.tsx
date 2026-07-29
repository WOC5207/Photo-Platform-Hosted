import type { ButtonHTMLAttributes } from "react";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "compact" | "default";

const variants: Record<ButtonVariant, string> = {
  primary:
    "border-transparent bg-accent text-accent-fg hover:bg-accent-strong",
  secondary:
    "border-border-strong bg-raised text-fg-muted hover:border-accent/40 hover:text-fg",
  ghost:
    "border-transparent bg-transparent text-fg-muted hover:bg-accent-surface hover:text-fg",
  danger:
    "border-danger-border bg-danger-surface text-danger hover:border-danger hover:text-danger-strong"
};

const sizes: Record<ButtonSize, string> = {
  compact: "min-h-9 px-3 py-1.5 text-xs",
  default: "min-h-11 px-4 py-2.5 text-sm"
};

export function buttonClasses({
  variant = "secondary",
  size = "default",
  className = ""
}: {
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
} = {}): string {
  return [
    "inline-flex items-center justify-center gap-2 rounded-lg border font-semibold tracking-[-0.01em]",
    "transition-[color,background-color,border-color,opacity,transform] duration-150 ease-[cubic-bezier(0.23,1,0.32,1)]",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/45 focus-visible:ring-offset-2 focus-visible:ring-offset-page",
    "disabled:pointer-events-none disabled:opacity-45 max-sm:min-h-11",
    variants[variant],
    sizes[size],
    className
  ]
    .filter(Boolean)
    .join(" ");
}

export default function Button({
  variant = "secondary",
  size = "default",
  className,
  type = "button",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
}) {
  return (
    <button
      type={type}
      className={buttonClasses({ variant, size, className })}
      {...props}
    />
  );
}
