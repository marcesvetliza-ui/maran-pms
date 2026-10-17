// These protocol tests isolate the earlier stages. Semantic review has its own
// tests with explicit reject/approve responses and independent request checks.
vi.mock('../../services/programming-assistant/semantic-audit',()=>({auditDiagnosis:vi.fn(async()=>({approved:true,issues:[],tokens:0}))}));
import { mkdtemp, mkdir, writeFile, symlink, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, it, expect } from "vitest";
import { CodeSource } from "../../services/programming-assistant/source";
import { diagnose } from "../../services/programming-assistant/diagnose";
import type { SupportTicket } from "../../shared/programming-support";

let directory: string;
afterEach(async () => {
  if (directory) await rm(directory, { recursive: true, force: true });
});
async function fixture() {
  directory = await mkdtemp(path.join(tmpdir(), "assistant-source-"));
  await mkdir(path.join(directory, "server"));
  return new CodeSource(directory, "a".repeat(40));
}
describe("read-only code investigator", () => {
  it("traces the real preview route, its conversion dependencies and existing regression tests", async () => {
    const source=new CodeSource(process.cwd(),"a".repeat(40));
    const result=await source.traceEndpoint("/api/inventory/recipe-stock-preview");
    expect(result.handlers[0].path).toBe("server/inventoryStage2Routes.ts");
    expect(result.handlers[0].content).toContain("res.json");
    expect(result.callers[0].path).toBe("client/src/pages/inventory.tsx");
    expect(result.callers[0].content).toContain("recipe-stock-preview");
    expect(result.callers[0].content).toContain("Error al cargar receta");
    expect(result.dependencies.map(d=>d.symbol)).toEqual(expect.arrayContaining(["unitFactor","planIngredientsWithActualQuantities","convertInventoryQuantity"]));
    expect(result.dependencies.every(d=>d.definitions.length>0)).toBe(true);
    expect(result.dependencies.find(d=>d.symbol==="inventoryUnitFactor")?.definitions[0].content).toContain("equivalencia");
    expect(result.dependencies.find(d=>d.symbol==="unitFactor")?.definitions[0].content).not.toContain("async function consumeStockLines");
    expect(result.tests[0].content).toContain("sin mover stock");
    expect(result.tests[0].content).toContain("falta equivalencia");
    expect([...result.callers,...result.handlers,...result.tests,...result.dependencies.flatMap(d=>d.definitions)].every(r=>source.validates(r))).toBe(true);
    await expect(source.traceEndpoint("https://example.com")).rejects.toThrow();
  });
  it("distinguishes PATCH from GET and follows a templated caller across a long handler", async () => {
    const source=await fixture();
    await mkdir(path.join(directory,"client/src"),{recursive:true});
    await writeFile(path.join(directory,"client/src","move.ts"),'apiRequest("PATCH", `/api/example/${reservation.id}`, {roomId});');
    await writeFile(path.join(directory,"server","route.ts"),[
      'app.get("/api/example/:id", (_req,res)=>res.json({readOnly:true}));',
      'app.patch("/api/example/:id", async (req,res)=>{',
      ...Array.from({length:170},()=>"// other validation"),
      'if (overlap) return res.status(409).json({error:"ocupada"});',
      'return storage.updateReservation(req.params.id,req.body);',
      '});',
      'app.post("/api/other", (_req,res)=>res.json({other:true}));',
    ].join("\n"));
    const result=await source.traceEndpoint("/api/example/:id",{method:"PATCH",includeTests:false});
    expect(result.method).toBe("PATCH");
    expect(result.handlers.map(read=>read.content).join("\n")).not.toContain("readOnly:true");
    expect(result.handlers.map(read=>read.content).join("\n")).toContain("storage.updateReservation");
    expect(result.callers[0].content).toContain("${reservation.id}");
    expect([...result.callers,...result.handlers].every(read=>source.validates(read))).toBe(true);
    await expect(source.traceEndpoint("/api/example/:id",{method:"TRACE"})).rejects.toThrow();
  });
  it("reads methods in classes without treating the next method as its body", async () => {
    const source=await fixture();
    await writeFile(path.join(directory,"server","storage.ts"),[
      'class Storage {',
      '  async checkOverbooking(){',
      '    return reservations.some(r=>r.checkIn < end && r.checkOut > start);',
      '  }',
      '  async unrelated(){ return "not relevant"; }',
      '}',
    ].join("\n"));
    const result=await source.inspectSymbol("checkOverbooking");
    expect(result.definitions).toHaveLength(1);
    expect(result.definitions[0].content).toContain("r.checkOut > start");
    expect(result.definitions[0].content).not.toContain("not relevant");
  });
  it("delivers server evidence automatically after reading a frontend API call", async () => {
    const source=await fixture();
    await mkdir(path.join(directory,"client/src"),{recursive:true});
    await writeFile(path.join(directory,"client/src","preview.ts"),"fetch('/api/preview');");
    await writeFile(path.join(directory,"server","endpoint.ts"),"app.post('/api/preview', (_req,res)=>res.json({quantity:1.5}));");
    const report={summary:"Vista previa",certainty:"sustentado_en_codigo",cause:"",proposal:"",proposedTests:[],questions:[],dataRepair:"",limitations:[],evidence:[{path:"server/endpoint.ts",start:1,end:1,explanation:"Respuesta"}]};
    let round=0;
    const client={chat:{completions:{create:async(request:any)=>{
      if(round++===0)return {choices:[{message:{role:"assistant",content:null,tool_calls:[{id:"frontend",type:"function",function:{name:"read_code",arguments:'{"path":"client/src/preview.ts","start":1,"end":1}'}}]}}]};
      if(round===2)expect(JSON.parse(request.messages.at(-1).content).endpointContext[0].handlers[0].content).toContain("quantity:1.5");
      return {choices:[{message:{role:"assistant",content:JSON.stringify(report)}}]};
    }}}};
    const result=await diagnose({version:source.version} as SupportTicket,source,{apiKey:"unused",model:"mock"},client as any);
    expect(result.report.certainty).toBe("sustentado_en_codigo");expect(result.readFiles).toContain("server/endpoint.ts");
  });
  it("delivers callers when the investigation starts at the backend", async () => {
    const source=await fixture();
    await mkdir(path.join(directory,"client/src"),{recursive:true});
    await writeFile(path.join(directory,"client/src","consumer.ts"),"async function showPreview(){return fetch('/api/example-preview');}");
    await writeFile(path.join(directory,"server","route.ts"),"app.post('/api/example-preview', (_req,res)=>res.json({quantity:1.5}));");
    const report={summary:"Vista previa",certainty:"sustentado_en_codigo",cause:"",proposal:"",proposedTests:[],questions:[],dataRepair:"",limitations:[],evidence:[{path:"client/src/consumer.ts",start:1,end:1,explanation:"Llamada real"}]};
    let round=0;
    const client={chat:{completions:{create:async(request:any)=>{
      if(round++===0)return {choices:[{message:{role:"assistant",content:null,tool_calls:[{id:"backend",type:"function",function:{name:"read_code",arguments:'{"path":"server/route.ts","start":1,"end":1}'}}]}}]};
      if(round===2)expect(JSON.parse(request.messages.at(-1).content).endpointContext[0].callers[0].content).toContain("showPreview");
      return {choices:[{message:{role:"assistant",content:JSON.stringify(report)}}]};
    }}}};
    const result=await diagnose({version:source.version} as SupportTicket,source,{apiKey:"unused",model:"mock"},client as any);
    expect(result.readFiles).toContain("client/src/consumer.ts");
  });
  it("exposes a read-only explicit endpoint tracing tool", async () => {
    const source=await fixture();
    await writeFile(path.join(directory,"server","route.ts"),"app.post('/api/example', (_req,res)=>res.json({ok:true}));");
    const report={summary:"Inspección",certainty:"sustentado_en_codigo",cause:"",proposal:"",proposedTests:[],questions:[],dataRepair:"",limitations:[],evidence:[{path:"server/route.ts",start:1,end:1,explanation:"Handler"}]};
    let round=0;
    const client={chat:{completions:{create:async(request:any)=>{
      if(round++===0){
        expect(request.tools.some((tool:any)=>tool.function.name==="trace_endpoint")).toBe(true);
        return {choices:[{message:{role:"assistant",content:null,tool_calls:[{id:"trace",type:"function",function:{name:"trace_endpoint",arguments:'{"endpoint":"/api/example"}'}}]}}]};
      }
      if(round===2)expect(JSON.parse(request.messages.at(-1).content).handlers[0].content).toContain("ok:true");
      return {choices:[{message:{role:"assistant",content:JSON.stringify(report)}}]};
    }}}};
    await diagnose({version:source.version} as SupportTicket,source,{apiKey:"unused",model:"mock"},client as any);
  });
  it("does not repeat an endpoint graph already supplied in orientation", async () => {
    const source=new CodeSource(process.cwd(),"a".repeat(40));
    const ticket={version:source.version,module:"inventario",title:"Error al cargar receta",actual:"Consumo interno: la pantalla muestra error",expected:"Seguir el mensaje de equivalencia",steps:"",messages:[]} as SupportTicket;
    const report={summary:"Error genérico en pantalla",certainty:"sustentado_en_codigo",cause:"El catch no muestra el detalle",proposal:"Mostrar error",proposedTests:[],questions:[],dataRepair:"",limitations:[],evidence:[]};
    let round=0, reference:any;
    const client={chat:{completions:{create:async(request:any)=>{
      if(round++===0){
        const context=JSON.parse(request.messages[1].content).orientation.endpointContext[0];
        reference=context.callers[0]; report.evidence=[{path:reference.path,start:reference.start,end:reference.end,explanation:"Catch del cliente"}] as any;
        return {choices:[{message:{role:"assistant",content:null,tool_calls:[{id:"frontend-again",type:"function",function:{name:"read_code",arguments:JSON.stringify({path:reference.path,start:reference.start,end:reference.end})}}]}}]};
      }
      if(round===2)expect(JSON.parse(request.messages.at(-1).content).endpointContext).toBeUndefined();
      return {choices:[{message:{role:"assistant",content:JSON.stringify(report)}}]};
    }}}};
    expect((await diagnose(ticket,source,{apiKey:"unused",model:"mock"},client as any)).report.certainty).toBe("sustentado_en_codigo");
  });
  it("attaches safe budget counters to a token-limit failure", async () => {
    const source=await fixture();
    const client={chat:{completions:{create:async()=>({usage:{total_tokens:100001},choices:[]})}}};
    await expect(diagnose({version:source.version} as SupportTicket,source,{apiKey:"unused",model:"mock"},client as any))
      .rejects.toMatchObject({code:"investigation_tokens",investigation:{rounds:1,calls:0,tokens:100001,phase:"research"}});
  });
  it("reserves a closing phase instead of aborting when a batch exceeds research calls", async () => {
    const source=await fixture();
    await writeFile(path.join(directory,"server","budget.ts"),Array.from({length:30},(_,i)=>`const n${i}=${i};`).join("\n"));
    const report={summary:"Verificación parcial",certainty:"falta_informacion",cause:"",proposal:"Continuar revisión",proposedTests:[],questions:[],dataRepair:"",limitations:["Falta inspeccionar un requisito central"],evidence:[]};
    let round=0;
    const client={chat:{completions:{create:async(request:any)=>{
      if(round++===0)return {choices:[{message:{role:"assistant",content:null,tool_calls:Array.from({length:28},(_,i)=>({id:`budget-${i}`,type:"function",function:{name:"read_code",arguments:JSON.stringify({path:"server/budget.ts",start:i+1,end:i+1})}}))}}]};
      expect(request.tool_choice).toBe("none");
      const toolMessages=request.messages.filter((m:any)=>m.role==="tool");
      expect(toolMessages).toHaveLength(28);
      expect(toolMessages.filter((m:any)=>JSON.parse(m.content).researchClosed)).toHaveLength(8);
      return {choices:[{message:{role:"assistant",content:JSON.stringify(report)}}]};
    }}}};
    const result=await diagnose({version:source.version} as SupportTicket,source,{apiKey:"unused",model:"mock"},client as any);
    expect(result.calls).toBe(20);expect(round).toBe(3);expect(result.report.certainty).toBe("falta_informacion");
  });
  it("closes early on accumulated tokens and still reviews a valid partial report", async () => {
    const source=await fixture();
    const report={summary:"Parcial",certainty:"falta_informacion",cause:"",proposal:"",proposedTests:[],questions:[],dataRepair:"",limitations:[],evidence:[]};
    let round=0;
    const client={chat:{completions:{create:async(request:any)=>{
      const current=round++;
      if(current===0)return {usage:{total_tokens:50000},choices:[{message:{role:"assistant",content:null,tool_calls:[{id:"missing",type:"function",function:{name:"find_files",arguments:'{"term":"missing"}'}}]}}]};
      expect(request.tool_choice).toBe("none");
      return {usage:{total_tokens:1000},choices:[{message:{role:"assistant",content:JSON.stringify(report)}}]};
    }}}};
    const result=await diagnose({version:source.version} as SupportTicket,source,{apiKey:"unused",model:"mock"},client as any);
    expect(round).toBe(3);expect(result.tokens).toBe(52000);
  });
  it("reserves the draft and coverage review based on measured prompt cost before 50k", async () => {
    const source=await fixture();
    const report={summary:"Parcial",certainty:"falta_informacion",cause:"",proposal:"",proposedTests:[],questions:[],dataRepair:"",limitations:[],evidence:[]};
    let round=0;
    const client={chat:{completions:{create:async(request:any)=>{
      const current=round++;
      if(current===0)return {usage:{total_tokens:36000,prompt_tokens:35000},choices:[{message:{role:"assistant",content:null,tool_calls:[{id:"missing",type:"function",function:{name:"find_files",arguments:'{"term":"missing"}'}}]}}]};
      expect(request.tool_choice).toBe("none");
      if(current===2)expect(JSON.stringify(request.messages)).toContain('Antes de entregar el diagnóstico');
      return {usage:{total_tokens:8000,prompt_tokens:7000},choices:[{message:{role:"assistant",content:JSON.stringify(report)}}]};
    }}}};
    const result=await diagnose({version:source.version} as SupportTicket,source,{apiKey:"unused",model:"mock"},client as any);
    expect(round).toBe(3);expect(result.tokens).toBe(52000);expect(result.calls).toBe(1);
  });
  it("finds definitions and tests across filenames without exposing excluded files", async () => {
    const source=await fixture();
    await mkdir(path.join(directory,"server/tests"));
    await writeFile(path.join(directory,"server","generic.ts"),"export async function unitFactor(){return 0.001;}");
    await writeFile(path.join(directory,"server/tests","unrelated.test.ts"),"expect(unitFactor()).toBe(0.001);");
    await writeFile(path.join(directory,"server/tests","programming-assistant-trace.test.ts"),"source.inspectSymbol('unitFactor');");
    await writeFile(path.join(directory,"server","secrets.ts"),"export function unitFactor(){return 'private';}");
    const result=await source.inspectSymbol("unitFactor");
    expect(result.definitions.map(r=>r.path)).toEqual(["server/generic.ts"]);
    expect(result.tests.map(r=>r.path)).toEqual(["server/tests/unrelated.test.ts"]);
    expect(source.validates(result.definitions[0])).toBe(true);
    expect((await source.inspectSymbol("absentSymbol")).definitions).toEqual([]);
    await expect(source.inspectSymbol("../../secrets")).rejects.toThrow();
  });
  it("finds the real conversion functions missing from the preview diagnosis", async () => {
    const source=new CodeSource(process.cwd(),"a".repeat(40));
    for(const symbol of ["unitFactor","planIngredientsWithActualQuantities","convertInventoryQuantity"]){
      const result=await source.inspectSymbol(symbol);
      expect(result.definitions.length,symbol).toBeGreaterThan(0);
      expect(result.definitions.every(r=>source.validates(r))).toBe(true);
    }
  });
  it("reviews a draft and reads a called symbol before the final conclusion", async () => {
    const source=await fixture();
    await writeFile(path.join(directory,"server","generic.ts"),"export function factor(){return 0.001;}");
    const draft={summary:"Falta función",certainty:"falta_informacion",cause:"",proposal:"",proposedTests:[],questions:[],dataRepair:"",limitations:[],evidence:[]};
    let round=0;
    const client={chat:{completions:{create:async(request:any)=>{
      const current=round++;
      if(current===0)return {choices:[{message:{role:"assistant",content:JSON.stringify(draft)}}]};
      if(current===1){expect(JSON.parse(request.messages.at(-1).content).review).toContain("inspect_symbol");return {choices:[{message:{role:"assistant",content:null,tool_calls:[{id:"symbol1",type:"function",function:{name:"inspect_symbol",arguments:'{"symbol":"factor"}'}}]}}]};}
      expect(JSON.parse(request.messages.at(-1).content).definitions[0].content).toContain("0.001");
      return {choices:[{message:{role:"assistant",content:JSON.stringify({...draft,summary:"Factor leído",certainty:"sustentado_en_codigo",evidence:[{path:"server/generic.ts",start:1,end:1,explanation:"Conversión"}]})}}]};
    }}}};
    const result=await diagnose({version:source.version} as SupportTicket,source,{apiKey:"unused",model:"mock"},client as any);
    expect(round).toBe(3);expect(result.calls).toBe(1);expect(result.report.certainty).toBe("sustentado_en_codigo");
  });
  it("can read missing evidence during a late correction without bypassing validation", async () => {
    const source=await fixture();
    await writeFile(path.join(directory,"server","late.ts"),"const first=1;\nconst second=2;");
    const report={summary:"Resumen",certainty:"sustentado_en_codigo",cause:"Causa",proposal:"Propuesta",proposedTests:[],questions:[],dataRepair:"",limitations:[],evidence:[{path:"server/late.ts",start:1,end:2,explanation:"Dos valores"}]};
    let round=0;
    const client={chat:{completions:{create:async(request:any)=>{
      const current=round++;
      if (current===9) expect(request.tool_choice).toBe("none");
      if (current===10) expect(request.tool_choice).toBe("auto");
      if (current===9 || current>=11) return {choices:[{message:{role:"assistant",content:JSON.stringify(report)}}]};
      const line=current===10?2:1;
      return {choices:[{message:{role:"assistant",content:null,tool_calls:[{id:`read-${current}`,type:"function",function:{name:"read_code",arguments:JSON.stringify({path:"server/late.ts",start:line,end:line})}}]}}]};
    }}}};
    const result=await diagnose({version:source.version} as SupportTicket,source,{apiKey:"not-used",model:"mock"},client as any);
    expect(round).toBe(13);
    expect(result.calls).toBe(2);
    expect(result.report.evidence).toEqual(report.evidence);
  });
  it("accepts contiguous or overlapping reads but rejects every unread gap", async () => {
    const source=await fixture();
    await writeFile(path.join(directory,"server","ranges.ts"),"a\nb\nc\nd\ne\nf");
    await source.read("server/ranges.ts",3,4);
    await source.read("server/ranges.ts",1,2);
    expect(source.validates({path:"server/ranges.ts",start:1,end:4})).toBe(true);
    await source.read("server/ranges.ts",6,6);
    expect(source.validates({path:"server/ranges.ts",start:1,end:6})).toBe(false);
    await source.read("server/ranges.ts",4,5);
    expect(source.validates({path:"server/ranges.ts",start:1,end:6})).toBe(true);
    expect(source.validates({path:"server/other.ts",start:1,end:6})).toBe(false);
    expect(source.validates({path:"server/ranges.ts",start:0,end:6})).toBe(false);
    expect(source.validates({path:"server/ranges.ts",start:1,end:7})).toBe(false);
  });
  it.each(["invalid_json", "invalid_field", "too_long"])("corrects %s without accepting the invalid report", async (kind) => {
    const source = await fixture();
    const report = {summary:"Falta comprobar",certainty:"falta_informacion",cause:"Sin evidencia suficiente",proposal:"Revisar",proposedTests:[],questions:[],dataRepair:"",limitations:Array(10).fill("Limitación"),evidence:[]};
    let attempts = 0;
    const client = {chat:{completions:{create:async(request:any)=>{
      if (attempts++ === 0) return {choices:[{message:{role:"assistant",content:kind === "invalid_json" ? "{broken" : JSON.stringify({...report,...(kind === "invalid_field" ? {dataRepair:null} : {summary:"x".repeat(3001)})})}}]};
      const correction = JSON.parse(request.messages.at(-1).content);
      if (correction.review) expect(correction.review).toContain("revisá este borrador");
      else {expect(correction.validationError).toContain("no cumple el formato"); expect(correction.issues.length).toBeGreaterThan(0);}
      return {choices:[{message:{role:"assistant",content:JSON.stringify(report)}}]};
    }}}};
    const result = await diagnose({version:source.version} as SupportTicket,source,{apiKey:"not-used",model:"mock"},client as any);
    expect(attempts).toBe(3);
    expect(result.report.summary).toBe(report.summary);
    expect(result.report.limitations.length).toBeLessThanOrEqual(10);
    expect(result.report.limitations.join(" ")).toContain("revisión humana");
  });
  it("stops after two format corrections instead of saving a malformed report", async () => {
    const source = await fixture();
    let attempts=0;
    const client={chat:{completions:{create:async()=>{attempts++;return {choices:[{message:{role:"assistant",content:"{broken"}}]};}}}};
    await expect(diagnose({version:source.version} as SupportTicket,source,{apiKey:"not-used",model:"mock"},client as any)).rejects.toBeInstanceOf(SyntaxError);
    expect(attempts).toBe(3);
  });
  it("excludes secret files, traversals and symlinks", async () => {
    const source = await fixture();
    await writeFile(
      path.join(directory, "server", "normal.ts"),
      "export const ok=true;",
    );
    await writeFile(path.join(directory, "server", "secrets.ts"), "private");
    await symlink(
      path.join(directory, "server", "normal.ts"),
      path.join(directory, "server", "link.ts"),
    );
    expect(await source.files()).toEqual(["server/normal.ts"]);
    await expect(source.read("../normal.ts")).rejects.toThrow();
    await expect(source.read("server/link.ts")).rejects.toThrow();
  });
  it("only validates evidence actually returned, and preserves line numbers after redaction", async () => {
    const source = await fixture();
    await writeFile(
      path.join(directory, "server", "normal.ts"),
      "-----BEGIN PRIVATE KEY-----\nprivate-value\n-----END PRIVATE KEY-----\nexport const ok=true;\n" +
        "x".repeat(17000) +
        "\nnotReturned",
    );
    const result = await source.read("server/normal.ts", 1, 6);
    expect(result.content).not.toContain("private-value");
    expect(result.content).toContain("4: export const ok=true;");
    expect(
      source.validates({ path: "server/normal.ts", start: 6, end: 6 }),
    ).toBe(false);
  });
  it("requests strict output and accepts a diagnosis based on read lines", async () => {
    const source = await fixture();
    await writeFile(
      path.join(directory, "server", "normal.ts"),
      "export const cost=10;",
    );
    const ticket = { version: source.version } as SupportTicket;
    let round = 0;
    const client = {
      chat: {
        completions: {
          create: async (request: any) => {
            expect(request.response_format.type).toBe("json_schema");
            expect(request.response_format.json_schema.strict).toBe(true);
            expect(
              request.response_format.json_schema.schema.required,
            ).toContain("dataRepair");
            if (round++ === 0)
              return {
                choices: [
                  {
                    message: {
                      role: "assistant",
                      content: null,
                      tool_calls: [
                        {
                          id: "read1",
                          type: "function",
                          function: {
                            name: "read_code",
                            arguments: JSON.stringify({
                              path: "server/normal.ts",
                              start: 1,
                              end: 1,
                            }),
                          },
                        },
                      ],
                    },
                  },
                ],
              };
            return {
              choices: [
                {
                  finish_reason: "stop",
                  message: {
                    content: JSON.stringify({
                      summary: "Costo conservado",
                      certainty: "sustentado_en_codigo",
                      cause: "Costo fijo",
                      proposal: "Revisar el flujo",
                      proposedTests: ["Comprobar una compra"],
                      questions: [],
                      dataRepair: "",
                      limitations: [],
                      evidence: [
                        {
                          path: "server/normal.ts",
                          start: 1,
                          end: 1,
                          explanation: "Valor leído",
                        },
                      ],
                    }),
                  },
                },
              ],
            };
          },
        },
      },
    };
    const result = await diagnose(
      ticket,
      source,
      { apiKey: "not-used", model: "mock" },
      client as any,
    );
    expect(result.report.certainty).toBe("sustentado_en_codigo");
    expect(result.calls).toBe(1);
    expect(result.report.limitations.join(" ")).toContain(
      "no se ejecutaron pruebas",
    );
  });
  it("repairs an invalid citation within the same investigation without trusting unread lines", async () => {
    const source = await fixture();
    await writeFile(
      path.join(directory, "server", "normal.ts"),
      "const cost=10;",
    );
    await source.read("server/normal.ts", 1, 1);
    let attempts = 0;
    const client = {
      chat: {
        completions: {
          create: async (request: any) => {
            const correcting = attempts++ > 0;
            if (correcting) {
              const feedback = JSON.parse(request.messages.at(-1).content);
              expect(feedback.allowedReadRanges).toEqual([
                { path: "server/normal.ts", ranges: [[1, 1]] },
              ]);
              if (feedback.invalidEvidence) expect(feedback.invalidEvidence[0].end).toBe(2);
              else expect(feedback.review).toContain("inspect_symbol");
            }
            return {
              choices: [
                {
                  message: {
                    role: "assistant",
                    content: JSON.stringify({
                      summary: "Resumen",
                      certainty: "sustentado_en_codigo",
                      cause: "Causa",
                      proposal: "Propuesta",
                      proposedTests: [],
                      questions: [],
                      dataRepair: "",
                      limitations: [],
                      evidence: [
                        {
                          path: "server/normal.ts",
                          start: 1,
                          end: correcting ? 1 : 2,
                          explanation: "Costo",
                        },
                      ],
                    }),
                  },
                },
              ],
            };
          },
        },
      },
    };
    const result = await diagnose(
      { version: source.version } as SupportTicket,
      source,
      { apiKey: "not-used", model: "mock" },
      client as any,
    );
    expect(attempts).toBe(3);
    expect(result.report.evidence[0].end).toBe(1);
  });
  it("rejects a diagnosis citing unread source", async () => {
    const source = await fixture();
    await writeFile(path.join(directory, "server", "normal.ts"), "one");
    const ticket = { version: source.version } as SupportTicket;
    const report = {
      summary: "Resumen",
      certainty: "sustentado_en_codigo",
      cause: "Causa",
      proposal: "Propuesta",
      proposedTests: [],
      questions: [],
      dataRepair: "",
      limitations: [],
      evidence: [
        {
          path: "server/normal.ts",
          start: 1,
          end: 1,
          explanation: "Inventada",
        },
      ],
    };
    const client = {
      chat: {
        completions: {
          create: async () => ({
            choices: [{ message: { content: JSON.stringify(report) } }],
          }),
        },
      },
    };
    await expect(
      diagnose(
        ticket,
        source,
        { apiKey: "not-used", model: "mock" },
        client as any,
      ),
    ).rejects.toThrow(/no fueron consultadas/);
    await expect(
      diagnose(
        { ...ticket, version: "b".repeat(40) },
        source,
        { apiKey: "not-used", model: "mock" },
        client as any,
      ),
    ).rejects.toThrow(/no coinciden/);
  });
});

