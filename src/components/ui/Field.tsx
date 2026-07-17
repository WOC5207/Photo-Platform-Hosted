import type {
  InputHTMLAttributes,
  ReactNode,
  TextareaHTMLAttributes
} from "react";

export const controlClasses =
  "min-h-10 w-full rounded-lg border border-border-strong bg-surface px-3 py-2 text-sm text-fg outline-none transition placeholder:text-fg-faint focus-visible:border-fg-subtle focus-visible:ring-2 focus-visible:ring-fg/20 disabled:cursor-not-allowed disabled:opacity-60";

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
    <div className={`flex flex-col gap-1.5 ${className}`}>
      <label htmlFor={htmlFor} className="text-sm font-medium text-fg-muted">
        {label}
        {required && <span aria-hidden="true"> *</span>}
      </label>
      {children}
      {hint && (
        <p id={hintId} className="text-xs leading-relaxed text-fg-subtle">
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
