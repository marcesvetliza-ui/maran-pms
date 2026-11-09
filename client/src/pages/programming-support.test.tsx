import {render,screen,waitFor,fireEvent} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {beforeEach,it,expect,vi} from "vitest";
import ProgrammingSupport from "./programming-support";
const state=vi.hoisted(()=>({ready:true,request:vi.fn(),cases:[] as any[]}));
vi.mock("@tanstack/react-query",()=>({useQuery:({queryKey}:any)=>({data:queryKey[0].endsWith("config")?{enabled:state.ready,configured:state.ready}:state.cases}),useQueryClient:()=>({invalidateQueries:vi.fn(async()=>{})})}));
vi.mock("@/lib/queryClient",()=>({apiRequest:state.request}));
beforeEach(()=>{state.ready=true;state.cases=[];state.request.mockReset();});
it('presents clean report headings and hides null placeholders without changing the report',()=>{
 const report={summary:'Corrección: El mensaje se oculta',certainty:'sustentado_en_codigo',validationStatus:'complete',cause:'El catch descarta el detalle',proposal:'Mostrar el detalle recibido',dataRepair:':null',questions:[],proposedTests:[],limitations:[],evidence:[]};
 state.cases=[{id:'case-presentation',title:'Mensaje incompleto',status:'proposal_ready',version:'a'.repeat(40),report,actual:'Error',expected:'Ver detalle',updatedAt:'2026-11-09T12:00:00Z',messages:[]}];
 render(<ProgrammingSupport/>);
 fireEvent.click(screen.getByRole('button',{name:/Mensaje incompleto/}));
 expect(screen.getByRole('heading',{name:'Problema'})).toBeInTheDocument();
 expect(screen.getByText('El mensaje se oculta')).toBeInTheDocument();
 expect(screen.queryByText(':null')).not.toBeInTheDocument();expect(report.summary).toContain('Corrección:');
});
it("keeps queries disabled until configured",()=>{
  state.ready=false;render(<ProgrammingSupport/>);expect(screen.getByRole("button",{name:"Nueva consulta"})).toBeDisabled();expect(state.request).not.toHaveBeenCalled();
});
it("saving a case does not request a diagnosis, and retrying a lost response keeps the request identifier",async()=>{
  const user=userEvent.setup();state.request.mockRejectedValueOnce(new Error("Respuesta perdida")).mockResolvedValueOnce(new Response(JSON.stringify({id:"case-one"})));
  render(<ProgrammingSupport/>);await user.click(screen.getByRole("button",{name:"Nueva consulta"}));
  await user.type(screen.getByLabelText("Título"),"Problema de prueba");await user.type(screen.getByLabelText("Qué ocurrió"),"El filtro no muestra el dato");await user.type(screen.getByLabelText("Qué esperabas"),"Mostrar el resultado");
  expect((screen.getByRole("button",{name:"Guardar consulta"}).closest("form") as HTMLFormElement).checkValidity()).toBe(true);
  fireEvent.submit(screen.getByRole("button",{name:"Guardar consulta"}).closest("form")!);await screen.findByRole("alert");
  fireEvent.submit(screen.getByRole("button",{name:"Guardar consulta"}).closest("form")!);await waitFor(()=>expect(state.request).toHaveBeenCalledTimes(2));
  expect(state.request.mock.calls[0][1]).toBe("/api/programming-support/cases");expect(state.request.mock.calls[1][2].requestId).toBe(state.request.mock.calls[0][2].requestId);expect(state.request.mock.calls.some(call=>call[1].includes("analyze"))).toBe(false);
});

it.each(['Resolvió mi consulta','Sigue el problema'])('records %s without requesting analysis or closing, and retries with the same identifier',async(label)=>{
 const user=userEvent.setup();
 const report={summary:'Inspección de código',certainty:'hipotesis',cause:'',proposal:'',proposedTests:[],questions:[],dataRepair:'',limitations:[],evidence:[]};
 state.cases=[{id:'case-one',title:'Consulta conocida',status:'proposal_ready',version:'a'.repeat(40),reportId:'report-one',report,actual:'Caso sintético',expected:'Revisar',updatedAt:'2026-10-16T12:00:00Z',messages:[]}];
 state.request.mockRejectedValueOnce(new Error('Respuesta perdida')).mockResolvedValueOnce(new Response(JSON.stringify(state.cases[0])));
 render(<ProgrammingSupport/>);
 await user.click(screen.getByRole('button',{name:/Consulta conocida/}));
 await user.click(screen.getByRole('button',{name:label}));
 await screen.findByRole('alert');
 await user.click(screen.getByRole('button',{name:label}));
 await waitFor(()=>expect(state.request).toHaveBeenCalledTimes(2));
 expect(state.request.mock.calls[0][1]).toBe('/api/programming-support/cases/case-one/feedback');
 expect(state.request.mock.calls[0][2]).toMatchObject({reportId:'report-one',outcome:label==='Sigue el problema'?'unresolved':'resolved'});
 expect(state.request.mock.calls[1][2]).toEqual(state.request.mock.calls[0][2]);
 expect(state.request.mock.calls.some(call=>/analyze|close/.test(call[1]))).toBe(false);
});

