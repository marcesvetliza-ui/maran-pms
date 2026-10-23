import { z } from "zod";
export const operationalFactSchema = z.enum(["exact_error", "where_it_happened", "what_happened_next"]);
export type OperationalFact = z.infer<typeof operationalFactSchema>;
export const clarificationSchema = z.object({missing:z.array(operationalFactSchema).min(1).max(2)}).strict();
const questions: Record<OperationalFact,string> = {
 exact_error:"¿Qué mensaje exacto aparece? Copiá el texto y el código si lo tiene, sin claves ni datos personales.",
 where_it_happened:"¿En qué pantalla estabas y qué acción realizaste justo antes del problema?",
 what_happened_next:"¿Qué quedó registrado después del intento: apareció un comprobante, un movimiento o un estado pendiente? Contá lo que ves, sin repetir la operación.",
};
export function operationalQuestions(value: unknown, previouslyAsked: readonly OperationalFact[] = []) {
 const parsed=clarificationSchema.parse(value);
 const facts=[...new Set(parsed.missing)].filter(f=>!previouslyAsked.includes(f));
 if(!facts.length)throw Error("El dato ya fue solicitado; revisá la respuesta del usuario antes de volver a preguntar.");
 return {facts,questions:facts.map(f=>questions[f])};
}
