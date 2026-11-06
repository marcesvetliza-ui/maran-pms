import {z} from 'zod';

export const executionReasonLabels = {
  correction_reserve:'No alcanzó el presupuesto reservado para revisar, corregir y volver a revisar el diagnóstico.',
  correction_budget:'No alcanzó el presupuesto para completar la corrección y una nueva revisión.',
  draft_budget:'No alcanzó el presupuesto para completar la redacción.',
  correction_rounds:'Se alcanzó el límite de rondas antes de completar la revisión.',
  investigation_tokens:'Se alcanzó el límite de tokens de la investigación.',
  investigation_rounds:'Se alcanzó el límite de rondas de investigación.',
  diagnosis_length:'La respuesta alcanzó el límite de longitud.',
  audit_budget:'No alcanzó el presupuesto para la revisión independiente.',
} as const;
const count=z.number().finite().int().min(0).max(1e9);
const optionalCount=count.optional().catch(undefined);
export const executionStageSchema=z.object({
  stage:z.enum(['clarification','orientation','research','draft','validation','audit','correction','reaudit','finalize']),
  outcome:z.enum(['completed','approved','rejected','invalid','blocked','failed']),
  tokens:count,totalTokens:count,elapsedMs:count,
  estimatedTokens:optionalCount,reservedTokens:optionalCount,availableTokens:optionalCount,issueCount:optionalCount,
  reason:z.enum(['schema','provenance','claim','attribution','consistency','budget']).optional().catch(undefined),
});
const failureCodes=['api_auth','api_quota','api_rate_limit','api_model_access','api_request','api_unavailable','timeout','connection','diagnosis_coherence','diagnosis_audit','report_format','investigation_tokens','investigation_rounds','diagnosis_length','investigation_limit','evidence_validation','diagnosis_failed'] as const;
const executionSchema=z.object({
  revision:z.string().regex(/^[a-f0-9]{40}$/),finishedAt:z.string().datetime(),
  outcome:z.enum(['complete','incomplete','failed','clarification']),
  partialReason:z.enum(Object.keys(executionReasonLabels) as [keyof typeof executionReasonLabels,...(keyof typeof executionReasonLabels)[]]).optional().catch(undefined),
  failureCode:z.enum(failureCodes).optional().catch(undefined),
  tokens:optionalCount,calls:optionalCount,semanticAudits:optionalCount,
  stages:z.array(executionStageSchema).max(100),
});
export type SupportExecution=z.infer<typeof executionSchema>;
/** Allowlisted metadata only. Never persist provider messages, prompts or source. */
export function safeSupportExecution(value:unknown):SupportExecution|undefined {
  if(!value || typeof value!=='object')return undefined;
  const input=value as Record<string,unknown>;
  const stages=Array.isArray(input.stages)?input.stages.slice(0,100).flatMap(stage=>{
    const parsed=executionStageSchema.safeParse(stage);return parsed.success?[parsed.data]:[];
  }):[];
  const parsed=executionSchema.safeParse({...input,stages});
  return parsed.success?parsed.data:undefined;
}

export const executionStageLabels:Record<SupportExecution['stages'][number]['stage'],string>={
  clarification:'Aclaración',orientation:'Orientación',research:'Investigación',draft:'Redacción',validation:'Validación de evidencia',audit:'Revisión independiente',correction:'Corrección',reaudit:'Nueva revisión',finalize:'Finalización',
};
export const executionOutcomeLabels:Record<SupportExecution['stages'][number]['outcome'],string>={
  completed:'Completada',approved:'Aprobada',rejected:'Rechazada',invalid:'Inválida',blocked:'Detenida por un límite',failed:'Fallida',
};
