import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { SpaFundingConnectedPanel } from "./spa-funding-connected-panel";
const scope={kind:"spa",id:"spa-connected"};
let prepared:boolean, denied:boolean, shiftFailure:boolean;
let calls:Array<{url:string;body:unknown}>;
const response=(data:unknown)=>new Response(JSON.stringify({ok:true,data}));
function mount(canWrite=true) {
 const client=new QueryClient({defaultOptions:{queries:{retry:false,gcTime:0}}});
 return render(<QueryClientProvider client={client}><SpaFundingConnectedPanel accountId={scope.id} userId="u1" canWrite={canWrite}/></QueryClientProvider>);
}
beforeEach(()=>{
 sessionStorage.clear();prepared=false;denied=false;shiftFailure=false;calls=[];
 vi.stubGlobal("fetch",vi.fn(async(url:string,init?:RequestInit)=>{
  const body=init?.body?JSON.parse(init.body as string):undefined;calls.push({url,body});
  if(url.endsWith("/collection-shifts")) return shiftFailure?new Response("Not found",{status:404}):response([{id:"my-shift",label:"Mi caja SPA"}]);
  if(url.endsWith("/prepare-document")) {
   if(denied)return new Response(JSON.stringify({ok:false,error:{code:"FISCAL_PREPARATION_REQUIRED",message:"Falta condición IVA en la ficha."}}),{status:409});
   prepared=true;return response({documentId:"server-doc",totalCents:9500000});
  }
  if(url.includes("/scopes/"))return response({scope,receipts:[],documents:prepared?[{id:"server-doc",totalCents:9500000,status:"draft",snapshot:{recipient:{razonSocial:"Cliente verificado"},tipo:"FB"}}]:[],operations:[],debtCents:9500000,rectifications:[]});
  throw new Error(`Unexpected ${url}`);
 }));
});
afterEach(()=>vi.unstubAllGlobals());
describe("conexión de preparación fiscal y cajas autorizadas",()=>{
 it("prepara sólo mediante body vacío, recarga el documento persistido y muestra su receptor",async()=>{
  const user=userEvent.setup();mount();
  const button=await screen.findByRole("button",{name:"Preparar comprobante"});
  await waitFor(()=>expect(button).toBeEnabled());await user.click(button);
  expect(await screen.findByText("Receptor: Cliente verificado")).toBeInTheDocument();
  expect(screen.getByLabelText("Documento fiscal")).toHaveValue("server-doc");
  expect(calls.filter(call=>call.url.endsWith("/prepare-document"))).toEqual([{url:"/api/payment-funding/spa/spa-connected/prepare-document",body:{}}]);
 });
 it("carga las cajas del servidor sin permitir ingresar identidades manuales",async()=>{
  mount();expect(await screen.findByRole("option",{name:"Mi caja SPA"})).toHaveValue("my-shift");
  expect(screen.getByLabelText("Turno del faltante").tagName).toBe("SELECT");
 });
 it("si no hay endpoint de cajas bloquea dinero nuevo y permite consultar el folio",async()=>{
  shiftFailure=true;mount();
  expect(await screen.findByRole("alert")).toHaveTextContent("cobro de dinero nuevo queda deshabilitado");
  expect(screen.queryByLabelText("Dinero nuevo")).not.toBeInTheDocument();
  expect(await screen.findByText(/Saldo pendiente de cobro/)).toBeInTheDocument();
 });
 it("muestra el error de preparación sin inventar documentos ni emitir",async()=>{
  denied=true;const user=userEvent.setup();mount();
  const button=await screen.findByRole("button",{name:"Preparar comprobante"});
  await waitFor(()=>expect(button).toBeEnabled());await user.click(button);
  expect(await screen.findByRole("alert")).toHaveTextContent("Falta condición IVA");
  expect(screen.queryByRole("option",{name:/server-doc/})).not.toBeInTheDocument();
  expect(calls.some(call=>call.url.endsWith("/operations"))).toBe(false);
 });
 it("sólo consulta no habilita preparación ni cobro",async()=>{
  mount(false);expect(await screen.findByRole("button",{name:"Preparar comprobante"})).toBeDisabled();
  expect(calls.every(call=>call.body===undefined)).toBe(true);
 });
});
