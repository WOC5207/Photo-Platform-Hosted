"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import {
  addAnnouncement,
  deleteAnnouncement,
  moveAnnouncement,
  updateAnnouncement,
  type AnnouncementState
} from "@/app/[locale]/dashboard/(protected)/settings/actions";
import AnnouncementImageUploader from "./AnnouncementImageUploader";

export interface AdminAnnouncement {
  id: string;
  titleEn: string;
  titleZh: string;
  bodyEn: string;
  bodyZh: string;
  imageUrl: string;
}

const inputCls =
  "min-h-10 w-full rounded-lg border border-border-strong bg-surface px-3 py-2 text-sm text-fg outline-none focus-visible:border-fg-subtle focus-visible:ring-2 focus-visible:ring-fg/20";
const btnCls =
  "min-h-10 rounded-lg border border-border-strong px-3 py-1.5 text-sm font-medium text-fg-muted transition hover:border-fg-faint hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fg/40 disabled:opacity-40 max-sm:min-h-11";

export default function AnnouncementsManager({
  announcements
}: {
  announcements: AdminAnnouncement[];
}) {
  const t = useTranslations("adminSite");
  const tc = useTranslations("common");
  const [state, formAction, pending] = useActionState<
    AnnouncementState,
    FormData
  >(addAnnouncement, {});

  return (
    <section className="flex flex-col gap-3 border-t border-border pt-6">
      <h2 className="text-lg font-semibold">{t("announcementsSection")}</h2>
      <p className="-mt-1 text-xs text-fg-subtle">{t("announcementsHint")}</p>

      {announcements.length > 0 && (
        <ul className="flex flex-col gap-2">
          {announcements.map((item, i) => (
            <li
              key={item.id}
              className="rounded-xl border border-border bg-surface p-3"
            >
              <form action={updateAnnouncement} className="flex flex-col gap-2">
                <input type="hidden" name="id" value={item.id} />
                <div className="grid gap-2 sm:grid-cols-2">
                  <label className="flex flex-col gap-1 text-xs text-fg-subtle">
                    <span>{t("announcementTitleEn")}</span>
                    <input
                      name="titleEn"
                      defaultValue={item.titleEn}
                      maxLength={120}
                      className={inputCls}
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-xs text-fg-subtle">
                    <span>{t("announcementTitleZh")}</span>
                    <input
                      name="titleZh"
                      defaultValue={item.titleZh}
                      maxLength={120}
                      className={inputCls}
                    />
                  </label>
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  <label className="flex flex-col gap-1 text-xs text-fg-subtle">
                    <span>{t("announcementBodyEn")}</span>
                    <textarea
                      name="bodyEn"
                      defaultValue={item.bodyEn}
                      maxLength={2000}
                      rows={2}
                      className={inputCls}
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-xs text-fg-subtle">
                    <span>{t("announcementBodyZh")}</span>
                    <textarea
                      name="bodyZh"
                      defaultValue={item.bodyZh}
                      maxLength={2000}
                      rows={2}
                      className={inputCls}
                    />
                  </label>
                </div>
                <button type="submit" className={`${btnCls} w-fit`}>
                  {tc("save")}
                </button>
              </form>
              <div className="mt-2">
                <AnnouncementImageUploader
                  announcementId={item.id}
                  currentUrl={item.imageUrl}
                />
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                <form action={moveAnnouncement}>
                  <input type="hidden" name="id" value={item.id} />
                  <input type="hidden" name="direction" value="up" />
                  <button type="submit" disabled={i === 0} className={btnCls}>
                    ← {t("moveUp")}
                  </button>
                </form>
                <form action={moveAnnouncement}>
                  <input type="hidden" name="id" value={item.id} />
                  <input type="hidden" name="direction" value="down" />
                  <button
                    type="submit"
                    disabled={i === announcements.length - 1}
                    className={btnCls}
                  >
                    {t("moveDown")} →
                  </button>
                </form>
                <form
                  action={deleteAnnouncement}
                  onSubmit={(e) => {
                    if (!confirm(t("confirmDeleteAnnouncement")))
                      e.preventDefault();
                  }}
                >
                  <input type="hidden" name="id" value={item.id} />
                  <button
                    type="submit"
                    className={`${btnCls} border-danger-border text-danger hover:border-danger hover:text-danger-strong`}
                  >
                    {tc("delete")}
                  </button>
                </form>
              </div>
            </li>
          ))}
        </ul>
      )}
      {announcements.length === 0 && (
        <p className="text-sm text-fg-subtle">{t("noAnnouncements")}</p>
      )}

      <form
        action={formAction}
        className="flex flex-col gap-2 rounded-xl border border-dashed border-border-strong p-3"
      >
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-xs text-fg-subtle">
            <span>{t("announcementTitleEn")}</span>
            <input name="titleEn" maxLength={120} className={inputCls} />
          </label>
          <label className="flex flex-col gap-1 text-xs text-fg-subtle">
            <span>{t("announcementTitleZh")}</span>
            <input name="titleZh" maxLength={120} className={inputCls} />
          </label>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-xs text-fg-subtle">
            <span>{t("announcementBodyEn")}</span>
            <textarea name="bodyEn" maxLength={2000} rows={2} className={inputCls} />
          </label>
          <label className="flex flex-col gap-1 text-xs text-fg-subtle">
            <span>{t("announcementBodyZh")}</span>
            <textarea name="bodyZh" maxLength={2000} rows={2} className={inputCls} />
          </label>
        </div>
        <button type="submit" disabled={pending} className={`${btnCls} w-fit`}>
          + {t("addAnnouncement")}
        </button>
      </form>
      {state.error && (
        <p role="alert" className="text-xs text-danger">
          {t("announcementValidationError")}
        </p>
      )}
    </section>
  );
}
