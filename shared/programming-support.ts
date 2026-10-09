import { z } from "zod";
export const supportCreateSchema = z
  .object({
    requestId: z.string().uuid(),
    title: z.string().trim().min(5).max(160),
    module: z.enum([
      "recepcion",
      "administracion",
      "facturacion",
      "grupos",
      "inventario",
      "restaurant",
      "spa",
      "otro",
    ]),
    actual: z.string().trim().min(10).max(4000),
    expected: z.string().trim().min(5).max(2000),
    steps: z.string().trim().max(4000).default(""),
    reference: z.string().trim().max(200).default(""),
    page: z.string().trim().max(200).default(""),
  })
  .strict();
export const supportMessageSchema = z
  .object({
    requestId: z.string().uuid(),
    text: z.string().trim().min(2).max(4000),
  })
  .strict();
export const supportRunSchema = z
  .object({ requestId: z.string().uuid() })
  .strict();
export const diagnosisSchema = z
  .object({
    summary: z.string().max(3000),
    certainty: z.enum([
      "hipotesis",
      "sustentado_en_codigo",
      "falta_informacion",
    ]),
    cause: z.string().max(5000),
    proposal: z.string().max(5000),
    proposedTests: z.array(z.string().max(1000)).max(12),
    questions: z.array(z.string().max(1000)).max(8),
    dataRepair: z.string().max(2000),
    limitations: z.array(z.string().max(1000)).max(10),
    evidence: z
      .array(
        z
          .object({
            path: z.string(),
            start: z.number().int().positive(),
            end: z.number().int().positive(),
            explanation: z.string().max(1200),
          })
          .strict(),
      )
      .max(12),
  })
  .strict();
export type SupportDiagnosis = z.infer<typeof diagnosisSchema>;
export type SupportState =
  | "received"
  | "queued"
  | "investigating"
  | "needs_info"
  | "proposal_ready"
  | "failed"
  | "closed";
export type SupportMessage = {
  id: string;
  author: string;
  text: string;
  createdAt: string;
};
export type SupportTicket = {
  id: string;
  title: string;
  module: string;
  actual: string;
  expected: string;
  steps: string;
  reference: string;
  page: string;
  status: SupportState;
  version: string;
  environment: string;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  report: SupportDiagnosis | null;
  lastError: string | null;
  messages?: SupportMessage[];
};
export const supportLabels: Record<SupportState, string> = {
  received: "Recibido",
  queued: "En cola",
  investigating: "Investigando",
  needs_info: "Falta información",
  proposal_ready: "Propuesta lista",
  failed: "No se pudo completar",
  closed: "Cerrado",
};
