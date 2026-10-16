import { render, screen, waitFor, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { SpaAccountFolio } from "./spa-account-folio";
vi.mock("./spa-funding-connected-panel",()=>({SpaFundingConnectedPanel:()=> <p>Paso fiscal conectado</p>}));
let view:any,calls:Array<{url:string;body:any}>,lose:boolean;
const ok=(data:unknown)=>new Response(JSON.stringify({ok:true,data}));
function mount(canWrite=true){return render(<QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false,gcTime:0}}})}><SpaAccountFolio accountId="account" userId="cashier" canWrite={canWrite}/></QueryClientProvider>);}
beforeEach(()=>{
 sessionStorage.clear();lose=false;calls=[];
 view={id:"account",guestName:"Cliente SPA",status:"open",totalCents:8500000,paidCents:0,balanceCents:8500000,readOnly:false,canInvoice:true,transferred:null,
  items:[{id:"treatment",description:"Masaje integral",quantity:1,unitPrice:85000,subtotal:85000,itemType:"treatment",inventoryItemId:null}],payments:[],movements:[],operations:[],invoices:[],events:[]};
 vi.stubGlobal("fetch",vi.fn(async(url:string,init?:RequestInit)=>{
  const body=init?.body?JSON.parse(String(init.body)):undefined;calls.push({url,body});
  if(url.endsWith("/product-catalog"))return ok([{id:"cream",name:"Crema"}]);
  if(url.endsWith("/collection-shifts"))return ok([{id:"shift",label:"Mi caja"}]);
  if(url.endsWith("/room-targets"))return ok([{id:"reservation",roomNumber:"806",firstName:"Otro",lastName:"Huésped"}]);
  if(url.endsWith("/account")){
   if(!body)return ok(view);
   if(lose){lose=false;throw new TypeError("Conexión interrumpida");}
   return ok({action:body.request.action});
  }
  throw new Error(`Unexpected ${url}`);
 }));
});
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
it("opens the account with charges, payments and balance before any billing step",async()=>{
 mount();expect(await screen.findByText("Masaje integral")).toBeInTheDocument();
 expect(screen.getByText("Sin pagos registrados")).toBeInTheDocument();
 expect(screen.queryByText("Paso fiscal conectado")).not.toBeInTheDocument();
 expect(calls.filter(c=>c.body)).toHaveLength(0);
 await userEvent.click(screen.getByRole("button",{name:"Ir a facturación"}));
 expect(screen.getByText("Paso fiscal conectado")).toBeInTheDocument();
});
it("adds a product with a stable command, integer cents, quantity and inventory identity",async()=>{
 mount();await screen.findByText("Masaje integral");
 await userEvent.click(screen.getByRole("button",{name:"Agregar cargo"}));
 await userEvent.selectOptions(await screen.findByLabelText("Producto del cargo"),"cream");
 await userEvent.clear(screen.getByLabelText("Cantidad"));await userEvent.type(screen.getByLabelText("Cantidad"),"2");
 await userEvent.type(screen.getByLabelText("Precio unitario"),"1250,50");
 await userEvent.click(screen.getByRole("button",{name:"Guardar cargo"}));
 await waitFor(()=>expect(calls.some(c=>c.body?.request.action==="add-charge")).toBe(true));
 expect(calls.find(c=>c.body)?.body).toEqual({commandId:expect.any(String),request:{action:"add-charge",description:"Crema",quantity:2,unitCents:125050,inventoryItemId:"cream"}});
});
it("a lost payment response keeps the identical command on retry and after reopening",async()=>{
 const mounted=mount();await screen.findByText("Masaje integral");
 await userEvent.click(screen.getByRole("button",{name:"Registrar pago"}));
 const input=await screen.findByLabelText("Importe del pago");await userEvent.clear(input);await userEvent.type(input,"5000");
 lose=true;await userEvent.click(screen.getByRole("button",{name:"Confirmar pago"}));
 expect(await screen.findByRole("alert")).toHaveTextContent("Conexión interrumpida");
 const first=calls.find(c=>c.body)?.body;expect(first.request).toMatchObject({action:"payment",amountCents:500000,method:"efectivo",shiftId:"shift"});
 mounted.unmount();mount();
 await userEvent.click(await screen.findByRole("button",{name:"Reintentar la misma acción"}));
 await waitFor(()=>expect(calls.filter(c=>c.body)).toHaveLength(2));
 expect(calls.filter(c=>c.body).map(c=>c.body)).toEqual([first,first]);
});
it("room transfer requires choosing a reservation and a reason, then confirms the visible amount",async()=>{
 mount();await screen.findByText("Masaje integral");
 await userEvent.click(screen.getByRole("button",{name:"Transferir a habitación"}));
 const button=screen.getByRole("button",{name:"Confirmar transferencia a habitación"});expect(button).toBeDisabled();
 await userEvent.selectOptions(await screen.findByLabelText("Habitación de destino"),"reservation");
 await userEvent.type(screen.getByLabelText("Motivo de transferencia"),"Pedido del cliente");
 await userEvent.click(button);
 await waitFor(()=>expect(calls.some(c=>c.body)).toBe(true));
 expect(calls.find(c=>c.body)?.body.request).toEqual({action:"room-transfer",reservationId:"reservation",expectedCents:8500000,reason:"Pedido del cliente"});
});
it("read-only roles cannot add charges, collect or transfer",async()=>{
 mount(false);await screen.findByText("Masaje integral");
 for(const name of ["Agregar cargo","Registrar pago","Transferir a habitación"])expect(screen.getByRole("button",{name})).toBeDisabled();
 expect(calls.filter(c=>c.body)).toHaveLength(0);
});
it("transferred account shows its room and zero balance and does not expose billing again",async()=>{
 view={...view,status:"closed",readOnly:true,canInvoice:false,balanceCents:0,transferred:{roomNumber:"806",reservationId:"r",amountCents:8500000}};
 mount();expect(await screen.findByText("Cuenta trasladada a Hab. 806")).toBeInTheDocument();
 expect(screen.getByRole("button",{name:"Ir a facturación"})).toBeDisabled();
 await userEvent.click(screen.getByRole("tab",{name:"Facturación"}));expect(screen.getByText(/La cuenta se factura desde Recepción/)).toBeInTheDocument();
});
it("damaged recovery identity prevents new account writes and billing",async()=>{
 sessionStorage.setItem("spa-account-command:cashier:account","invalid-json");
 mount();await screen.findByText("Masaje integral");
 expect(screen.getByRole("alert")).toHaveTextContent("No se pudo leer una acción pendiente");
 for(const name of ["Agregar cargo","Registrar pago","Transferir a habitación","Ir a facturación"])expect(screen.getByRole("button",{name})).toBeDisabled();
 expect(calls.filter(c=>c.body)).toHaveLength(0);
});

it("a room charge cancelled in Reception stays closed in SPA and displays the cancellation reason in history",async()=>{
 view={...view,status:"closed",readOnly:true,canInvoice:false,balanceCents:0,transferred:{roomNumber:"806",reservationId:"r",amountCents:8500000,cancelled:{reason:"Error de carga",createdAt:"2026-10-16T13:00:00Z"}},events:[{action:"room-charge-void",reason:"Error de carga",createdAt:"2026-10-16T13:00:00Z"}]};
 mount();expect(await screen.findByText("Cargo anulado desde Recepción · el turno se mantiene")).toBeInTheDocument();
 expect(screen.getByRole("button",{name:"Ir a facturación"})).toBeDisabled();
 await userEvent.click(screen.getByRole("tab",{name:"Facturación"}));
 expect(screen.getByText("El cargo fue anulado desde Recepción; no vuelve a generar saldo en SPA.")).toBeInTheDocument();
 await userEvent.click(screen.getByRole("tab",{name:"Historial"}));
 expect(screen.getByText(/Error de carga/)).toBeInTheDocument();
 expect(calls.filter(c=>c.body)).toHaveLength(0);
});
