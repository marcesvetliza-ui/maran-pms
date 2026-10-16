import { z } from "zod";
export const spaPrefacturaSettingsSchema=z.object({
 recipientKind:z.enum(["client","guest","company"]),recipientId:z.string().min(1).optional(),
 discount:z.object({type:z.enum(["percent","fixed"]),value:z.number().positive().max(99999999),reason:z.string().trim().min(1).max(500)}).strict().nullable(),
 notes:z.string().trim().max(1000).default(""),
}).strict().superRefine((v,ctx)=>{if(v.recipientKind!=="client"&&!v.recipientId)ctx.addIssue({code:"custom",message:"Seleccioná el destinatario."});});
export type SpaPrefacturaSettings=z.infer<typeof spaPrefacturaSettingsSchema>;
export const spaPrefacturaInputSchema=z.object({requestId:z.string().uuid(),expectedVersion:z.string().regex(/^[a-f0-9]{64}$/),settings:spaPrefacturaSettingsSchema}).strict();
