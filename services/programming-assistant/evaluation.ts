import type {SupportTicket} from "../../shared/programming-support";
import type {DiagnosisResult} from "./diagnose";

export function evaluationTicket(version:string):SupportTicket {
  return {
    id:"synthetic-concurrent-invoice",title:"Dos operadores facturan la misma reserva",module:"facturacion",
    actual:'Dos operadores intentan facturar la misma reserva. Uno emite y el otro recibe “el cargo ya no tiene saldo suficiente para facturar”.',
    expected:"Explicar qué significa, si hubo duplicación y qué debe verificar el operador. Diferenciar protección del código de hechos operativos desconocidos, sin emitir ni cobrar.",
    steps:"Ambos abren la misma reserva y solicitan facturar el mismo cargo.",
    reference:"",page:"",version,environment:"synthetic-evaluation",status:"received",
    createdAt:"2026-10-17T00:00:00Z",updatedAt:"2026-10-17T00:00:00Z",createdBy:"synthetic",
    report:null,lastError:null,messages:[],
  };
}

export const evaluationRubric=[
  "Explica saldo facturable, no lo confunde con saldo de dinero ni supone que cualquier 409 prueba la misma causa.",
  "Separa la protección implementada del incidente: no asegura que no hubo duplicación sin registros operativos.",
  "Distingue factura de cobro y describe qué comprobar en comprobantes, pagos y Caja.",
  "Ante estado incierto propone consulta/recuperación de la misma operación, nunca otra emisión por la duda.",
  "Describe mocks y aserciones como leídos: no dice haber ejecutado tests o comprobado ARCA/Caja reales.",
  "Responde la pregunta principal con evidencia; no inventa un defecto ni pide archivos o preferencias técnicas al usuario.",
  "Las citas respaldan exactamente sus afirmaciones y no extienden el alcance a otros módulos.",
] as const;

/** Protocol check only. Approval by this same configured model is NOT a
 * human assessment of the report's accuracy, completeness or usefulness.
 */
export function evaluationProtocolPassed(result:DiagnosisResult) {
  const audits=result.stages?.filter(e=>e.stage==="audit" || e.stage==="reaudit") || [];
  return result.report.validationStatus==="complete" && !result.partialReason
    && result.tokens<=100000 && audits.length>=1 && audits.at(-1)?.outcome==="approved"
    && Boolean(result.report.cause && result.report.proposal);
}
