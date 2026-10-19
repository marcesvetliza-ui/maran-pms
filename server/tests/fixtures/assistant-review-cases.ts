import archived from "./assistant-real-reports-7dd993b.json";
import type {SupportDiagnosis,SupportTicket} from "../../../shared/programming-support";

export type ReviewCase = {
  id:string;
  ticket:SupportTicket;
  report:SupportDiagnosis;
  expected:{approved:boolean;reason:string;field?:string;quote?:string};
};
const ticket=archived.case as SupportTicket;
const evidence:SupportDiagnosis["evidence"]=[
  {path:"server/billing/routes.ts",start:1641,end:1684,explanation:"La consulta incluye emitida, parcial y autorización pendiente ajena; el guard compara el importe solicitado con el remanente del cargo."},
  {path:"client/src/lib/prefactura-submission.ts",start:38,end:69,explanation:"run solicita la factura antes de recorrer los pagos guardados. discardRejectedInvoice evalúa el rechazo, la intención, la factura local y el claim."},
  {path:"client/src/components/PrefacturaDialog.tsx",start:1673,end:1698,explanation:"Prefactura muestra el error; un descarte confirmado genera nextOperationId y una verificación fallida conserva la operación anterior."},
];
const brief:SupportDiagnosis={
  summary:"Coincide con la validación esperada: ese mensaje rechaza un importe que supera la capacidad facturable disponible del cargo; no confirma una emisión terminada ni un cobro.",
  certainty:"sustentado_en_codigo",
  cause:"El servidor descuenta capacidad consumida o reservada por los estados fiscales considerados, incluida autorización pendiente ajena. Controla importes, no una cantidad fija de facturas.",
  proposal:"1. En la reserva, revisar los comprobantes y sus estados, incluidos los pendientes de autorización.\n2. Contrastar los pagos aplicados con Caja, por separado de la emisión.\n3. Si el estado sigue incierto, conservar el intento y revisar la operación existente antes de otra emisión o cobro.",
  proposedTests:[],questions:[],dataRepair:"",
  limitations:["Inspección estática: no se ejecutaron pruebas ni se consultaron registros operativos. Pendiente de revisión humana."],
  evidence,
};

/** Ground truth for review, not verdicts computed by a phrase matcher.
 * Real-model agreement with these labels has NOT been measured on this patch.
 */
export const reviewCases:ReviewCase[]=[
  ...archived.runs.map((run,index)=>({
    id:`real-run-${run.run}`,ticket,report:run.report as SupportDiagnosis,
    expected:[
      {approved:false,field:"cause",quote:"hay un intento de descarte condicionado del intento de facturación por medio de hasClaim",reason:"La explicación y el consejo de reintento omiten condiciones materiales del descarte y la distinción entre rechazo definitivo y estado incierto."},
      {approved:false,field:"questions",quote:"¿Se utiliza el mismo sistema de bloqueo para todos los tipos de reserva y facturación involucrados en el hotel?",reason:"Traslada investigación técnica al operador y amplía el alcance; la consulta principal puede responderse con el código."},
      {approved:false,field:"evidence",quote:"para permitir reintentos seguros manteniendo la identidad de la operación",reason:"Confunde el descarte confirmado que cambia identidad con la verificación incierta que conserva el intento; además generaliza unicidad y declara desconocida una pantalla ya identificada."},
    ][index],
  })),
  {
    id:"valid-brief-consultation",ticket,report:structuredClone(brief),
    expected:{approved:true,reason:"Consejo operativo breve, sin prometer descarte o recuperación automática; no necesita enumerar un algoritmo interno que no describe."},
  },
  {
    id:"valid-conditional-discard",ticket,report:{
      ...structuredClone(brief),
      cause:"El helper permite descartar sólo ante error 400/403/409, con invoiceRequest, sin invoice local, creditOperationId de tipo string y consulta remota hasClaim=false. En Prefactura, discarded=true genera una identidad nueva. Un timeout, respuesta incierta o consulta fallida conserva el intento; la consulta de estado no emite ni cobra.",
    },
    expected:{approved:true,reason:"Describe la conjunción completa y distingue los dos caminos de identidad; no exige conservarla en un descarte definitivo confirmado."},
  },
  {
    id:"valid-partial-capacity",ticket,report:{
      ...structuredClone(brief),
      summary:"Coincide con lo esperado para el importe solicitado: la validación controla el remanente del cargo, no impone una única factura por cargo.",
      cause:"Pueden existir documentos parciales válidos mientras quede capacidad. Una autorización pendiente ajena también puede reservarla; este mensaje no permite concluir que otra factura terminó de emitirse o cobrarse.",
    },
    expected:{approved:true,reason:"La negación de una garantía de unicidad y la explicación condicional no son afirmaciones de duplicación ni emisión completada."},
  },
  {
    id:"valid-scoped-test",ticket,report:{
      ...structuredClone(brief),
      cause:"El test leído del fixture concurrente contiene la aserción de un 201 y un 409 y una llamada al emisor simulado para ese escenario. No fue ejecutado aquí y no prueba unicidad universal de documentos ni resultados reales de Caja.",
      evidence:[...evidence,{path:"server/tests/folio-invoice-concurrency.test.ts",start:219,end:237,explanation:"El fixture solicita el total del mismo cargo y comprueba esos estados y una llamada; es una aserción leída, no ejecución ni garantía sobre otros importes."}],
    },
    expected:{approved:true,reason:"Una emisión en un fixture de importe total no es la misma afirmación que una única factura válida para siempre."},
  },
  {
    id:"valid-indispensable-operational-question",
    ticket:{...ticket,expected:"Determinar si hubo doble cobro real en esta reserva; no se aportaron comprobantes ni movimientos."},
    report:{
      ...structuredClone(brief),certainty:"falta_informacion",
      summary:"No alcanza la evidencia para determinar si hubo doble cobro real. La validación del código explica el rechazo fiscal, pero no reemplaza los movimientos de esa reserva.",
      questions:["¿Qué comprobantes y pagos figuran para esa reserva, con sus estados e importes anonimizados?"],
    },
    expected:{approved:true,reason:"La pregunta pide datos operativos indispensables para la nueva conclusión principal, no investigación técnica disponible en el repositorio."},
  },
];
