import type {
  InputHTMLAttributes,
  ReactNode,
  TextareaHTMLAttributes
} from "react";

export const controlClasses =
  "min-h-11 w-full rounded-lg border border-border-strong bg-control px-3.5 py-2.5 text-sm text-fg outline-none transition-[border-color,background-color,box-shadow] duration-150 placeholder:text-fg-faint hover:border-fg-faint focus-visible:border-accent/60 focus-visible:bg-raised focus-visible:ring-2 focus-visible:ring-accent/20 disabled:cursor-not-allowed disabled:opacity-55";

export function Field({
  label,
  htmlFor,
  hint,
  required,
  children,
  className = ""
}: {
  label: string;
  htmlFor: string;
  hint?: string;
  required?: boolean;
  children: ReactNode;
  className?: string;
}) {
  const hintId = hint ? `${htmlFor}-hint` : undefined;

  return (
    <div className={`flex flex-col gap-2 ${className}`}>
      <label
        htmlFor={htmlFor}
        className="text-[0.8125rem] font-semibold tracking-[-0.005em] text-fg-muted"
      >
        {label}
        {required && <span aria-hidden="true"> *</span>}
      </label>
      {children}
      {hint && (
        <p id={hintId} className="ui-pretty text-xs leading-relaxed text-fg-subtle">
          {hint}
        </p>
      )}
    </div>
  );
}

export function Input({
  className = "",
  ...props
}: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={`${controlClasses} ${className}`} {...props} />;
}

export function Textarea({
  className = "",
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={`${controlClasses} ${className}`} {...props} />;
}
