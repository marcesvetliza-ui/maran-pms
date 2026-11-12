import { z } from 'zod';
import { diagnosisSchema } from '../../shared/programming-support';
export const agentStepSchema=z.object({
  action:z.enum(['locate_screen','find_files','search_code','read_code','inspect_symbol','trace_endpoint','clarify','report']),
  path:z.string().max(300).nullable(),term:z.string().max(120).nullable(),prefix:z.string().max(200).nullable(),
  start:z.number().int().positive().nullable(),end:z.number().int().positive().nullable(),
  question:z.string().trim().min(5).max(600).nullable().optional(),
  missing:z.array(z.enum(['exact_error','where_it_happened','what_happened_next'])).min(1).max(2).nullable(),
  report:diagnosisSchema.omit({validationStatus:true}).nullable(),
}).strict();
const text={type:'string'};
const reportProperties={summary:text,recommendedAction:{type:'string',enum:['code_change','verification','no_change']},certainty:{type:'string',enum:['hipotesis','sustentado_en_codigo','falta_informacion']},cause:text,proposal:text,
  proposedTests:{type:'array',items:text},questions:{type:'array',items:text},dataRepair:text,limitations:{type:'array',items:text},
  evidence:{type:'array',items:{type:'object',properties:{path:text,start:{type:'integer'},end:{type:'integer'},explanation:text},required:['path','start','end','explanation'],additionalProperties:false}},
};
export const agentOutputSchema={type:'object',properties:{
  action:{type:'string',enum:['locate_screen','find_files','search_code','read_code','inspect_symbol','trace_endpoint','clarify','report']},
  path:{type:['string','null']},term:{type:['string','null']},prefix:{type:['string','null']},start:{type:['integer','null']},end:{type:['integer','null']},
  question:{type:['string','null']},
  missing:{anyOf:[{type:'null'},{type:'array',items:{type:'string',enum:['exact_error','where_it_happened','what_happened_next']}}]},
  report:{anyOf:[{type:'null'},{type:'object',properties:reportProperties,required:Object.keys(reportProperties),additionalProperties:false}]},
},required:['action','path','term','prefix','start','end','missing','question','report'],additionalProperties:false};
export const closingOutputSchema={...agentOutputSchema,properties:{...agentOutputSchema.properties,action:{type:'string',enum:['clarify','report']}}};
export const reviewSchema=z.object({approved:z.boolean(),issues:z.array(z.string().min(1).max(700)).max(4)}).strict().refine(v=>v.approved?v.issues.length===0:v.issues.length>0,'Veredicto y observaciones inconsistentes');
export const reviewOutputSchema={type:'object',properties:{approved:{type:'boolean'},issues:{type:'array',items:text}},required:['approved','issues'],additionalProperties:false};

const checkProperties={topic:{type:'string',enum:['cause','repair','tests']},field:{type:'string',enum:['summary','cause','proposal','proposedTests','recommendedAction']},supported:{type:'boolean'},reason:{type:'string',minLength:1,maxLength:300},counterexample:{type:'string',minLength:1,maxLength:300},evidenceIndex:{type:['integer','null'],minimum:0},codeQuote:{type:'string',maxLength:240}};
export const feedbackReviewOutputSchema={...reviewOutputSchema,properties:{...reviewOutputSchema.properties,checks:{type:'array',minItems:3,maxItems:3,items:{type:'object',properties:checkProperties,required:Object.keys(checkProperties),additionalProperties:false}}},required:[...reviewOutputSchema.required,'checks']};
export const feedbackReviewSchema=z.object({
  approved:z.boolean(),issues:z.array(z.string().min(1).max(700)).max(4),
  checks:z.array(z.object({topic:z.enum(['cause','repair','tests']),field:z.enum(['summary','cause','proposal','proposedTests','recommendedAction']),supported:z.boolean(),reason:z.string().min(1).max(300),counterexample:z.string().min(1).max(300),evidenceIndex:z.number().int().nonnegative().nullable(),codeQuote:z.string().max(240)}).strict()).length(3),
}).strict().refine(v=>v.approved?v.issues.length===0:v.issues.length>0,'Veredicto y observaciones inconsistentes');

/** Verify ownership and literal reads; semantic correctness still needs the reviewer. */
export function validFeedbackReview(review:z.infer<typeof feedbackReviewSchema>,evidence:readonly {content:string}[]){
  if(new Set(review.checks.map(check=>check.topic)).size!==3)return false;
  const allowed={cause:['summary','cause'],repair:['proposal','cause','recommendedAction'],tests:['proposedTests','proposal','cause']};
  return review.checks.every(check=>allowed[check.topic].includes(check.field)
    && (!review.approved||check.supported)
    && (check.evidenceIndex===null ? !check.supported&&check.codeQuote==='' : !!check.codeQuote.trim()&&!!evidence[check.evidenceIndex]?.content.includes(check.codeQuote)));
}
