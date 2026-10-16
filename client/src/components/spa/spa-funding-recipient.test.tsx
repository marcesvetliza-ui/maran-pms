import {render,screen,waitFor} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {QueryClient,QueryClientProvider} from "@tanstack/react-query";
import {beforeEach,afterEach,it,expect,vi} from "vitest";
import {SpaFundingRecipientEditor} from "./spa-funding-recipient";
import {SpaFundingPanel} from "./spa-funding-panel";
vi.mock("@/components/guest-search-combobox",()=>({GuestSearchCombobox:({onGuestSelect}:{onGuestSelect:(g:{id:string})=>void})=><button onClick={()=>onGuestSelect({id:"existing"})}>Elegir cliente existente</button>}));
const profile={guestId:null,kind:null,firstName:"Nombre del turno",lastName:"",documentType:"DNI",documentNumber:"",vatCondition:"",cuit:"",address:"",editable:true};
let calls:Array<{url:string;body:any}>,failure:boolean;
const response=(data:any)=>new Response(JSON.stringify({ok:true,data}));
beforeEach(()=>{
 sessionStorage.clear();calls=[];failure=false;
 vi.stubGlobal("fetch",vi.fn(async(url:string,init?:RequestInit)=>{
  const body=init?.body?JSON.parse(String(init.body)):undefined;calls.push({url,body});
  if(url.endsWith("/recipients/existing"))return response({...profile,guestId:"existing",kind:"guest",firstName:"Cliente",lastName:"Guardado",documentNumber:"30.111.222",vatCondition:"Consumidor Final",cuit:"20-30111222-3"});
  if(body) return failure?new Response(JSON.stringify({ok:false,error:{code:"CLIENT_ALREADY_EXISTS",message:"Ya existe una ficha con ese documento."}}),{status:409}):response({...profile,...body,guestId:body.guestId??"new",kind:"guest"});
  return response(profile);
 }));
});
afterEach(()=>vi.unstubAllGlobals());
function mount(canWrite=true){
 const onSaved=vi.fn();render(<QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false,gcTime:0}}})}><SpaFundingRecipientEditor accountId="account" userId="user" canWrite={canWrite} onSaved={onSaved}/></QueryClientProvider>);return onSaved;
}
it("permite completar la ficha que falta y guardarla sin emitir ni cobrar",async()=>{
 const user=userEvent.setup(),onSaved=mount();
 expect(await screen.findByLabelText("Nombre / razón social")).toHaveValue("Nombre del turno");
 await user.type(screen.getByLabelText("Número de documento"),"30111222");
 await user.selectOptions(screen.getByLabelText("Condición IVA"),"consumidor_final");
 await user.click(screen.getByRole("button",{name:"Guardar y vincular cliente"}));
 await waitFor(()=>expect(onSaved).toHaveBeenCalledTimes(1));
 expect(calls.filter(c=>c.body)).toEqual([{url:"/api/payment-funding/spa/account/recipient",body:expect.objectContaining({firstName:"Nombre del turno",documentNumber:"30111222",vatCondition:"consumidor_final"})}]);
});
it("precarga una ficha elegida y envía su ID explícito",async()=>{
 const user=userEvent.setup();mount();
 await user.click(await screen.findByRole("button",{name:"Elegir cliente existente"}));
 await waitFor(()=>expect(screen.getByLabelText("Número de documento")).toHaveValue("30111222"));
 await user.click(screen.getByRole("button",{name:"Guardar y vincular cliente"}));
 await waitFor(()=>expect(calls.some(c=>c.body?.guestId==="existing")).toBe(true));
 expect(calls.find(c=>c.body?.guestId==="existing")?.body).toMatchObject({documentNumber:"30111222",cuit:"20301112223",vatCondition:"consumidor_final"});
});
it("el rechazo conserva la ficha sin tratar el guardado como completado",async()=>{
 failure=true;const user=userEvent.setup(),onSaved=mount();
 await user.type(await screen.findByLabelText("Número de documento"),"30111222");
 await user.selectOptions(screen.getByLabelText("Condición IVA"),"consumidor_final");
 await user.click(screen.getByRole("button",{name:"Guardar y vincular cliente"}));
 expect(await screen.findByRole("alert")).toHaveTextContent("Ya existe una ficha");expect(onSaved).not.toHaveBeenCalled();
 expect(screen.getByLabelText("Número de documento")).toHaveValue("30111222");
});
it("el rol de consulta no puede guardar datos fiscales",async()=>{
 mount(false);expect(await screen.findByRole("button",{name:"Guardar y vincular cliente"})).toBeDisabled();
 expect(calls.every(c=>c.body===undefined)).toBe(true);
});
it("el historial anterior se muestra sin permitir otra factura o cobro",async()=>{
 const prepare=vi.fn();vi.stubGlobal("fetch",vi.fn(async()=>response({scope:{kind:"spa",id:"account"},receipts:[],documents:[],operations:[],debtCents:0,rectifications:[],
  legacyHistory:{reason:"Historia fiscal anterior",status:"closed",totalCents:8500000,paidCents:8500000,payments:[{id:"p",method:"cash",status:"active",amountCents:8500000}],invoices:[{id:"i",type:"FB",point:99,number:1,status:"emitida",amountCents:8500000}]}})));
 render(<SpaFundingPanel accountId="account" userId="user" canWrite onPrepareDocument={prepare}/>);
 expect(await screen.findByText("Historial anterior al cambio de motor")).toBeInTheDocument();
 expect(screen.queryByRole("button",{name:"Preparar comprobante"})).not.toBeInTheDocument();
 expect(screen.queryByRole("button",{name:"Previsualizar financiación"})).not.toBeInTheDocument();expect(prepare).not.toHaveBeenCalled();
});
