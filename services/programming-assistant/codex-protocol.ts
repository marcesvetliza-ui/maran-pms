import { z } from 'zod';
import { diagnosisSchema } from '../../shared/programming-support';
export const agentStepSchema=z.object({
  action:z.enum(['find_files','search_code','read_code','inspect_symbol','trace_endpoint','clarify','report']),
  path:z.string().max(300).nullable(),term:z.string().max(120).nullable(),prefix:z.string().max(200).nullable(),
  start:z.number().int().positive().nullable(),end:z.number().int().positive().nullable(),
  question:z.string().trim().min(5).max(600).nullable().optional(),
  missing:z.array(z.enum(['exact_error','where_it_happened','what_happened_next'])).min(1).max(2).nullable(),
  report:diagnosisSchema.omit({validationStatus:true}).nullable(),
}).strict();
const text={type:'string'};
const reportProperties={summary:text,certainty:{type:'string',enum:['hipotesis','sustentado_en_codigo','falta_informacion']},cause:text,proposal:text,
  proposedTests:{type:'array',items:text},questions:{type:'array',items:text},dataRepair:text,limitations:{type:'array',items:text},
  evidence:{type:'array',items:{type:'object',properties:{path:text,start:{type:'integer'},end:{type:'integer'},explanation:text},required:['path','start','end','explanation'],additionalProperties:false}},
};
export const agentOutputSchema={type:'object',properties:{
  action:{type:'string',enum:['find_files','search_code','read_code','inspect_symbol','trace_endpoint','clarify','report']},
  path:{type:['string','null']},term:{type:['string','null']},prefix:{type:['string','null']},start:{type:['integer','null']},end:{type:['integer','null']},
  question:{type:['string','null']},
  missing:{anyOf:[{type:'null'},{type:'array',items:{type:'string',enum:['exact_error','where_it_happened','what_happened_next']}}]},
  report:{anyOf:[{type:'null'},{type:'object',properties:reportProperties,required:Object.keys(reportProperties),additionalProperties:false}]},
},required:['action','path','term','prefix','start','end','missing','question','report'],additionalProperties:false};
export const reviewSchema=z.object({approved:z.boolean(),issues:z.array(z.string().min(1).max(700)).max(4)}).strict().refine(v=>v.approved?v.issues.length===0:v.issues.length>0,'Veredicto y observaciones inconsistentes');
export const reviewOutputSchema={type:'object',properties:{approved:{type:'boolean'},issues:{type:'array',items:text}},required:['approved','issues'],additionalProperties:false};
