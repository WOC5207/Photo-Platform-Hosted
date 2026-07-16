"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import {
  addAnnouncement,
  deleteAnnouncement,
  moveAnnouncement,
  updateAnnouncement,
  type AnnouncementState
} from "@/app/[locale]/admin/(protected)/settings/actions";
import AnnouncementImageUploader from "./AnnouncementImageUploader";
import { FORM_ID } from "./SiteSettingsForm";

export interface AdminAnnouncement {
  id: string;
  titleEn: string;
  titleZh: string;
  bodyEn: string;
  bodyZh: string;
  imageUrl: string;
}

const inputCls =
  "rounded-lg border border-border-strong bg-surface px-3 py-2 text-sm text-fg outline-none focus:border-fg-subtle";
const btnCls =
  "rounded-md border border-border-strong px-2 py-1 text-xs text-fg-muted transition hover:border-fg-faint hover:text-fg disabled:opacity-40";

export default function AnnouncementsManager({
  announcements,
  announcementsEnabled
}: {
  announcements: AdminAnnouncement[];
  announcementsEnabled: boolean;
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

      <label className="flex items-center gap-2 text-sm">
        <input
          form={FORM_ID}
          type="checkbox"
          name="announcementsEnabled"
          defaultChecked={announcementsEnabled}
          className="h-4 w-4 accent-fg"
        />
        <span>{t("announcementsEnabledLabel")}</span>
      </label>

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
                  <input
                    name="titleEn"
                    defaultValue={item.titleEn}
                    placeholder={t("announcementTitleEn")}
                    maxLength={120}
                    className={inputCls}
                  />
                  <input
                    name="titleZh"
                    defaultValue={item.titleZh}
                    placeholder={t("announcementTitleZh")}
                    maxLength={120}
                    className={inputCls}
                  />
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  <textarea
                    name="bodyEn"
                    defaultValue={item.bodyEn}
                    placeholder={t("announcementBodyEn")}
                    maxLength={2000}
                    rows={2}
                    className={inputCls}
                  />
                  <textarea
                    name="bodyZh"
                    defaultValue={item.bodyZh}
                    placeholder={t("announcementBodyZh")}
                    maxLength={2000}
                    rows={2}
                    className={inputCls}
                  />
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
          <input
            name="titleEn"
            placeholder={t("announcementTitleEn")}
            maxLength={120}
            className={inputCls}
          />
          <input
            name="titleZh"
            placeholder={t("announcementTitleZh")}
            maxLength={120}
            className={inputCls}
          />
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          <textarea
            name="bodyEn"
            placeholder={t("announcementBodyEn")}
            maxLength={2000}
            rows={2}
            className={inputCls}
          />
          <textarea
            name="bodyZh"
            placeholder={t("announcementBodyZh")}
            maxLength={2000}
            rows={2}
            className={inputCls}
          />
        </div>
        <button type="submit" disabled={pending} className={`${btnCls} w-fit`}>
          + {t("addAnnouncement")}
        </button>
      </form>
      {state.error && (
        <p className="text-xs text-danger">{t("announcementValidationError")}</p>
      )}
    </section>
  );
}
