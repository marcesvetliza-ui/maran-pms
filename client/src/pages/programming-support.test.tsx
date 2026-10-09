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
