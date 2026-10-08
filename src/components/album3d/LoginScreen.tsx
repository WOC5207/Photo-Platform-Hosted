"use client";

import { useActionState, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { login3d, logout3d } from "@/app/[locale]/3d/login/actions";
import type { LoginState } from "@/app/[locale]/login/actions";
import { GameMenu, wrap, type MenuItem } from "./hud";
import styles from "./ArchiveSite.module.css";
import { fieldClass, isInteractive, metaLabel, primaryClass, useScreenKeys, useStage } from "./booking/shared";

/** `listed`: the archive shows this photographer (they have a published album). */
export type LoginAccount = { username: string; name: string; admin: boolean; listed: boolean };

/**
 * The photographer's way into the 3D site: the sign-in form, or once signed
 * in, the account's menu.
 */
export default function LoginScreen({ account }: { account: LoginAccount | null }) {
  const t = useTranslations("album3d");
  // The menu screens' key hints already run along the bottom.
  return (
    <main id="main-content" tabIndex={-1} className={`${styles.menuPanel} outline-none`}>
      <p className={metaLabel}>
        {t("archiveLabel")} <span aria-hidden="true" className="mx-2">／</span> {account ? t("loginSignedIn") : t("menuLogin")}
      </p>
      <h1 className="mt-3 text-[2.5rem] font-extrabold uppercase leading-[0.95] tracking-[-0.04em] break-words wide:text-[3.5rem]">
        {account ? account.name : t("loginTitle")}
      </h1>
      <div aria-hidden="true" className={styles.calloutRule} />
      {account ? <AccountMenu account={account} /> : <SignInForm />}
    </main>
  );
}

function SignInForm() {
  const t = useTranslations("album3d");
  const ta = useTranslations("auth");
  const [state, action, pending] = useActionState<LoginState, FormData>(login3d, {});
  const error =
    state.error === "invalid" ? ta("invalidCredentials") : state.error === "rateLimited" ? ta("rateLimited") : state.error === "notConfigured" ? ta("notConfigured") : null;
  return (
    <form action={action} aria-busy={pending} className="mt-6 grid max-w-md gap-4 wide:mt-10">
      <p className="text-sm text-fg-muted">{t("loginHint")}</p>
      <label className="grid gap-1 text-sm font-semibold text-fg-muted">
        {ta("username")}
        <input
          name="username"
          autoComplete="username"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          required
          disabled={pending}
          aria-invalid={state.error === "invalid" ? true : undefined}
          aria-describedby={error ? "login3d-error" : undefined}
          className={fieldClass}
        />
      </label>
      <label className="grid gap-1 text-sm font-semibold text-fg-muted">
        {ta("password")}
        <input
          name="password"
          type="password"
          autoComplete="current-password"
          required
          disabled={pending}
          aria-invalid={state.error === "invalid" ? true : undefined}
          aria-describedby={error ? "login3d-error" : undefined}
          className={fieldClass}
        />
      </label>
      {error && (
        <p id="login3d-error" role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      <button type="submit" disabled={pending} className={primaryClass}>
        {pending ? ta("signingIn") : ta("signIn")}
        <span aria-hidden="true" className="text-lg">→</span>
      </button>
    </form>
  );
}

function AccountMenu({ account }: { account: LoginAccount }) {
  const t = useTranslations("album3d");
  const { go } = useStage();
  const [focus, setFocus] = useState(0);
  const [leaving, startLeaving] = useTransition();
  const items: MenuItem[] = [
    ...(account.listed
      ? [{ key: "archive", label: t("loginArchive"), sub: `@${account.username}`, run: () => go({ kind: "photographer", username: account.username }) }]
      : []),
    { key: "dashboard", label: t("loginDashboard"), sub: t("loginDashboardSub"), run: () => go({ kind: "studio", username: account.username, page: "home" }) },
    { key: "signout", label: leaving ? t("loginSigningOut") : t("loginSignOut"), run: () => !leaving && startLeaving(() => logout3d()) }
  ];
  const at = Math.min(focus, items.length - 1);

  useScreenKeys((k, target) => {
    if (k === "ArrowUp") setFocus((f) => wrap(f - 1, items.length));
    else if (k === "ArrowDown") setFocus((f) => wrap(f + 1, items.length));
    else if (k === "Enter" && !isInteractive(target)) items[at]?.run();
    else return false;
    return true;
  });

  return <GameMenu label={account.name} className="mt-8 wide:mt-12" focus={at} onFocus={setFocus} items={items} />;
}
