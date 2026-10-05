"use server";

import { redirect } from "next/navigation";
import { getLocale } from "next-intl/server";
import { getSession } from "@/lib/auth";
import { signIn } from "@/lib/signIn";
import { screenPath } from "@/lib/siteMode";
import type { LoginState } from "../../login/actions";

/**
 * The 3D site's sign-in: the same accounts and checks as the classic login,
 * but the photographer stays in 3D, on the login screen's signed-in panel.
 */
export async function login3d(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const result = await signIn(formData);
  if ("error" in result) return { error: result.error };
  redirect(`/${await getLocale()}${screenPath({ kind: "login" })}`);
}

export async function logout3d(): Promise<void> {
  const session = await getSession();
  session.destroy();
  redirect(`/${await getLocale()}${screenPath({ kind: "login" })}`);
}
