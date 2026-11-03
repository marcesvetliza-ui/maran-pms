import { QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { queryClient } from "@/lib/queryClient";
const {toast}=vi.hoisted(()=>({toast:vi.fn()}));
vi.mock("@/hooks/use-toast",()=>({useToast:()=>({toast,toasts:[],dismiss:vi.fn()})}));
vi.mock("@/App",()=>({useAuth:()=>({user:{role:"admin"}})}));
import PurchaseInvoices from "./purchase-invoices";
let estado:string, status:number, error:string, pending:Promise<Response>|null;
const json=(body:unknown,code=200)=>new Response(JSON.stringify(body),{status:code,headers:{"content-type":"application/json"}});
beforeEach(()=>{
 queryClient.clear();toast.mockReset();estado="pendiente";status=200;error="";pending=null;
 window.history.replaceState({},"","/purchase-invoices");
 vi.stubGlobal("fetch",vi.fn(async(input:RequestInfo|URL,init?:RequestInit)=>{
  const url=String(input);
  if(url==="/api/purchase-invoices/1"&&init?.method==="DELETE"){
   if(pending)return pending;
   if(status!==200)return json({error},status);
   estado="anulado";return json({ok:true});
  }
  if(url==="/api/purchase-invoices")return json([{id:1,tipo_comprobante:"FACT-B",numero_comprobante:"00024252",punto_venta:"00001",proveedor_nombre:"Proveedor prueba",fecha_emision:"2026-10-26",periodo:"10/2026",monto_total:"130000",saldo:"130000",estado}]);
  return json([]);
 }));
});
afterEach(()=>{cleanup();queryClient.clear();vi.unstubAllGlobals();});
async function open(){
 render(<QueryClientProvider client={queryClient}><PurchaseInvoices/></QueryClientProvider>);
 const user=userEvent.setup();await user.click(await screen.findByTestId("btn-anular-invoice-1"));return user;
}
it.each([
 [409,"Este comprobante ingresó artículos al stock. La anulación requiere revertir primero esos movimientos."],
 [403,"No tenés permiso para anular este comprobante."],
 [500,"No se pudo completar la anulación."],
])("shows the backend %s rejection and retains the confirmation instead of silently closing",async(code,message)=>{
 status=code as number;error=message as string;
 const user=await open();await user.click(screen.getByTestId("btn-confirm-anular"));
 expect(await screen.findByTestId("purchase-annulment-error")).toHaveTextContent(message as string);
 expect(screen.getByRole("alertdialog")).toBeInTheDocument();expect(screen.getByTestId("btn-confirm-anular")).toBeEnabled();
 expect(toast).toHaveBeenCalledWith(expect.objectContaining({title:"No se pudo anular el comprobante",description:message,variant:"destructive"}));
 expect(estado).toBe("pendiente");
});
it("closes only after success, confirms annulment and refreshes the row",async()=>{
 const user=await open();await user.click(screen.getByTestId("btn-confirm-anular"));
 await waitFor(()=>expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
 expect(toast).toHaveBeenCalledWith({title:"Comprobante anulado"});
 await waitFor(()=>expect(screen.queryByTestId("btn-anular-invoice-1")).not.toBeInTheDocument());
 expect(await screen.findByText("Anulado")).toBeInTheDocument();
 expect((fetch as ReturnType<typeof vi.fn>).mock.calls.filter(([,init])=>init?.method==="DELETE")).toHaveLength(1);
});
it("prevents double submission and stays open while the request is pending",async()=>{
 let resolve!:(value:Response)=>void;pending=new Promise<Response>(r=>{resolve=r;});
 const user=await open();await user.click(screen.getByTestId("btn-confirm-anular"));
 expect(screen.getByTestId("btn-confirm-anular")).toBeDisabled();expect(screen.getByTestId("btn-confirm-anular")).toHaveTextContent("Anulando");
 expect(screen.getByRole("button",{name:"Cancelar"})).toBeDisabled();
 await user.click(screen.getByTestId("btn-confirm-anular"));
 expect((fetch as ReturnType<typeof vi.fn>).mock.calls.filter(([,init])=>init?.method==="DELETE")).toHaveLength(1);
 resolve(json({error:"Stock vinculado"},409));
 expect(await screen.findByTestId("purchase-annulment-error")).toHaveTextContent("Stock vinculado");
});