it('shows the cited screen and exact assertion fragments without claiming test execution',async()=>{
 const user=userEvent.setup();
 const report={summary:'Inspección de código',certainty:'hipotesis',cause:'',proposal:'',proposedTests:[],questions:[],dataRepair:'',limitations:[],evidence:[{path:'client/src/components/planning-reservation-detail.tsx',start:99,end:115,explanation:'Catch de Planning'},{path:'server/tests/room-availability.test.ts',start:12,end:31,explanation:'Función pura',assertionFragments:[{start:24,end:27,code:'24: expect(isRoomAvailableForInterval(input)).toBe(false);',partial:false}]}]};
 state.cases=[{id:'case-one',title:'Consulta conocida',status:'proposal_ready',version:'a'.repeat(40),report,actual:'Caso sintético',expected:'Revisar',updatedAt:'2026-10-16T12:00:00Z',messages:[]}];
 render(<ProgrammingSupport/>);
 await user.click(screen.getByRole('button',{name:/Consulta conocida/}));
 expect(screen.getByText('Interfaz con evidencia citada: Planning.')).toBeInTheDocument();
 await user.click(screen.getByText('Evidencia consultada'));
 await user.click(screen.getByText('Aserciones leídas — sin ejecutar'));
 expect(screen.getByText(/24: expect\(isRoomAvailableForInterval/)).toBeInTheDocument();
 expect(state.request).not.toHaveBeenCalled();
});

it('shows internal incomplete validation without asking the operator for missing facts',async()=>{
 const user=userEvent.setup();
 state.cases=[{id:'case-partial',title:'Validación pendiente',status:'validation_incomplete',version:'a'.repeat(40),
   report:{summary:'Revisión parcial: falta completar la validación.',certainty:'hipotesis',validationStatus:'incomplete',
     cause:'',proposal:'Completar revisión',proposedTests:[],questions:[],dataRepair:'',limitations:[],evidence:[]},
   actual:'Caso sintético',expected:'Revisar',updatedAt:'2026-10-17T12:00:00Z',messages:[]}];
 render(<ProgrammingSupport/>);
 await user.click(screen.getByRole('button',{name:/Validación pendiente/}));
 expect(screen.getAllByText('Validación inconclusa').length).toBeGreaterThan(0);
 expect(screen.queryByText('Información necesaria para continuar')).not.toBeInTheDocument();
 expect(state.request).not.toHaveBeenCalled();
});

it('opens a historical execution without inventing the reason or requesting a paid retry',async()=>{
 const user=userEvent.setup();
 state.cases=[{id:'historical-case',title:'Intento anterior',status:'validation_incomplete',version:'a'.repeat(40),report:null,actual:'Caso sintético',expected:'Revisar',updatedAt:'2026-11-06T23:00:00Z',messages:[]}];
 render(<ProgrammingSupport/>);await user.click(screen.getByRole('button',{name:/Intento anterior/}));await user.click(screen.getByText('Detalle de ejecución'));
 expect(screen.getByText('Consulta: historical-case')).toBeInTheDocument();expect(screen.getByText(/Este intento no tiene un registro de ejecución guardado/)).toBeInTheDocument();expect(state.request).not.toHaveBeenCalled();
});

it('shows a recorded budget block with actual counts without treating it as an approved review',async()=>{
 const user=userEvent.setup();
 state.cases=[{id:'new-case',title:'Intento con registro',status:'validation_incomplete',version:'a'.repeat(40),report:null,actual:'Caso sintético',expected:'Revisar',updatedAt:'2026-11-06T23:00:00Z',messages:[],execution:{revision:'a'.repeat(40),finishedAt:'2026-11-06T23:00:00Z',outcome:'incomplete',partialReason:'correction_reserve',tokens:65000,calls:4,semanticAudits:0,stages:[{stage:'audit',outcome:'blocked',tokens:0,totalTokens:65000,elapsedMs:0,reason:'budget',availableTokens:35000,reservedTokens:40000}]}}];
 render(<ProgrammingSupport/>);await user.click(screen.getByRole('button',{name:/Intento con registro/}));await user.click(screen.getByText('Detalle de ejecución'));
 expect(screen.getByText(/No alcanzó el presupuesto reservado/)).toBeInTheDocument();expect(screen.getByText(/Tokens consumidos: 65000/)).toBeInTheDocument();expect(screen.getByText(/Detenida por un límite/)).toBeInTheDocument();expect(screen.queryByText('Revisión completada.')).not.toBeInTheDocument();expect(state.request).not.toHaveBeenCalled();
});

it('shows an invalid audit reason without confusing it with a rejection or another paid attempt',async()=>{
 const user=userEvent.setup();
 state.cases=[{id:'audit-case',title:'Auditoría inválida',status:'failed',version:'a'.repeat(40),report:null,actual:'Caso sintético',expected:'Revisar',updatedAt:'2026-11-06T23:00:00Z',messages:[],execution:{revision:'a'.repeat(40),finishedAt:'2026-11-06T23:00:00Z',outcome:'failed',failureCode:'diagnosis_audit',auditReason:'invalid_schema',auditSchemaIssues:[{path:'issues.item.problem',code:'too_big'}],semanticAudits:1,tokens:56841,calls:6,stages:[]}}];
 render(<ProgrammingSupport/>);await user.click(screen.getByRole('button',{name:/Auditoría inválida/}));await user.click(screen.getByText('Detalle de ejecución'));
 expect(screen.getByText(/La respuesta del auditor no cumplió el formato requerido/)).toBeInTheDocument();expect(screen.getByText(/Campo: issues.item.problem/)).toBeInTheDocument();expect(screen.getByText(/Revisiones independientes: 1/)).toBeInTheDocument();expect(state.request).not.toHaveBeenCalled();
});
it('does not guess the audit reason for attempts that did not persist it',async()=>{
 const user=userEvent.setup();
 state.cases=[{id:'old-audit',title:'Auditoría anterior',status:'failed',version:'a'.repeat(40),report:null,actual:'Caso sintético',expected:'Revisar',updatedAt:'2026-11-06T23:00:00Z',messages:[],execution:{revision:'a'.repeat(40),finishedAt:'2026-11-06T23:00:00Z',outcome:'failed',failureCode:'diagnosis_audit',tokens:56841,stages:[]}}];
 render(<ProgrammingSupport/>);await user.click(screen.getByRole('button',{name:/Auditoría anterior/}));await user.click(screen.getByText('Detalle de ejecución'));
 expect(screen.getByText(/Este intento no guardó el motivo específico/)).toBeInTheDocument();expect(screen.queryByText(/invalid_schema/)).not.toBeInTheDocument();expect(state.request).not.toHaveBeenCalled();
});
it('shows rejected drafts and audit findings only as private evaluation material without actions',async()=>{
 const user=userEvent.setup();
 const draft={summary:'Primer borrador',cause:'Hipótesis',proposal:'Propuesta cuestionada',certainty:'hipotesis',questions:[],proposedTests:[],dataRepair:'',limitations:[],evidence:[]};
 state.cases=[{id:'rejected-case',title:'Rechazo con material',status:'failed',version:'a'.repeat(40),report:null,actual:'Caso sintético',expected:'Revisar',updatedAt:'2026-11-07T00:00:00Z',messages:[],rejectedReviews:[{audit:1,draft,issues:[{statementId:'proposal_1_1',problem:'Observación del primer auditor',correction:'Corrección solicitada'}]},{audit:2,draft:{...draft,proposal:'Segunda propuesta'},issues:[{statementId:'proposal_1_1',problem:'Observación del segundo auditor',correction:'Revisar el código'}]}]}];
 render(<ProgrammingSupport/>);await user.click(screen.getByRole('button',{name:/Rechazo con material/}));await user.click(screen.getByText('Borradores y observaciones de la revisión'));
 expect(screen.getByText(/No es un diagnóstico aprobado/)).toBeInTheDocument();expect(screen.getByText(/Observación del primer auditor/)).toBeInTheDocument();expect(screen.getByText(/Observación del segundo auditor/)).toBeInTheDocument();expect(screen.queryByText('Diagnóstico y propuesta')).not.toBeInTheDocument();expect(screen.queryByRole('button',{name:'Resolvió mi consulta'})).not.toBeInTheDocument();expect(state.request).not.toHaveBeenCalled();
});

it('presents an operational question without a diagnosis and requires a saved reply before continuing',async()=>{
 const user=userEvent.setup();
 state.cases=[{id:'case-one',title:'NC con error',status:'needs_info',version:'a'.repeat(40),report:null,clarification:{facts:['exact_error'],questions:['¿Qué mensaje exacto aparece?'],requestedAfterMessageCount:0},actual:'Apareció un error al emitir NC',expected:'Anular factura',updatedAt:'2026-10-22T12:00:00Z',messages:[]}];
 const {rerender}=render(<ProgrammingSupport/>);
 await user.click(screen.getByRole('button',{name:/NC con error/}));
 expect(screen.getByText('Necesito un dato para continuar')).toBeInTheDocument();expect(screen.getByText('¿Qué mensaje exacto aparece?')).toBeInTheDocument();expect(screen.queryByText('Diagnóstico y propuesta')).not.toBeInTheDocument();
 expect(screen.getByRole('button',{name:'Continuar con la información agregada'})).toBeDisabled();
 state.cases=[{...state.cases[0],messages:[{id:'answer',author:'user',text:'Error 10049',createdAt:'2026-10-22T12:01:00Z'}]}];
 rerender(<ProgrammingSupport/>);
 expect(screen.getByRole('button',{name:'Continuar con la información agregada'})).toBeEnabled();
 expect(state.request).not.toHaveBeenCalled();
});
