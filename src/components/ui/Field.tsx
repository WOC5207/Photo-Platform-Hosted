import type {
  InputHTMLAttributes,
  ReactElement,
  TextareaHTMLAttributes
} from "react";
import { cloneElement, isValidElement } from "react";

export const controlClasses =
  "min-h-11 w-full min-w-0 rounded-lg border border-[var(--color-control-border,var(--color-border-strong))] bg-control px-3 py-2.5 text-base sm:text-sm text-fg transition-[border-color,background-color,box-shadow] duration-150 placeholder:text-fg-faint hover:border-fg-subtle focus-visible:border-accent focus-visible:bg-raised disabled:cursor-not-allowed disabled:opacity-55 aria-invalid:border-danger";

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
  children: ReactElement;
  className?: string;
}) {
  const hintId = hint ? `${htmlFor}-hint` : undefined;
  const control =
    hintId && isValidElement<{ "aria-describedby"?: string }>(children)
      ? cloneElement(children, {
          "aria-describedby": [
            children.props["aria-describedby"],
            hintId
          ]
            .filter(Boolean)
            .join(" ")
        })
      : children;

  return (
    <div className={`flex flex-col gap-2 ${className}`}>
      <label
        htmlFor={htmlFor}
        className="text-[0.8125rem] font-semibold tracking-[-0.005em] text-fg-muted"
      >
        {label}
        {required && <span aria-hidden="true"> *</span>}
      </label>
      {control}
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
