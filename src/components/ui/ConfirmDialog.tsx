"use client";

import {
  useCallback,
  useRef,
  useState,
  type FormHTMLAttributes,
  type ReactNode
} from "react";
import { useTranslations } from "next-intl";
import Button from "@/components/ui/Button";
import Dialog from "@/components/ui/Dialog";

export interface ConfirmOptions {
  message: string;
  /** Label of the confirming button; defaults to "Delete". */
  confirmLabel?: string;
}

/**
 * The app's own confirmation dialog, in place of window.confirm(): it matches
 * the theme, works the same in WeChat's in-app browser (which titles native
 * dialogs with the site's domain), and keeps keyboard focus inside.
 *
 * `confirm()` resolves true only when the person presses the confirming
 * button; Escape, the backdrop and Cancel all resolve false.
 */
export function useConfirm(): {
  confirm: (options: ConfirmOptions) => Promise<boolean>;
  dialog: ReactNode;
} {
  const tc = useTranslations("common");
  const [pending, setPending] = useState<ConfirmOptions | null>(null);
  const resolveRef = useRef<((value: boolean) => void) | null>(null);

  const settle = useCallback((value: boolean) => {
    resolveRef.current?.(value);
    resolveRef.current = null;
    setPending(null);
  }, []);

  const confirm = useCallback((options: ConfirmOptions) => {
    resolveRef.current?.(false);
    setPending(options);
    return new Promise<boolean>((resolve) => {
      resolveRef.current = resolve;
    });
  }, []);

  const dialog = (
    <Dialog
      open={pending !== null}
      onClose={() => settle(false)}
      label={pending?.message ?? ""}
      panelClassName="max-w-sm p-5"
    >
      <p className="text-base leading-6 text-fg">{pending?.message}</p>
      <div className="mt-5 flex flex-wrap justify-end gap-2">
        {/* Cancel comes first so it receives initial focus: the safe choice. */}
        <Button onClick={() => settle(false)}>{tc("cancel")}</Button>
        <Button variant="danger" onClick={() => settle(true)}>
          {pending?.confirmLabel ?? tc("delete")}
        </Button>
      </div>
    </Dialog>
  );

  return { confirm, dialog };
}

/**
 * A form whose submission waits for confirmation in the app's dialog. The
 * original submitter is replayed, so its name/value still reach the action.
 */
export function ConfirmForm({
  message,
  confirmLabel,
  onConfirmed,
  children,
  ...formProps
}: Omit<FormHTMLAttributes<HTMLFormElement>, "onSubmit"> & {
  message: string;
  confirmLabel?: string;
  /** Runs after confirmation, just before the form submits. */
  onConfirmed?: () => void;
}) {
  const { confirm, dialog } = useConfirm();
  const formRef = useRef<HTMLFormElement>(null);
  const confirmedRef = useRef(false);

  return (
    <>
      <form
        ref={formRef}
        {...formProps}
        onSubmit={(event) => {
          if (confirmedRef.current) {
            confirmedRef.current = false;
            return;
          }
          event.preventDefault();
          const submitter = (event.nativeEvent as SubmitEvent).submitter;
          void confirm({ message, confirmLabel }).then((ok) => {
            if (!ok || !formRef.current) return;
            onConfirmed?.();
            confirmedRef.current = true;
            formRef.current.requestSubmit(
              submitter instanceof HTMLElement ? submitter : undefined
            );
          });
        }}
      >
        {children}
      </form>
      {dialog}
    </>
  );
}
