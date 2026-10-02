import "server-only";
import { cache } from "react";
import { prisma } from "@/lib/db";
import type { SiteThemeColors, SiteThemeMode } from "@/lib/themeColor";

export interface PlatformSettings {
  registrationNoticeEnabled: boolean;
  registrationNoticeDelaySeconds: number;
  registrationNoticeTitleEn: string;
  registrationNoticeTitleZh: string;
  registrationNoticeBodyEn: string;
  registrationNoticeBodyZh: string;
  registrationNoticeMode: "information" | "consent";
  registrationNoticeVersion: number;
  bookingPriceNoticeTitleEn: string;
  bookingPriceNoticeTitleZh: string;
  bookingPriceNoticeBodyEn: string;
  bookingPriceNoticeBodyZh: string;
  bookingPriceNoticeVersion: number;
  moderationEnabled: boolean;
  moderationPolicyVersion: number;
  moderationThresholdSelfHarm: number | null;
  moderationThresholdSelfHarmIntent: number | null;
  moderationThresholdSelfHarmInstructions: number | null;
  moderationThresholdSexual: number | null;
  moderationThresholdViolence: number | null;
  moderationThresholdViolenceGraphic: number | null;
  publicBackgroundColor: string;
  publicSurfaceColor: string;
  publicFieldColor: string;
  publicTextColor: string;
  publicThemeColor: string;
  publicDarkBackgroundColor: string;
  publicDarkSurfaceColor: string;
  publicDarkFieldColor: string;
  publicDarkTextColor: string;
  publicDarkThemeColor: string;
}

const DEFAULTS: PlatformSettings = {
  registrationNoticeEnabled: false,
  registrationNoticeDelaySeconds: 5,
  registrationNoticeTitleEn: "",
  registrationNoticeTitleZh: "",
  registrationNoticeBodyEn: "",
  registrationNoticeBodyZh: "",
  registrationNoticeMode: "information",
  registrationNoticeVersion: 1,
  bookingPriceNoticeTitleEn: "",
  bookingPriceNoticeTitleZh: "",
  bookingPriceNoticeBodyEn: "",
  bookingPriceNoticeBodyZh: "",
  bookingPriceNoticeVersion: 1,
  moderationEnabled: false,
  moderationPolicyVersion: 1,
  moderationThresholdSelfHarm: null,
  moderationThresholdSelfHarmIntent: null,
  moderationThresholdSelfHarmInstructions: null,
  moderationThresholdSexual: null,
  moderationThresholdViolence: null,
  moderationThresholdViolenceGraphic: null,
  publicBackgroundColor: "",
  publicSurfaceColor: "",
  publicFieldColor: "",
  publicTextColor: "",
  publicThemeColor: "",
  publicDarkBackgroundColor: "",
  publicDarkSurfaceColor: "",
  publicDarkFieldColor: "",
  publicDarkTextColor: "",
  publicDarkThemeColor: ""
};

/** Platform-wide settings with usable defaults before the singleton is saved. */
export const getPlatformSettings = cache(async (): Promise<PlatformSettings> => {
  const settings = await prisma.platformSettings.findUnique({
    where: { id: "platform" }
  });
  if (!settings) return DEFAULTS;
  return {
    ...settings,
    registrationNoticeMode:
      settings.registrationNoticeMode === "consent" ? "consent" : "information"
  };
});

/** The admin-chosen light and dark palettes for the platform's public pages. */
export function platformPublicPalettes(
  settings: PlatformSettings
): Record<SiteThemeMode, SiteThemeColors> {
  return {
    light: {
      backgroundColor: settings.publicBackgroundColor,
      surfaceColor: settings.publicSurfaceColor,
      fieldColor: settings.publicFieldColor,
      textColor: settings.publicTextColor,
      themeColor: settings.publicThemeColor
    },
    dark: {
      backgroundColor: settings.publicDarkBackgroundColor,
      surfaceColor: settings.publicDarkSurfaceColor,
      fieldColor: settings.publicDarkFieldColor,
      textColor: settings.publicDarkTextColor,
      themeColor: settings.publicDarkThemeColor
    }
  };
}
