import {render,screen,fireEvent,waitFor} from "@testing-library/react";
import {QueryClientProvider} from "@tanstack/react-query";
import {beforeEach,describe,it,expect,vi} from "vitest";
import {useHousekeepingStatus} from "./use-housekeeping-status";
import {apiRequest,queryClient} from "@/lib/queryClient";
const {toast}=vi.hoisted(()=>({toast:vi.fn()}));
vi.mock("@/lib/queryClient",async original=>({...await original<typeof import("@/lib/queryClient")>(),apiRequest:vi.fn()}));
vi.mock("@/hooks/use-toast",()=>({useToast:()=>({toast})}));
function Harness(){
 const correction=useHousekeepingStatus([{id:"room",roomNumber:"201",status:"dirty"}]);
 return <><button disabled={correction.isPending} onClick={()=>correction.mutate({roomId:"room",status:"available"})}>Marcar limpia</button>{correction.dialog}</>;
}
const setup=()=>render(<QueryClientProvider client={queryClient}><Harness/></QueryClientProvider>);
beforeEach(()=>{queryClient.clear();toast.mockReset();vi.mocked(apiRequest).mockReset().mockResolvedValue(new Response("{}"));});
describe("Direct Housekeeping status changes",()=>{
 it("writes immediately without a dialog or a reason, preserving the state guard",async()=>{
  setup();fireEvent.click(screen.getByText("Marcar limpia"));
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  await waitFor(()=>expect(apiRequest).toHaveBeenCalledWith("PATCH","/api/housekeeping/room/room/status",{status:"available",expectedStatus:"dirty"}));
  await waitFor(()=>expect(toast).toHaveBeenCalledWith({title:"Estado actualizado"}));
 });
 it("prevents double clicks while the request is pending",async()=>{
  let resolve!: (response:Response)=>void;
  vi.mocked(apiRequest).mockReturnValue(new Promise(r=>{resolve=r;}));
  setup();fireEvent.click(screen.getByText("Marcar limpia"));fireEvent.click(screen.getByText("Marcar limpia"));
  await waitFor(()=>expect(apiRequest).toHaveBeenCalledTimes(1));
  resolve(new Response("{}"));
  await waitFor(()=>expect(screen.getByText("Marcar limpia")).not.toBeDisabled());
 });
 it("shows conflicts, refreshes the room, and permits retry without a false success",async()=>{
  vi.mocked(apiRequest).mockRejectedValue(new Error('409: {"error":"El estado cambió"}'));
  const invalidate=vi.spyOn(queryClient,"invalidateQueries");
  setup();fireEvent.click(screen.getByText("Marcar limpia"));
  await waitFor(()=>expect(toast).toHaveBeenCalledWith(expect.objectContaining({description:"El estado cambió",variant:"destructive"})));
  expect(invalidate).toHaveBeenCalledWith({queryKey:["/api/rooms"]});
  expect(toast).not.toHaveBeenCalledWith({title:"Estado actualizado"});
  await waitFor(()=>expect(screen.getByText("Marcar limpia")).not.toBeDisabled());
  invalidate.mockRestore();
 });
});
