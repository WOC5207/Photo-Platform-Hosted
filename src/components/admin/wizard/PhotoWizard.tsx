"use client";

import { useRef, useState } from "react";
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
import { useUnsavedChanges } from "@/hooks/useUnsavedChanges";

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
  const tc = useTranslations("common");
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
  const [commentByPhoto, setCommentByPhoto] = useState<Record<string, string>>(
    {}
  );
  const [ackUncredited, setAckUncredited] = useState(false);
  const [publishPhase, setPublishPhase] = useState<PublishPhase>("idle");
  const [publishedCount, setPublishedCount] = useState(0);
  const guidanceTimer = useRef<number | null>(null);
  const hasDraft =
    publishPhase !== "success" &&
    (queue.files.length > 0 ||
      Object.keys(creditsByPhoto).length > 0 ||
      Object.keys(commentByPhoto).length > 0);
  useUnsavedChanges(hasDraft, tc("unsavedNavigationConfirm"));

  const steps = [
    { key: "upload", label: tw("stepUpload") },
    { key: "compress", label: tw("stepCompress") },
    { key: "credits", label: creditTerm },
    { key: "confirm", label: tw("stepConfirm") }
  ];

  // Transfers must finish before advancing, but background compression need
  // not: compressing photos are browsable and get credited while the server
  // finishes them; only Publish waits for compression to complete.
  const failedCount = queue.files.filter((item) => item.state === "failed").length;
  const uploadsSettled =
    queue.browsableFiles.length > 0 &&
    failedCount === 0 &&
    !queue.transferWorking &&
    !queue.clearing;
  const publishing = publishPhase === "publishing";
  // Photos still lacking a credit once the credits step is reached. The
  // no-credit warning and its acknowledgement now live on that step, so the
  // acknowledgement is what gates advancing to Confirm.
  const uncreditedCount = queue.browsableFiles.filter(
    (item) => (creditsByPhoto[item.photoId] ?? []).length === 0
  ).length;
  // Advancing past the compression step requires every photo to have a size
  // chosen (none left awaiting) — that choice is what starts compression. The
  // encode itself may still be running: it finishes in the background while the
  // user credits, and only Publish waits for it.
  const canContinue =
    stepIndex === 0
      ? uploadsSettled
      : stepIndex === 1
        ? queue.browsableFiles.length > 0 &&
          failedCount === 0 &&
          !queue.transferWorking &&
          queue.awaitingCount === 0
        : stepIndex === 2
          ? failedCount === 0 &&
            (uncreditedCount === 0 || ackUncredited)
          : true;
  const canPublish =
    queue.browsableFiles.length > 0 &&
    failedCount === 0 &&
    !publishing &&
    !queue.queueWorking;
  const continueHint =
    failedCount > 0
      ? tw("resolveFailedFiles", { count: failedCount })
      : stepIndex === 0 && queue.files.length > 0 && !uploadsSettled
      ? tw("waitUploads")
      : stepIndex === 1 && queue.awaitingCount > 0
        ? tw("chooseSizeToContinue", { count: queue.awaitingCount })
        : stepIndex === 2 && uncreditedCount > 0 && !ackUncredited
          ? tw("ackCreditsToContinue")
          : stepIndex === 3 && queue.queueWorking
            ? tw("finishingCompression")
          : null;
  const forwardLabel =
    stepIndex === 0
      ? tw("continueToCompression")
      : stepIndex === 1
        ? tw("continueToCredits", { term: creditTerm })
        : stepIndex === 2
          ? tw("continueToReview")
          : publishing
            ? tw("publishing")
            : tw("publish", { count: queue.browsableFiles.length });
  const hasGuidanceTarget =
    failedCount > 0 ||
    (stepIndex === 0 &&
      queue.files.length === 0 &&
      !queue.clearing) ||
    (stepIndex === 1 && queue.awaitingCount > 0) ||
    (stepIndex === 2 &&
      uncreditedCount > 0 &&
      !ackUncredited);
  const forwardDisabled =
    publishing ||
    (stepIndex < steps.length - 1
      ? !canContinue && !hasGuidanceTarget
      : !canPublish);

  function guideToElement(id: string) {
    const target = document.getElementById(id);
    if (!target) return;

    document
      .querySelectorAll<HTMLElement>("[data-guidance-active='true']")
      .forEach((element) => delete element.dataset.guidanceActive);
    if (guidanceTimer.current !== null) {
      window.clearTimeout(guidanceTimer.current);
    }
    target.dataset.guidanceActive = "true";
    target.scrollIntoView({
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "auto"
        : "smooth",
      block: "center"
    });
    target.focus({ preventScroll: true });
    guidanceTimer.current = window.setTimeout(() => {
      delete target.dataset.guidanceActive;
      guidanceTimer.current = null;
    }, 1800);
  }

  function guideToRequiredAction() {
    if (failedCount > 0) {
      if (stepIndex !== 0) {
        setStepIndex(0);
        window.setTimeout(() => guideToElement("wizard-upload-status"), 0);
      } else {
        guideToElement("wizard-upload-status");
      }
      return;
    }
    if (stepIndex === 0 && queue.files.length === 0) {
      guideToElement("wizard-upload-action");
      return;
    }
    if (stepIndex === 1 && queue.awaitingCount > 0) {
      guideToElement("wizard-compression-actions");
      return;
    }
    if (stepIndex === 2 && uncreditedCount > 0 && !ackUncredited) {
      guideToElement("wizard-uncredited-action");
    }
  }

  function handleForward() {
    if (stepIndex < steps.length - 1 && !canContinue) {
      guideToRequiredAction();
      return;
    }
    if (stepIndex < steps.length - 1) {
      setStepIndex((current) =>
        Math.min(steps.length - 1, current + 1)
      );
      return;
    }
    void publish();
  }

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

  function assignComment(photoIds: string[], comment: string) {
    setCommentByPhoto((current) => {
      const next = { ...current };
      const trimmed = comment.trim();
      for (const photoId of photoIds) {
        if (trimmed.length === 0) delete next[photoId];
        else next[photoId] = trimmed;
      }
      return next;
    });
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
        const ok = await queue.finalizeBatch(
          group.items,
          group.credits,
          commentByPhoto
        );
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
          commentByPhoto={commentByPhoto}
          onAssignComment={assignComment}
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
          failedCount={failedCount}
          publishPhase={publishPhase}
          publishedCount={publishedCount}
        />
      )}

      <div className="sticky bottom-3 z-20 flex items-center justify-between gap-3 rounded-xl border border-border-strong bg-page/95 p-3 shadow-[0_12px_36px_rgba(0,0,0,0.18)] backdrop-blur max-sm:flex-col max-sm:items-stretch">
        <button
          type="button"
          disabled={stepIndex === 0 || publishing}
          onClick={() => setStepIndex((current) => Math.max(0, current - 1))}
          className={`${btnCls} max-sm:self-start`}
        >
          ← {tw("back")}
        </button>
        <div className="flex items-center justify-end gap-3 max-sm:flex-col max-sm:items-stretch">
          {continueHint && (
            <span
              id="wizard-forward-hint"
              role="status"
              className="max-w-md rounded-lg border border-border bg-surface px-3 py-2 text-xs font-medium text-fg-muted"
            >
              {continueHint}
            </span>
          )}
          <button
            type="button"
            disabled={forwardDisabled}
            aria-describedby={continueHint ? "wizard-forward-hint" : undefined}
            onClick={handleForward}
            className={`${primaryBtnCls} min-h-12 px-6 shadow-md max-sm:w-full`}
          >
            {forwardLabel}
            {!publishing && stepIndex < steps.length - 1 ? " →" : ""}
          </button>
        </div>
      </div>
    </div>
  );
}
