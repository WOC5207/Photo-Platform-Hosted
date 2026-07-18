import "server-only";
import { cache } from "react";
import { prisma } from "@/lib/db";

export interface PlatformSettings {
  registrationNoticeEnabled: boolean;
  registrationNoticeDelaySeconds: number;
  registrationNoticeTitleEn: string;
  registrationNoticeTitleZh: string;
  registrationNoticeBodyEn: string;
  registrationNoticeBodyZh: string;
}

const DEFAULTS: PlatformSettings = {
  registrationNoticeEnabled: false,
  registrationNoticeDelaySeconds: 5,
  registrationNoticeTitleEn: "",
  registrationNoticeTitleZh: "",
  registrationNoticeBodyEn: "",
  registrationNoticeBodyZh: ""
};

/** Platform-wide settings with usable defaults before the singleton is saved. */
export const getPlatformSettings = cache(async (): Promise<PlatformSettings> => {
  const settings = await prisma.platformSettings.findUnique({
    where: { id: "platform" }
  });
  return settings ?? DEFAULTS;
});
