import { getLocale, getTranslations } from "next-intl/server";
import { prisma } from "@/lib/db";
import { cosplanTemplateUrl } from "@/lib/cosplanStorage";
import { pickText } from "@/lib/content";
import PageHeader from "@/components/ui/PageHeader";
import SectionHeading from "@/components/ui/SectionHeading";
import CosplanTemplateUpload from "@/components/admin/CosplanTemplateUpload";
import CosplanSlotEditor from "@/components/admin/CosplanSlotEditor";
import ConfirmSubmit from "@/components/admin/ConfirmSubmit";
import { buttonClasses } from "@/components/ui/Button";
import { controlClasses } from "@/components/ui/Field";
import { deleteCosplanTemplate, moveCosplanTemplate, toggleCosplanTemplate, updateCosplanTemplate } from "./actions";
import { parseCosplanSlots } from "@/lib/cosplanTypes";

export const dynamic = "force-dynamic";

export default async function CosplanAdminPage() {
  const [locale, t, templates] = await Promise.all([
    getLocale(),
    getTranslations("adminCosplan"),
    prisma.cosplanTemplate.findMany({ orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] })
  ]);
  const uploadLabels = {
    titleEn: t("titleEn"), titleZh: t("titleZh"), width: t("width"), height: t("height"), image: t("image"),
    create: t("create"), replace: t("replaceImage"), working: t("working"), success: t("uploadSuccess"), error: t("uploadError"), dimensionsHint: t("dimensionsHint")
  };
  const slotLabels = {
    title: t("slotEditorTitle"), hint: t("slotEditorHint"), add: t("addSlot"), save: t("saveSlots"),
    saving: t("working"), saved: t("slotsSaved"), error: t("slotError"), empty: t("slotEmpty"),
    nameEn: t("slotNameEn"), nameZh: t("slotNameZh"), remove: t("removeSlot"),
    foreground: t("foreground"), foregroundHint: t("foregroundHint"), uploadForeground: t("uploadForeground"),
    removeForeground: t("removeForeground"), foregroundActive: t("foregroundActive"),
    detect: t("detectSlots"), detecting: t("detectingSlots"), detectionTitle: t("detectionTitle"),
    detectionHint: t("detectionHint"), advancedDetection: t("advancedDetection"), preset: t("detectionPreset"),
    strict: t("detectionStrict"), standard: t("detectionStandard"), loose: t("detectionLoose"),
    inset: t("detectionInset"), insetHint: t("detectionInsetHint"), candidatesFound: t("candidatesFound"),
    noCandidates: t("noCandidates"), recommended: t("candidateRecommended"), review: t("candidateReview"),
    applyCandidates: t("applyCandidates"), replaceCandidates: t("replaceCandidates"), replaceConfirm: t("replaceCandidatesConfirm"),
    detectionError: t("detectionError"), detectionBusy: t("detectionBusy"), detectionTimeout: t("detectionTimeout"),
    detectionStale: t("detectionStale"), preview: t("slotPreview"), expandPreview: t("expandPreview"),
    collapsePreview: t("collapsePreview"), rectangularShape: t("rectangularShape"), irregularShape: t("irregularShape")
  };

  return (
    <div className="flex flex-col gap-8">
      <PageHeader title={t("title")} description={t("description")} />
      <section className="ui-panel-raised p-5 sm:p-6">
        <SectionHeading title={t("newTemplate")} description={t("newTemplateHint")} />
        <div className="mt-5"><CosplanTemplateUpload labels={uploadLabels} /></div>
      </section>
      <section className="flex flex-col gap-4">
        <SectionHeading title={t("templates")} description={t("templatesHint")} />
        {templates.length === 0 ? <p className="ui-panel p-6 text-sm text-fg-subtle">{t("empty")}</p> : (
          <ul className="grid gap-4">
            {templates.map((template, index) => (
              <li key={template.id} className="ui-panel flex min-w-0 flex-col gap-4 p-4 sm:p-5">
                <div className="grid gap-4 sm:grid-cols-[9rem_1fr]">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={cosplanTemplateUrl(template.assetToken)} alt="" className="ui-image-frame aspect-[4/5] w-full rounded-lg object-cover" />
                  <div className="min-w-0">
                    <div className="flex items-start justify-between gap-3">
                      <div><p className="font-meta text-[0.6875rem] text-accent-text">{String(index + 1).padStart(2, "0")}</p><h3 className="font-display mt-1 text-xl font-semibold">{pickText(locale, template.titleEn, template.titleZh)}</h3></div>
                      <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${template.published ? "border-success-border bg-success-surface text-success-strong" : "border-border bg-control text-fg-subtle"}`}>{template.published ? t("published") : t("draft")}</span>
                    </div>
                    <p className="font-meta mt-2 text-xs text-fg-subtle">{template.width} × {template.height} PX</p>
                    <div className="mt-4 flex flex-wrap gap-2">
                      <form action={moveCosplanTemplate}><input type="hidden" name="id" value={template.id} /><input type="hidden" name="direction" value="up" /><button className={buttonClasses({ size: "compact" })} disabled={index === 0}>{t("moveUp")}</button></form>
                      <form action={moveCosplanTemplate}><input type="hidden" name="id" value={template.id} /><input type="hidden" name="direction" value="down" /><button className={buttonClasses({ size: "compact" })} disabled={index === templates.length - 1}>{t("moveDown")}</button></form>
                      <form action={toggleCosplanTemplate}><input type="hidden" name="id" value={template.id} /><input type="hidden" name="published" value={String(!template.published)} /><button className={buttonClasses({ variant: template.published ? "secondary" : "primary", size: "compact" })}>{template.published ? t("unpublish") : t("publish")}</button></form>
                      <form action={deleteCosplanTemplate}><input type="hidden" name="id" value={template.id} /><ConfirmSubmit label={t("delete")} confirmText={t("deleteConfirm")} /></form>
                    </div>
                  </div>
                </div>
                <details className="border-t border-border pt-3">
                  <summary className="flex min-h-11 cursor-pointer items-center font-semibold text-fg-muted">{t("editDetails")}</summary>
                  <div className="mt-3 border-b border-border pb-5">
                    <CosplanSlotEditor
                      template={{
                        id: template.id,
                        assetToken: template.assetToken,
                        layoutVersion: template.layoutVersion,
                        imageUrl: cosplanTemplateUrl(template.assetToken),
                        foregroundUrl: template.foregroundToken ? cosplanTemplateUrl(template.foregroundToken) : null,
                        width: template.width,
                        height: template.height,
                        slots: parseCosplanSlots(template.slots, template.width, template.height)
                      }}
                      labels={slotLabels}
                    />
                  </div>
                  <form action={updateCosplanTemplate} className="mt-3 grid gap-3 sm:grid-cols-2">
                    <input type="hidden" name="id" value={template.id} />
                    <label className="text-sm font-semibold text-fg-muted">{t("titleEn")}<input name="titleEn" defaultValue={template.titleEn} className={`${controlClasses} mt-1`} required /></label>
                    <label className="text-sm font-semibold text-fg-muted">{t("titleZh")}<input name="titleZh" defaultValue={template.titleZh} className={`${controlClasses} mt-1`} required /></label>
                    <label className="text-sm font-semibold text-fg-muted">{t("width")}<input name="width" type="number" min="320" max="4096" defaultValue={template.width} className={`${controlClasses} mt-1`} required /></label>
                    <label className="text-sm font-semibold text-fg-muted">{t("height")}<input name="height" type="number" min="320" max="4096" defaultValue={template.height} className={`${controlClasses} mt-1`} required /></label>
                    <button className={buttonClasses({ variant: "primary", className: "sm:col-span-2 sm:justify-self-start" })}>{t("save")}</button>
                  </form>
                  <div className="mt-5 border-t border-border pt-4"><CosplanTemplateUpload labels={uploadLabels} template={template} /></div>
                </details>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
