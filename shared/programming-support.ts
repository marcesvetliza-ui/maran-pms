import type { SupportChangeCandidate, SupportWorkflowEvent } from "./support-change-workflow";
import type { OperationalFact } from "./programming-support-clarification";
import type {SupportExecution} from './programming-support-execution';
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
export const supportFeedbackSchema = z.object({
  requestId:z.string().uuid(),
  reportId:z.string().min(1).max(80),
  outcome:z.enum(["resolved","unresolved"]),
}).strict();
export const supportRunSchema = z
  .object({ requestId: z.string().uuid() })
  .strict();
export const diagnosisSchema = z
  .object({
    summary: z.string().max(3000),
    // Server-owned metadata, never accepted from the diagnostic model.
    validationStatus: z.enum(["complete", "incomplete"]).optional(),
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
            assertionFragments:z.array(z.object({
              start:z.number().int().positive(),end:z.number().int().positive(),
              code:z.string().max(2500),partial:z.boolean(),
            }).strict()).max(3).optional(),
          })
          .strict(),
      )
      .max(12),
  })
  .strict();
export type SupportDiagnosis = z.infer<typeof diagnosisSchema>;
const reviewIssueSchema=z.object({
  statementId:z.string().regex(/^(summary|cause|proposal|certainty|limitations|proposedTests|questions|dataRepair|evidence)_[1-9]\d{0,2}_[1-9]\d{0,2}$/),
  problem:z.string().min(1).max(600),correction:z.string().min(1).max(600),
}).strict();
const rejectedReviewSchema=z.object({audit:z.number().int().min(1).max(2),draft:diagnosisSchema,issues:z.array(reviewIssueSchema).min(1).max(4)}).strict();
export type RejectedReview=z.infer<typeof rejectedReviewSchema>;
export function rejectedStatementText(draft:SupportDiagnosis,statementId:string):string|undefined {
  const match=statementId.match(/^(summary|cause|proposal|certainty|limitations|proposedTests|questions|dataRepair|evidence)_([1-9]\d{0,2})_([1-9]\d{0,2})$/);
  if(!match)return undefined;
  const value=match[1]==='evidence'?draft.evidence.map(ref=>ref.explanation):draft[match[1] as keyof SupportDiagnosis];
  const text=Array.isArray(value)?value[Number(match[2])-1]:Number(match[2])===1?value:undefined;
  return typeof text==='string'&&Number(match[3])<=Math.ceil(Array.from(text).length/800)?text:undefined;
}
/** Private evaluation material, separate from a published diagnosis and from
 * metadata logs. Never include raw provider responses, prompts or source code. */
export function safeRejectedReviews(value:unknown):RejectedReview[] {
  if(!Array.isArray(value))return [];
  return value.slice(0,2).flatMap(entry=>{
    const parsed=rejectedReviewSchema.safeParse(entry);
    if(!parsed.success||parsed.data.issues.some(issue=>rejectedStatementText(parsed.data.draft,issue.statementId)===undefined))return [];
    return [{...parsed.data,draft:{...parsed.data.draft,validationStatus:'incomplete' as const,evidence:parsed.data.draft.evidence.map(({assertionFragments:_,...ref})=>ref)}}];
  });
}
export type SupportState =
  | "received"
  | "queued"
  | "investigating"
  | "needs_info"
  | "validation_incomplete"
  | "proposal_ready"
  | "failed"
  | "closed";
/** Only an indispensable missing fact blocks a diagnosis; optional questions do not. */
export function diagnosisState(report: SupportDiagnosis): "needs_info" | "proposal_ready" | "validation_incomplete" {
  if (report.validationStatus === "incomplete") return "validation_incomplete";
  return report.certainty === "falta_informacion" ? "needs_info" : "proposal_ready";
}
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
  reportId?: string;
  changeCandidate?: SupportChangeCandidate;
  workflowEvents?: SupportWorkflowEvent[];
  feedback?: Array<{requestId:string;reportId:string;outcome:"resolved"|"unresolved";createdAt:string}>;
  lastError: string | null;
  execution?: SupportExecution;
  rejectedReviews?: RejectedReview[];
  clarification?: {facts:OperationalFact[];questions:string[];requestedAfterMessageCount?:number};
  messages?: SupportMessage[];
};
export const supportLabels: Record<SupportState, string> = {
  received: "Recibido",
  queued: "En cola",
  investigating: "Investigando",
  needs_info: "Falta información",
  validation_incomplete: "Validación inconclusa",
  proposal_ready: "Propuesta lista",
  failed: "No se pudo completar",
  closed: "Cerrado",
};
