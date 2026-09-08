import { z } from "zod";

export const equipmentContactSchema = z.object({
  equipmentContactMethod: z.enum(["", "phone", "email", "wechat", "other"]),
  equipmentContactLabel: z.string().trim().max(80),
  equipmentContactValue: z.string().trim().max(250)
}).superRefine((value, ctx) => {
  if (!value.equipmentContactValue) return;
  const method = value.equipmentContactMethod;
  if (!method || (method === "other" && !value.equipmentContactLabel) ||
    (method === "email" && !z.email().safeParse(value.equipmentContactValue).success) ||
    (method === "phone" && !/^\+?[\d ()-]{3,40}$/.test(value.equipmentContactValue))) {
    ctx.addIssue({ code: "custom", message: "Invalid contact details" });
  }
});

/** Decode only an equipment label URL; never follow the supplied address. */
export function equipmentQrToken(value: string): string | null {
  if (typeof value !== "string" || value.length > 2048) return null;
  try {
    const url = new URL(value.trim());
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.search || url.hash) return null;
    return /^\/(?:en|zh)\/equipment\/([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})\/?$/i.exec(url.pathname)?.[1] ?? null;
  } catch { return null; }
}
