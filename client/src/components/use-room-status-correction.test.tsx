import {render,screen,fireEvent,waitFor} from "@testing-library/react";
import {QueryClientProvider} from "@tanstack/react-query";
import {beforeEach,describe,it,expect,vi} from "vitest";
import {useRoomStatusCorrection} from "./use-room-status-correction";
import {apiRequest,queryClient} from "@/lib/queryClient";
vi.mock("@/lib/queryClient",async original=>({...await original<typeof import("@/lib/queryClient")>(),apiRequest:vi.fn()}));
vi.mock("@/hooks/use-toast",()=>({useToast:()=>({toast:vi.fn()})}));
function Harness(){
 const correction=useRoomStatusCorrection([{id:"room",roomNumber:"201",status:"dirty"}]);
 return <><button onClick={()=>correction.mutate({roomId:"room",status:"available"})}>Corregir</button>{correction.dialog}</>;
}
const setup=()=>render(<QueryClientProvider client={queryClient}><Harness/></QueryClientProvider>);
beforeEach(()=>{queryClient.clear();vi.mocked(apiRequest).mockReset().mockResolvedValue(new Response("{}"));});
describe("Exceptional room status correction",()=>{
 it("does not write on opening or cancellation and requires a reason",()=>{
  setup();fireEvent.click(screen.getByText("Corregir"));
  expect(screen.getByRole("button",{name:"Confirmar corrección"})).toBeDisabled();
  expect(apiRequest).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText("Motivo de la corrección"),{target:{value:"Revisada"}});
  fireEvent.click(screen.getByRole("button",{name:"Cancelar"}));
  expect(apiRequest).not.toHaveBeenCalled();
 });
 it("uses the guarded endpoint with a trimmed reason and captured original state",async()=>{
  setup();fireEvent.click(screen.getByText("Corregir"));
  fireEvent.change(screen.getByLabelText("Motivo de la corrección"),{target:{value:"  Limpieza cerrada por error  "}});
  fireEvent.click(screen.getByRole("button",{name:"Confirmar corrección"}));
  await waitFor(()=>expect(apiRequest).toHaveBeenCalledWith("PATCH","/api/housekeeping/room/room/status",{status:"available",expectedStatus:"dirty",reason:"Limpieza cerrada por error"}));
  await waitFor(()=>expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
 });
 it("keeps the reason and shows a conflict without claiming the correction succeeded",async()=>{
  vi.mocked(apiRequest).mockRejectedValue(new Error('409: {"error":"El estado cambió"}'));
  setup();fireEvent.click(screen.getByText("Corregir"));
  fireEvent.change(screen.getByLabelText("Motivo de la corrección"),{target:{value:"Revisión"}});
  fireEvent.click(screen.getByRole("button",{name:"Confirmar corrección"}));
  expect(await screen.findByRole("alert")).toHaveTextContent("El estado cambió");
  expect(screen.getByLabelText("Motivo de la corrección")).toHaveValue("Revisión");
 });
});
