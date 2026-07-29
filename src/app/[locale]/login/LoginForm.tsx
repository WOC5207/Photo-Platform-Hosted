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
    <form action={formAction} className="flex w-full flex-col gap-5">
      <label className="flex flex-col gap-2 text-sm">
        <span className="text-[0.8125rem] font-semibold text-fg-muted">
          {t("username")}
        </span>
        <input
          name="username"
          autoComplete="username"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          required
          className="min-h-11 rounded-lg border border-border-strong bg-control px-3.5 py-2.5 text-sm text-fg outline-none transition-[border-color,background-color,box-shadow] hover:border-fg-faint focus-visible:border-accent/60 focus-visible:bg-raised focus-visible:ring-2 focus-visible:ring-accent/20"
        />
      </label>
      <label className="flex flex-col gap-2 text-sm">
        <span className="text-[0.8125rem] font-semibold text-fg-muted">
          {t("password")}
        </span>
        <input
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className="min-h-11 rounded-lg border border-border-strong bg-control px-3.5 py-2.5 text-sm text-fg outline-none transition-[border-color,background-color,box-shadow] hover:border-fg-faint focus-visible:border-accent/60 focus-visible:bg-raised focus-visible:ring-2 focus-visible:ring-accent/20"
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
        className="min-h-11 rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-accent-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/45 focus-visible:ring-offset-2 focus-visible:ring-offset-page disabled:opacity-50 dark:text-page"
      >
        {t("signIn")}
      </button>
    </form>
  );
}
