"use client";

import { useCallback, type ComponentProps } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import PhotoWizard from "@/components/admin/wizard/PhotoWizard";
import { confirmLeavingDrafts } from "@/hooks/useUnsavedChanges";
import { BookingPanel, useScreenKeys, useStage } from "../booking/shared";
import { StudioHeading } from "./shared";
import { useStudioTable } from "./table";
import type { StudioAccount, StudioEventDetail, StudioPhoto } from "./types";

type WizardProps = Omit<ComponentProps<typeof PhotoWizard>, "onPublished">;

/**
 * Adding photos: the classic photo wizard (upload, size, credits, publish)
 * in the panel, with the event's prints on the light table behind. Publishing
 * lands on the photo manager with the new prints laid out.
 */
export default function UploadScreen({
  account,
  event,
  photos,
  wizard
}: {
  account: StudioAccount;
  event: StudioEventDetail;
  photos: StudioPhoto[];
  wizard: WizardProps;
}) {
  const t = useTranslations("album3d");
  const router = useRouter();
  const { path } = useStage();
  const target = path({ kind: "studio", username: account.username, page: "photos", id: event.id });

  useStudioTable(event.id, photos, 0);
  const published = useCallback(() => router.replace(target, { scroll: false }), [router, target]);
  // Esc leaves the wizard as a link would: only once an open upload is confirmed lost.
  useScreenKeys((k) => (k === "Escape" || k === "Backspace") && !confirmLeavingDrafts());

  return (
    <BookingPanel expanded="full">
      <StudioHeading trail={event.title} title={t("studioUpload")} />
      <div className="mt-6">
        <PhotoWizard {...wizard} onPublished={published} />
      </div>
    </BookingPanel>
  );
}