it('preserves only a read-verified draft as partial if coverage review exceeds tokens',async()=>{
 const source=new CodeSource(process.cwd(),'a'.repeat(40));
 const read=await source.read('shared/room-availability.ts',1,10);
 const report={summary:'El código inspeccionado define la comparación de fechas.',certainty:'sustentado_en_codigo',cause:'Comparación inspeccionada',proposal:'Cambiar',proposedTests:[],questions:[],dataRepair:'Modificar datos',limitations:[],evidence:[{path:read.path,start:read.start,end:read.end,explanation:'Comparación'}]};
 let round=0;
 const client={chat:{completions:{create:async()=>round++===0 ? {usage:{total_tokens:1000,prompt_tokens:500},choices:[{message:{role:'assistant',content:JSON.stringify(report)}}]} : {usage:{total_tokens:100000},choices:[]}}}};
 const result=await diagnose({version:source.version} as SupportTicket,source,{apiKey:'unused',model:'mock'},client as any);
 expect(result.report.certainty).toBe('falta_informacion');
 expect(result.report.summary).toContain('Revisión parcial');
 expect(result.report.evidence.map(({path,start,end})=>({path,start,end}))).toEqual(report.evidence.map(({path,start,end})=>({path,start,end})));
 expect(result.report.cause).toBe('');
 expect(result.report.dataRepair).toBe('');
 expect(result.report.proposal).not.toContain('Cambiar');
 expect(round).toBe(2);
});

it('does not mask a provider authentication failure as a partial diagnosis',async()=>{
 const source=new CodeSource(process.cwd(),'a'.repeat(40));
 const report={summary:'Revisión pendiente',certainty:'falta_informacion',cause:'',proposal:'',proposedTests:[],questions:[],dataRepair:'',limitations:[],evidence:[]};
 let round=0;
 const client={chat:{completions:{create:async()=>{
  if(round++===0)return {choices:[{message:{role:'assistant',content:JSON.stringify(report)}}]};
  throw Object.assign(new Error('provider authentication'),{status:401});
 }}}};
 await expect(diagnose({version:source.version} as SupportTicket,source,{apiKey:'unused',model:'mock'},client as any)).rejects.toMatchObject({status:401});
});
