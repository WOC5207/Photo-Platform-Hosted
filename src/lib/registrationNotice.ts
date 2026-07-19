import "server-only";
import { createHash } from "crypto";

export function registrationNoticeHash(notice: {
  registrationNoticeMode: string;
  registrationNoticeVersion: number;
  registrationNoticeTitleEn: string;
  registrationNoticeTitleZh: string;
  registrationNoticeBodyEn: string;
  registrationNoticeBodyZh: string;
}): string {
  return createHash("sha256")
    .update(
      JSON.stringify({
        mode: notice.registrationNoticeMode,
        version: notice.registrationNoticeVersion,
        titleEn: notice.registrationNoticeTitleEn,
        titleZh: notice.registrationNoticeTitleZh,
        bodyEn: notice.registrationNoticeBodyEn,
        bodyZh: notice.registrationNoticeBodyZh
      })
    )
    .digest("hex");
}
