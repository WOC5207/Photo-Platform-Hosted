import { getLocale, getTranslations } from "next-intl/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { ownerBasePath, ownerName } from "@/lib/owner";
import { formatDate } from "@/lib/datetime";
import { Link } from "@/i18n/navigation";
import ConfirmSubmit from "@/components/admin/ConfirmSubmit";
import ResetPasswordControl from "@/components/admin/ResetPasswordControl";
import { deleteUser, setUserStatus } from "./actions";

export const dynamic = "force-dynamic";

export default async function PlatformUsersPage() {
  const locale = await getLocale();
  const admin = await requireAdmin(locale);
  const t = await getTranslations("platform");

  const users = await prisma.user.findMany({
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      username: true,
      displayName: true,
      role: true,
      status: true,
      createdAt: true,
      _count: { select: { events: true } }
    }
  });

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold">{t("usersTitle")}</h1>
        <p className="mt-1 text-sm text-fg-subtle">{t("usersSubtitle")}</p>
      </div>

      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="border-b border-border bg-surface text-left text-fg-subtle">
            <tr>
              <th className="px-4 py-3 font-medium">{t("colUser")}</th>
              <th className="px-4 py-3 font-medium">{t("colRole")}</th>
              <th className="px-4 py-3 font-medium">{t("colStatus")}</th>
              <th className="px-4 py-3 font-medium">{t("colAlbums")}</th>
              <th className="px-4 py-3 font-medium">{t("colJoined")}</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {users.map((u) => {
              const isSelf = u.id === admin.id;
              return (
                <tr key={u.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-3">
                    <div className="flex flex-col">
                      <span className="font-medium">{ownerName(u)}</span>
                      <Link
                        href={ownerBasePath(u.username)}
                        className="text-xs text-fg-subtle underline decoration-fg/30 underline-offset-2 hover:text-fg"
                      >
                        /u/{u.username}
                      </Link>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-fg-muted">
                    {u.role === "admin" ? t("roleAdmin") : t("roleUser")}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={
                        u.status === "active" ? "text-fg-muted" : "text-red-500"
                      }
                    >
                      {u.status === "active"
                        ? t("statusActive")
                        : t("statusSuspended")}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-fg-muted">{u._count.events}</td>
                  <td className="px-4 py-3 text-fg-muted">
                    {formatDate(u.createdAt)}
                  </td>
                  <td className="px-4 py-3">
                    {isSelf ? (
                      // No self-suspend, no self-delete: either would leave the
                      // platform with no way back in.
                      <span className="text-xs text-fg-subtle">
                        {t("cannotSuspendSelf")}
                      </span>
                    ) : (
                      <div className="flex flex-col items-end gap-2">
                        <div className="flex items-center justify-end gap-2">
                          <form action={setUserStatus}>
                            <input type="hidden" name="id" value={u.id} />
                            <input
                              type="hidden"
                              name="status"
                              value={u.status === "active" ? "suspended" : "active"}
                            />
                            <button
                              type="submit"
                              className="rounded-lg border border-border-strong px-2.5 py-1 text-xs text-fg-muted hover:border-fg-faint hover:text-fg"
                            >
                              {u.status === "active" ? t("suspend") : t("unsuspend")}
                            </button>
                          </form>
                          <form action={deleteUser}>
                            <input type="hidden" name="id" value={u.id} />
                            <ConfirmSubmit
                              label={t("deleteUser")}
                              confirmText={t("deleteUserConfirm")}
                            />
                          </form>
                        </div>
                        {/* Not offered for your own account: you would be
                            handing yourself a random password to type back in,
                            when Dashboard -> Account changes it properly. */}
                        <ResetPasswordControl
                          userId={u.id}
                          labels={{
                            reset: t("resetPassword"),
                            confirm: t("resetPasswordConfirm", { username: u.username }),
                            generatedFor: t("resetPasswordGenerated", {
                              username: u.username
                            }),
                            copyHint: t("resetPasswordCopyHint"),
                            error: t("resetPasswordError")
                          }}
                        />
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
