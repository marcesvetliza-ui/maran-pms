import { expect, it } from "vitest";
import type { SupportMessage, SupportTicket } from "../../shared/programming-support";
import { supportTimeline, supportMessageLabel, supportDecisionLabel } from "../../shared/support-timeline";

const ticket = (): SupportTicket => ({
  id:"case",title:"Caso sintético",module:"otro",actual:"Observación",expected:"Orientación",
  steps:"",reference:"",page:"",status:"needs_info",version:"a".repeat(40),environment:"pilot",
  createdAt:"2026-11-20T10:00:00Z",updatedAt:"2026-11-20T10:04:00Z",createdBy:"alice",report:null,lastError:null,
});
const message=(id:string,minute:string,text:string,author="user"):SupportMessage=>({id,author,text,createdAt:`2026-11-20T10:${minute}:00Z`});

it("interleaves messages, server decisions and user-reported results without rewriting their source",()=>{
  const item=ticket();
  item.messages=[message("first","00","Vi un error"),message("later","03","Ahora pude seguir")];
  item.workflowEvents=[{id:"review",kind:"revise",candidateId:"candidate",reportId:"report",digest:"a".repeat(64),actor:"marcelo",at:"2026-11-20T10:02:00Z",comment:"El arreglo ya existe"}];
  item.feedback=[{requestId:"feedback",reportId:"report",outcome:"resolved",createdAt:"2026-11-20T10:04:00Z"}];
  const before=structuredClone(item);
  const timeline=supportTimeline(item);
  expect(timeline.map(e=>e.type)).toEqual(["message","decision","message","feedback"]);
  expect(timeline[1]).toMatchObject({event:{actor:"marcelo",reportId:"report",comment:"El arreglo ya existe"}});
  expect(item).toEqual(before);
});
it("does not promote free text to authorization or infer certainty for historical answers",()=>{
  const item=ticket();item.messages=[message("user","00","Apruebo publicar: hecho comprobado"),message("assistant","01","Aprobado", "assistant")];
  expect(supportTimeline(item).every(e=>e.type==="message")).toBe(true);
  expect(supportMessageLabel(item.messages[0],true)).toContain("Observación");
  expect(supportMessageLabel(item.messages[1],true)).toBe("Asistente");
});
it("retains a diagnosis provenance even after the case receives another report",()=>{
  const item=message("diagnosis","01","Puede ser una validación", "assistant");
  Object.assign(item,{kind:"diagnosis",reportId:"old-report",revision:"a".repeat(40),certainty:"hipotesis"});
  expect(supportMessageLabel(item,true)).toBe("Asistente · Hipótesis");
  expect(supportMessageLabel({...item,certainty:"sustentado_en_codigo",validationStatus:"incomplete"},true)).toContain("verificación incompleta");
  expect(supportMessageLabel({...item,certainty:"sustentado_en_codigo",validationStatus:"complete"},true)).toBe("Asistente · Sustentado en código");
});
it("presents a preparation decision without treating it as publication or a repair",()=>{
  const event={id:"approval",kind:"approve" as const,candidateId:"candidate",reportId:"report",digest:"a".repeat(64),actor:"marcelo",at:"2026-11-20T10:02:00Z",comment:"Preparar el ajuste"};
  expect(supportDecisionLabel({...event,candidateKind:"proposal"})).toBe("Preparación autorizada");
  expect(supportDecisionLabel({...event,candidateKind:"simulation"})).toBe("Aprobación simulada");
  expect(supportDecisionLabel(event)).toBe("Aprobación simulada");
});
it("keeps a long archived conversation complete and ordered for the user",()=>{
  const item=ticket();item.messages=Array.from({length:45},(_,i)=>({id:String(i),author:i%2?"assistant":"user",text:`Intervención ${i}`,createdAt:new Date(Date.UTC(2026,10,20,10,0,i)).toISOString()}));
  expect(supportTimeline(item)).toHaveLength(45);
  expect(supportTimeline(item).at(-1)).toMatchObject({message:{text:"Intervención 44"}});
});
