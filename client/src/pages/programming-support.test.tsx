import {render,screen,waitFor,fireEvent} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {beforeEach,it,expect,vi} from "vitest";
import ProgrammingSupport from "./programming-support";
const state=vi.hoisted(()=>({ready:true,request:vi.fn(),cases:[] as any[]}));
vi.mock("@tanstack/react-query",()=>({useQuery:({queryKey}:any)=>({data:queryKey[0].endsWith("config")?{enabled:state.ready,configured:state.ready}:state.cases}),useQueryClient:()=>({invalidateQueries:vi.fn(async()=>{})})}));
vi.mock("@/lib/queryClient",()=>({apiRequest:state.request}));
beforeEach(()=>{state.ready=true;state.cases=[];state.request.mockReset();});
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
