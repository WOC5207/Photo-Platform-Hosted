"use client";

import { useActionState, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import {
  saveModerationSettings,
  type ModerationSettingsState
} from "@/app/[locale]/admin/(protected)/moderation/actions";
import type { PlatformSettings } from "@/lib/platformSettings";
import Button from "@/components/ui/Button";
import { Field, Input } from "@/components/ui/Field";
import StatusMessage from "@/components/ui/StatusMessage";
import { useUnsavedChanges } from "@/hooks/useUnsavedChanges";

const thresholds = [
  ["selfHarm", "moderationThresholdSelfHarm", "categorySelfHarm"],
  ["selfHarmIntent", "moderationThresholdSelfHarmIntent", "categorySelfHarmIntent"],
  [
    "selfHarmInstructions",
    "moderationThresholdSelfHarmInstructions",
    "categorySelfHarmInstructions"
  ],
  ["sexual", "moderationThresholdSexual", "categorySexual"],
  ["violence", "moderationThresholdViolence", "categoryViolence"],
  [
    "violenceGraphic",
    "moderationThresholdViolenceGraphic",
    "categoryViolenceGraphic"
  ]
] as const;

export default function ModerationSettingsForm({
  settings,
  configured
}: {
  settings: PlatformSettings;
  configured: boolean;
}) {
  const t = useTranslations("adminModeration");
  const tc = useTranslations("common");
  const [state, action, pending] = useActionState<
    ModerationSettingsState,
    FormData
  >(saveModerationSettings, {});
  const [dirty, setDirty] = useState(false);
  useUnsavedChanges(dirty, tc("unsavedNavigationConfirm"));

  useEffect(() => {
    if (state.ok) setDirty(false);
  }, [state]);

  return (
    <section className="rounded-xl border border-border bg-surface p-4 sm:p-5">
      <h2 className="text-lg font-semibold">{t("settingsTitle")}</h2>
      <p className="mt-1 text-sm text-fg-subtle">{t("settingsDescription")}</p>
      <form
        action={action}
        onChange={() => setDirty(true)}
        className="mt-5 flex flex-col gap-5"
      >
        <label className="flex items-start gap-3 rounded-lg border border-border p-3">
          <input
            type="checkbox"
            name="enabled"
            defaultChecked={settings.moderationEnabled}
            disabled={pending || !configured}
            className="mt-0.5 size-4 accent-fg"
          />
          <span>
            <span className="block text-sm font-semibold">{t("enabled")}</span>
            <span className="mt-1 block text-xs text-fg-subtle">
              {configured ? t("enabledHint") : t("notConfigured")}
            </span>
          </span>
        </label>

        <div className="grid gap-4 sm:grid-cols-2">
          {thresholds.map(([name, key, label]) => (
            <Field
              key={name}
              label={t(label)}
              htmlFor={`moderation-${name}`}
              hint={t("thresholdHint")}
            >
              <Input
                id={`moderation-${name}`}
                name={name}
                type="number"
                min={0}
                max={1}
                step={0.01}
                defaultValue={settings[key] ?? ""}
                placeholder={t("providerOnly")}
                disabled={pending}
              />
            </Field>
          ))}
        </div>

        <StatusMessage kind="info">{t("limitations")}</StatusMessage>
        {state.error === "validation" && (
          <StatusMessage kind="error">{t("validationError")}</StatusMessage>
        )}
        {state.error === "notConfigured" && (
          <StatusMessage kind="error">{t("notConfigured")}</StatusMessage>
        )}
        {state.ok && !dirty && (
          <StatusMessage kind="success">{tc("saved")}</StatusMessage>
        )}
        <div className="flex justify-end border-t border-border pt-4">
          <Button type="submit" variant="primary" disabled={pending || !dirty}>
            {tc("save")}
          </Button>
        </div>
      </form>
    </section>
  );
}
