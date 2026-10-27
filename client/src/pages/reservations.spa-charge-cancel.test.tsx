import { QueryClientProvider } from "@tanstack/react-query";
import { cleanup,render,screen,waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach,beforeEach,expect,it,vi } from "vitest";
import { queryClient } from "@/lib/queryClient";
const {toast}=vi.hoisted(()=>({toast:vi.fn()}));
vi.mock("@/hooks/use-toast",()=>({useToast:()=>({toast,toasts:[],dismiss:vi.fn()})}));
import { ReservationDetailDialog } from "./reservations";
const reservation={id:"spa-room",reservationCode:"RES-SPA",status:"checked_in",checkInDate:"2026-10-16",checkOutDate:"2026-10-17",totalRoomAmount:"100000",numberOfGuests:1,
 guest:{id:"guest",firstName:"Pablo",lastName:"Prueba"},room:{id:"room",roomNumber:"201",roomType:{name:"Doble"}}};
let fail=false,cancelled=false;
beforeEach(()=>{
 queryClient.clear();toast.mockClear();fail=false;cancelled=false;
 vi.stubGlobal("fetch",vi.fn(async(input:RequestInfo|URL,init?:RequestInit)=>{
  const url=String(input),json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{"content-type":"application/json"}});
  if(url==="/api/charges/spa-charge/anular"&&init?.method==="PATCH") {
   if(fail)return json({ok:false,error:{code:"CHARGE_HAS_FISCAL_HISTORY",message:"El cargo ya tiene un comprobante asociado."}},409);
   cancelled=true;return json({id:"spa-charge",status:"anulado"});
  }
  if(url.endsWith("/charges?includeAnulados=true"))return json([{id:"spa-charge",description:"SPA · Masaje",category:"spa",amount:"95000",date:"2026-10-16",status:cancelled?"anulado":"active"}]);
  return json(url.endsWith("/api/billing/config")?{}:[]);
 }));
});
afterEach(()=>{cleanup();queryClient.clear();vi.unstubAllGlobals();});
async function openCancellation(){
 render(<QueryClientProvider client={queryClient}><ReservationDetailDialog reservation={reservation as any} open onOpenChange={vi.fn()} onCancel={vi.fn()}/></QueryClientProvider>);
 const user=userEvent.setup();await user.click(await screen.findByTestId("tab-folio"));await user.click(await screen.findByTestId("button-anular-charge-spa-charge"));return user;
}
it("requires a reason before cancelling the SPA room charge and refreshes its cancelled state",async()=>{
 const user=await openCancellation(),confirm=screen.getByTestId("button-confirm-anular");
 expect(confirm).toBeDisabled();await user.type(screen.getByTestId("input-motivo-anulacion"),"Error de carga");expect(confirm).toBeEnabled();await user.click(confirm);
 await waitFor(()=>expect(toast).toHaveBeenCalledWith(expect.objectContaining({title:"Cargo anulado"})));
 expect(screen.queryByTestId("input-motivo-anulacion")).not.toBeInTheDocument();
 await waitFor(()=>expect(screen.queryByTestId("button-anular-charge-spa-charge")).not.toBeInTheDocument());
 const calls=(fetch as ReturnType<typeof vi.fn>).mock.calls.filter(([url])=>String(url).endsWith("/anular"));
 expect(calls).toHaveLength(1);expect(JSON.parse(String(calls[0][1]?.body))).toEqual({motivoAnulacion:"Error de carga"});
});
it("keeps the cancellation dialog and reason when rejected and shows a readable fiscal conflict",async()=>{
 fail=true;const user=await openCancellation();await user.type(screen.getByTestId("input-motivo-anulacion"),"Error de carga");await user.click(screen.getByTestId("button-confirm-anular"));
 await waitFor(()=>expect(toast).toHaveBeenCalledWith(expect.objectContaining({description:"El cargo ya tiene un comprobante asociado.",variant:"destructive"})));
 expect(screen.getByTestId("input-motivo-anulacion")).toHaveValue("Error de carga");expect(cancelled).toBe(false);
});
