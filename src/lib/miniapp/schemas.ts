import { z } from "zod";

export const localeSchema = z.enum(["zh", "en"]);

export const wechatAuthSchema = z
  .object({
    code: z.string().trim().min(1).max(256)
  })
  .strict();

export const bookingCreateSchema = z
  .object({
    slotId: z.string().trim().min(1).max(100),
    name: z.string().trim().min(1).max(200),
    subject: z.string().trim().max(200).default(""),
    contactValue: z.string().trim().min(1).max(200),
    email: z.string().trim().max(200).email().or(z.literal("")).default(""),
    notes: z.string().trim().max(2000).default(""),
    locale: localeSchema.default("zh")
  })
  .strict();

export const bookingImportSchema = z
  .object({
    cancelToken: z
      .string()
      .trim()
      .min(16)
      .max(100)
      .regex(/^[a-z0-9]+$/)
  })
  .strict();

export const lotteryEntrySchema = z
  .object({
    name: z.string().trim().min(1).max(200),
    subject: z.string().trim().max(200).default(""),
    contactValue: z.string().trim().min(1).max(200)
  })
  .strict();

export const lotteryImportSchema = z
  .object({
    drawToken: z
      .string()
      .trim()
      .min(1)
      .max(100)
      .regex(/^[a-zA-Z0-9]+$/),
    entryToken: z
      .string()
      .trim()
      .min(5)
      .max(12)
      .regex(/^[a-zA-Z0-9]+$/),
    name: z.string().trim().min(1).max(200),
    contactValue: z.string().trim().min(1).max(200)
  })
  .strict();

export const reportReasonSchema = z.enum([
  "sexual",
  "violence",
  "self_harm",
  "harassment",
  "privacy",
  "copyright",
  "other"
]);

export const contentReportSchema = z
  .object({
    reason: reportReasonSchema,
    details: z.string().trim().max(1000).default("")
  })
  .strict();

export const deleteMeSchema = z
  .object({
    confirmation: z.literal("DELETE")
  })
  .strict();

export const photographerSearchQuerySchema = z
  .object({
    q: z.string().trim().min(1).max(100),
    cursor: z.string().max(2048).optional(),
    limit: z.coerce.number().int().min(1).max(50).default(20)
  })
  .strict();

export type BookingCreateInput = z.infer<typeof bookingCreateSchema>;
export type BookingImportInput = z.infer<typeof bookingImportSchema>;
export type LotteryEntryInput = z.infer<typeof lotteryEntrySchema>;
export type LotteryImportInput = z.infer<typeof lotteryImportSchema>;
export type ContentReportInput = z.infer<typeof contentReportSchema>;
