import { z } from 'zod';
export const supportDecisionSchema = z.object({
  requestId: z.string().uuid(),
  candidateId: z.string().uuid(),
  digest: z.string().regex(/^[a-f0-9]{64}$/),
  reportId: z.string().uuid(),
  decision: z.enum(['approve','reject','revise']),
  comment: z.string().trim().max(2000).default(''),
}).strict();
export type SupportDecision = z.infer<typeof supportDecisionSchema>;
export type SupportChangeCandidate = {
  id: string; kind: 'simulation'; target: 'xenia-pilot';
  baseRevision: string; reportId: string; digest: string; diff: string;
  tests: { name: string; result: 'simulated' }[];
  status: 'awaiting_review'|'approved_simulation'|'rejected'|'changes_requested'|'invalidated';
  createdAt: string;
};
export type SupportWorkflowEvent = {
  id: string; kind: 'prepared'|'approve'|'reject'|'revise'|'invalidated';
  candidateId: string; digest: string; actor: string; at: string; comment: string;
  reportId: string;
  requestId?: string;
};
