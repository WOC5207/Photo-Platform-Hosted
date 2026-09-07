"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { login, type LoginState } from "./actions";
import Button from "@/components/ui/Button";
import { Field, Input } from "@/components/ui/Field";
import StatusMessage from "@/components/ui/StatusMessage";

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
    <form
      action={formAction}
      aria-busy={pending}
      className="flex w-full flex-col gap-5"
    >
      <Field label={t("username")} htmlFor="login-username">
        <Input
          id="login-username"
          name="username"
          autoComplete="username"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          required
          aria-invalid={state.error === "invalid" ? true : undefined}
          aria-describedby={errorMessage ? "login-error" : undefined}
          disabled={pending}
        />
      </Field>
      <Field label={t("password")} htmlFor="login-password">
        <Input
          id="login-password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          aria-invalid={state.error === "invalid" ? true : undefined}
          aria-describedby={errorMessage ? "login-error" : undefined}
          disabled={pending}
        />
      </Field>
      {errorMessage && <div id="login-error"><StatusMessage kind="error">{errorMessage}</StatusMessage></div>}
      <Button type="submit" variant="primary" disabled={pending}>
        {pending ? t("signingIn") : t("signIn")}
      </Button>
    </form>
  );
}
