"use server";

import { redirect } from "next/navigation";
import { getLocale } from "next-intl/server";
import { getSession, homePathFor } from "@/lib/auth";
import { signIn, type SignInError } from "@/lib/signIn";

export type LoginState = {
  error?: SignInError;
};

export async function login(
  _prev: LoginState,
  formData: FormData
): Promise<LoginState> {
  const result = await signIn(formData);
  if ("error" in result) return { error: result.error };
  const locale = await getLocale();
  redirect(homePathFor(result.user, locale));
}

export async function logout(): Promise<void> {
  const session = await getSession();
  session.destroy();
  const locale = await getLocale();
  redirect(`/${locale}/login`);
}
