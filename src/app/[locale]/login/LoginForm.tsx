"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { login, type LoginState } from "./actions";

export default function LoginForm() {
  const t = useTranslations("auth");
  const [state, formAction, pending] = useActionState<LoginState, FormData>(
    login,
    {}
  );

  const errorMessage =
    state.error === "invalid"
      ? t("invalidCredentials")
      : state.error === "rateLimited"
        ? t("rateLimited")
        : state.error === "notConfigured"
          ? t("notConfigured")
          : null;

  return (
    <form action={formAction} className="flex w-full max-w-sm flex-col gap-4">
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-fg-muted">{t("username")}</span>
        <input
          name="username"
          autoComplete="username"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          required
          className="min-h-10 rounded-lg border border-border-strong bg-surface px-3 py-2 text-sm text-fg outline-none focus-visible:border-fg-subtle focus-visible:ring-2 focus-visible:ring-fg/20 max-sm:min-h-11"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-fg-muted">{t("password")}</span>
        <input
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className="min-h-10 rounded-lg border border-border-strong bg-surface px-3 py-2 text-sm text-fg outline-none focus-visible:border-fg-subtle focus-visible:ring-2 focus-visible:ring-fg/20 max-sm:min-h-11"
        />
      </label>
      {errorMessage && (
        <p role="alert" className="rounded-lg bg-danger-surface px-3 py-2 text-sm text-danger">
          {errorMessage}
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="min-h-10 rounded-lg bg-fg px-4 py-2 text-sm font-semibold text-page transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fg/40 disabled:opacity-50 max-sm:min-h-11"
      >
        {t("signIn")}
      </button>
    </form>
  );
}
