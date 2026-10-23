import type {CodeSource} from "./source";
import {citedScreens} from "../../shared/programming-support-scope";

/** A reasoning procedure, not a blacklist or a precomputed verdict. */
export const operationalResponseInstruction = `Respuesta operativa: un párrafo de conclusión, otro de causa y hasta tres pasos seguros. Contrastá condiciones con decisionBrief y sus lecturas; acotá lo no demostrado. Separá código de resultados del incidente. Consultar estados no requiere describir descarte interno.
Preguntá sólo datos operativos indispensables no disponibles en case, interfaceScope o código; si alcanza la evidencia, questions=[]. Comprobaciones futuras en proposedTests: reconocer aserciones ya leídas, no ejecutadas, y proponer sólo verificaciones adicionales útiles.`;

const decisions = [
  {
    id: "capacity",
    question: "¿Importe disponible o cantidad de documentos? ¿Qué estados restan capacidad?",
    path: "server/billing/routes.ts",
    anchor: "El cargo seleccionado ya no tiene saldo suficiente",
    windows: [{before:40,after:-18},{before:8,after:4}],
  },
  {
    id: "discard",
    question: "¿Qué condiciones permiten descartar? ¿Qué conserva ante incertidumbre?",
    path: "client/src/lib/prefactura-submission.ts",
    anchor: "async discardRejectedInvoice(",
    windows: [{before:0,after:9}],
  },
  {
    id: "identity",
    question: "¿Qué rama cambia/conserva identidad? ¿Qué muestra la pantalla?",
    path: "client/src/components/PrefacturaDialog.tsx",
    anchor: "const discarded = await submission.current!.discardRejectedInvoice",
    windows: [{before:2,after:21}],
  },
  {
    id: "collection",
    question: "¿Orden emisión/pagos? ¿Qué falta comprobar del incidente?",
    path: "client/src/lib/prefactura-submission.ts",
    anchor: "async run(",
    windows: [{before:0,after:21}],
  },
] as const;

/** Locate real source on this revision independently of the author's citations.
 * Reuse cited lines when possible; never present missing/truncated code as proof.
 * This packet is only enabled for the existing reservation-conflict navigation.
 */
export async function buildDecisionBrief(
  source:CodeSource,
  coverage:readonly string[],
  existing:ReadonlyArray<{path:string;start:number;end:number;content:string}> = [],
) {
  if (!coverage.length) return undefined;
  const files = await source.files();
  const readings:Array<{path:string;start:number;end:number;content:string;incomplete:boolean}> = [];
  let remaining=8000;
  const checks = [];
  for (const decision of decisions) {
    const {path,anchor,windows,...check} = decision;
    const match = files.includes(path)
      ? (await source.search(anchor,path)).matches.find(item=>item.path===path)
      : undefined;
    if (!match) {
      checks.push({...check,evidence:null,missing:true});
      continue;
    }
    const evidence = [];
    for (const {before,after} of windows) {
      const start = Math.max(1,match.line-before), end = match.line+after;
      const included = existing.find(read=>read.path===path && read.start<=start && read.end>=end);
      if (!included) {
        const read = await source.read(path,start,end);
        const selected:string[]=[];
        for(const line of read.content.split("\n")){
          if(line.length+1>remaining)break;
          selected.push(line);remaining-=line.length+1;
        }
        const last=selected.length ? Number(selected.at(-1)!.match(/^(\d+):/)?.[1] || start) : start;
        readings.push({...read,end:last,content:selected.join("\n"),incomplete:!selected.length || last<end});
      }
      evidence.push({path,start,end});
    }
    checks.push({...check,evidence,missing:false});
  }
  return {
    checks, readings,
    interfaceScope:citedScreens({evidence:[...source.readRanges].map(([path,ranges])=>({path,start:ranges[0][0],end:ranges[0][1],explanation:""}))}),
  };
}
