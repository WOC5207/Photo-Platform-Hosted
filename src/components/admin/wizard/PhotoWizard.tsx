"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import {
  usePendingUploadQueue,
  type AssignedCredit,
  type CreditProfile,
  type PendingPhotoValue
} from "./usePendingUploadQueue";
import WizardStepper from "./WizardStepper";
import UploadStep from "./UploadStep";
import CompressionStep from "./CompressionStep";
import CreditsStep from "./CreditsStep";
import ConfirmStep, { buildCreditGroups, type PublishPhase } from "./ConfirmStep";
import { btnCls, formatBytes, primaryBtnCls } from "./ui";

export default function PhotoWizard({
  eventId,
  initialPendingPhotos,
  allowOriginal,
  uploadMaxBytes,
  creditProfiles,
  creditTerm,
  subjectTerm
}: {
  eventId: string;
  initialPendingPhotos: PendingPhotoValue[];
  allowOriginal: boolean;
  uploadMaxBytes: number;
  creditProfiles: CreditProfile[];
  creditTerm: string;
  subjectTerm: string;
}) {
  const t = useTranslations("adminEvents");
  const tw = useTranslations("photoWizard");
  const router = useRouter();

  const queue = usePendingUploadQueue({
    eventId,
    initialPendingPhotos,
    uploadMaxBytes,
    confirmRemoveReady: (name) =>
      window.confirm(t("removePendingFileConfirm", { name })),
    confirmClear: (count, totalBytes) =>
      window.confirm(
        t("clearPendingQueueConfirm", { count, size: formatBytes(totalBytes) })
      )
  });

  const [stepIndex, setStepIndex] = useState(0);
  const [creditsByPhoto, setCreditsByPhoto] = useState<
    Record<string, AssignedCredit[]>
  >({});
  const [ackUncredited, setAckUncredited] = useState(false);
  const [publishPhase, setPublishPhase] = useState<PublishPhase>("idle");
  const [publishedCount, setPublishedCount] = useState(0);

  const steps = [
    { key: "upload", label: tw("stepUpload") },
    { key: "compress", label: tw("stepCompress") },
    { key: "credits", label: creditTerm },
    { key: "confirm", label: tw("stepConfirm") }
  ];

  // Transfers must finish before advancing, but background compression need
  // not: compressing photos are browsable and get credited while the server
  // finishes them; only Publish waits for compression to complete.
  const uploadsSettled =
    queue.browsableFiles.length > 0 &&
    !queue.transferWorking &&
    !queue.clearing;
  const publishing = publishPhase === "publishing";
  // Photos still lacking a credit once the credits step is reached. The
  // no-credit warning and its acknowledgement now live on that step, so the
  // acknowledgement is what gates advancing to Confirm.
  const uncreditedCount = queue.browsableFiles.filter(
    (item) => (creditsByPhoto[item.photoId] ?? []).length === 0
  ).length;
  const canContinue =
    stepIndex === 0
      ? uploadsSettled
      : stepIndex === 1
        ? queue.browsableFiles.length > 0 && !queue.transferWorking
        : stepIndex === 2
          ? uncreditedCount === 0 || ackUncredited
          : true;
  const continueHint =
    stepIndex === 0 && queue.files.length > 0 && !uploadsSettled
      ? tw("waitUploads")
      : stepIndex === 2 && uncreditedCount > 0 && !ackUncredited
        ? tw("ackCreditsToContinue")
        : null;

  function assignCredits(photoIds: string[], credits: AssignedCredit[]) {
    setCreditsByPhoto((current) => {
      const next = { ...current };
      for (const photoId of photoIds) {
        if (credits.length === 0) delete next[photoId];
        else next[photoId] = credits;
      }
      return next;
    });
    // A changed credit assignment invalidates a previous "publish without
    // credit" acknowledgement.
    setAckUncredited(false);
  }

  async function publish() {
    if (publishing || queue.locked) return;
    const groups = buildCreditGroups(queue.readyFiles, creditsByPhoto);
    if (groups.length === 0) return;
    setPublishPhase("publishing");
    queue.setLocked(true);
    let published = publishedCount;
    let failed = false;
    try {
      // Sequential, one PATCH per credit group: each call is idempotent for
      // its exact id set, so a retry after a mid-sequence failure simply
      // resumes with the groups that are still pending.
      for (const group of groups) {
        const ok = await queue.finalizeBatch(group.items, group.credits);
        if (!ok) {
          failed = true;
          break;
        }
        published += group.items.length;
      }
    } finally {
      queue.setLocked(false);
    }
    setPublishedCount(published);
    router.refresh();
    if (failed) {
      setPublishPhase("error");
      return;
    }
    setPublishPhase("success");
    router.push(`/dashboard/events/${eventId}#photos`);
  }

  return (
    <div className="flex flex-col gap-6">
      <datalist id="known-credits">
        {creditProfiles.map((profile) => (
          <option key={profile.creditName} value={profile.creditName} />
        ))}
      </datalist>

      <WizardStepper
        steps={steps}
        currentIndex={stepIndex}
        onStepClick={(index) => {
          if (!publishing && index < stepIndex) setStepIndex(index);
        }}
        stepAriaLabel={(index, label) =>
          tw("stepAria", { current: index + 1, total: steps.length, name: label })
        }
      />

      {stepIndex === 0 && (
        <UploadStep queue={queue} uploadMaxBytes={uploadMaxBytes} />
      )}
      {stepIndex === 1 && (
        <CompressionStep queue={queue} allowOriginal={allowOriginal} />
      )}
      {stepIndex === 2 && (
        <CreditsStep
          queue={queue}
          creditsByPhoto={creditsByPhoto}
          onAssign={assignCredits}
          creditProfiles={creditProfiles}
          creditTerm={creditTerm}
          subjectTerm={subjectTerm}
          ackUncredited={ackUncredited}
          onAckUncredited={setAckUncredited}
        />
      )}
      {stepIndex === 3 && (
        <ConfirmStep
          queue={queue}
          creditsByPhoto={creditsByPhoto}
          publishPhase={publishPhase}
          publishedCount={publishedCount}
          onPublish={() => void publish()}
        />
      )}

      <div className="flex items-center justify-between gap-3 border-t border-border pt-4">
        <button
          type="button"
          disabled={stepIndex === 0 || publishing}
          onClick={() => setStepIndex((current) => Math.max(0, current - 1))}
          className={btnCls}
        >
          ← {tw("back")}
        </button>
        <div className="flex items-center gap-3">
          {continueHint && (
            <span role="status" className="text-xs text-fg-subtle">
              {continueHint}
            </span>
          )}
          {stepIndex < steps.length - 1 && (
            <button
              type="button"
              disabled={!canContinue}
              onClick={() =>
                setStepIndex((current) => Math.min(steps.length - 1, current + 1))
              }
              className={primaryBtnCls}
            >
              {tw("continue")} →
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
