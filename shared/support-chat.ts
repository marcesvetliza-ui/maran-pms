import { z } from "zod";

export const supportImageSchema = z
  .object({
    name: z.string().trim().min(1).max(100),
    dataUrl: z
      .string()
      .max(700000)
      .regex(/^data:image\/(png|jpeg);base64,[A-Za-z0-9+/]+=*$/),
  })
  .strict();
const chatMessage = z
  .object({
    requestId: z.string().uuid(),
    text: z.string().trim().max(4000).default(""),
    images: z.array(supportImageSchema).max(1).default([]),
  })
  .strict();
const hasContent = (v: { text: string; images: unknown[] }) =>
  v.text.length >= 2 || v.images.length > 0;
export const supportChatMessageSchema = chatMessage.refine(
  hasContent,
  "Escribí tu consulta o adjuntá una captura.",
);
export const supportChatCreateSchema = chatMessage
  .extend({ page: z.string().max(200).optional() })
  .strict()
  .refine(hasContent, "Escribí tu consulta o adjuntá una captura.");
export type SupportImage = { id: string; name: string };
export type SupportUsage = {
  day: string;
  renewsAt: string;
  dailyUsd: number;
  spentUsd: number;
  reservedUsd: number;
  remainingUsd: number;
  responsesUsed: number;
  responsesLimit: number;
  investigationsUsed: number;
  investigationsLimit: number;
  paused: boolean;
  reason: string | null;
};
export type SupportAlert = {
  id: string;
  kind: string;
  title: string;
  text: string;
  caseId: string | null;
  createdAt: string;
  delivery: "pending" | "sent" | "failed" | "disabled" | "obsolete";
  attempts: number;
};
export const supportBudgetChangeSchema = z
  .object({
    requestId: z.string().uuid(),
    dailyUsd: z.number().min(0.1).max(10).multipleOf(0.01),
    reason: z.string().trim().min(5).max(500),
  })
  .strict();
