import React from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import AdminBookingEnginePage from "./admin-booking-engine";
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
const room = { id: "double", name: "Doble sintética", code: "SYN", maxOccupancy: 2,
  bookingRatePlanId: "rack", bookingDiscountPercent: 10, photos: ["https://example.invalid/old.jpg"],
  amenities: [], publicDescription: "", showInBooking: true, sortOrder: 0 };
const plan = { id: "rack", roomTypeId: "double", name: "Rack", baseRate: "100000", currency: "ARS" };
let fetcher: ReturnType<typeof vi.fn>;
beforeEach(() => {
  queryClient.clear();
  queryClient.setDefaultOptions({ queries: { retry: false, gcTime: 0 }, mutations: { retry: false } });
  fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = String(input);
    if (init?.method === "PATCH") return Response.json({ success: true });
    if (path === "/api/admin/booking-engine/config") return Response.json({ roomTypes: [room], ratePlans: [plan] });
    return Response.json([]);
  });
  vi.stubGlobal("fetch", fetcher);
});
afterEach(() => { cleanup(); queryClient.clear(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
async function settings() {
  render(<QueryClientProvider client={queryClient}><AdminBookingEnginePage /></QueryClientProvider>);
  const user = userEvent.setup();
  await user.click(await screen.findByRole("tab", { name: /Configuración/ }));
  await screen.findByLabelText("Descuento online (%)");
  return user;
}
it("shows the explicit selected plan, discount and existing gallery", async () => {
  await settings();
  expect(screen.getByLabelText("Descuento online (%)")).toHaveValue(10);
  expect(screen.getByTestId("select-booking-rate-plan-double")).toHaveTextContent("Rack");
  expect(screen.getByText(/El plan tarifario original no se modifica/)).toBeInTheDocument();
  expect(screen.getByText("https://example.invalid/old.jpg")).toBeInTheDocument();
});
it("saves the derived discount and preserves existing photo links", async () => {
  const user = await settings();
  const input = screen.getByLabelText("Descuento online (%)");
  await user.clear(input);
  await user.type(input, "15");
  await user.click(screen.getByRole("button", { name: "Guardar" }));
  await waitFor(() => expect(fetcher.mock.calls.some(([, init]) => init?.method === "PATCH")).toBe(true));
  const call = fetcher.mock.calls.find(([, init]) => init?.method === "PATCH")!;
  expect(JSON.parse(String(call[1]?.body))).toMatchObject({
    ratePlanId: "rack", discountPercent: 15, photos: ["https://example.invalid/old.jpg"],
  });
});
it("blocks discounts outside the allowed range without submitting", async () => {
  const user = await settings();
  await user.clear(screen.getByLabelText("Descuento online (%)"));
  await user.type(screen.getByLabelText("Descuento online (%)"), "100");
  await user.click(screen.getByRole("button", { name: "Guardar" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("99,99");
  expect(fetcher.mock.calls.some(([, init]) => init?.method === "PATCH")).toBe(false);
});
it("uploads a converted image, previews it locally and saves it as the main photo", async () => {
  const imageData = "data:image/jpeg;base64,/9j/2Q==";
  vi.stubGlobal("createImageBitmap", vi.fn(async () => ({ width: 2000, height: 1000, close: vi.fn() })));
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({ fillRect: vi.fn(), drawImage: vi.fn() } as any);
  vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockReturnValue(imageData);
  fetcher.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
    if (String(input).endsWith("/booking-photos")) return Response.json({ url: "/api/public/booking/photos/example" }, { status: 201 });
    if (init?.method === "PATCH") return Response.json({ success: true });
    return Response.json(String(input).endsWith("/config") ? { roomTypes: [room], ratePlans: [plan] } : []);
  });
  const user = await settings();
  await user.upload(screen.getByLabelText("Seleccionar fotos JPEG, PNG o WebP"), new File(["synthetic"], "room.png", { type: "image/png" }));
  await screen.findByText("/api/public/booking/photos/example");
  expect(fetcher.mock.calls.find(([input]) => String(input).endsWith("/booking-photos"))?.[1]?.body).toBe(JSON.stringify({ imageData }));
  expect(document.querySelectorAll("img")[1]).toHaveAttribute("src", imageData);
  await user.click(screen.getByRole("button", { name: /foto 2.*principal/i }));
  await user.click(screen.getByRole("button", { name: "Guardar" }));
  await waitFor(() => expect(fetcher.mock.calls.some(([, init]) => init?.method === "PATCH")).toBe(true));
  const saved = fetcher.mock.calls.find(([, init]) => init?.method === "PATCH")!;
  expect(JSON.parse(String(saved[1]?.body)).photos).toEqual(["/api/public/booking/photos/example", "https://example.invalid/old.jpg"]);
});
it('defaults OTA prices off, keeps the own discount and saves a signed adjustment', async()=>{
 const user=await settings();
 expect(screen.getByRole('checkbox',{name:/Usar rangos tarifarios/})).not.toBeChecked();
 expect(screen.getByLabelText('Porcentaje (%)')).toBeDisabled();
 await user.click(screen.getByRole('checkbox',{name:/Usar rangos tarifarios/}));
 await user.clear(screen.getByLabelText('Porcentaje (%)'));await user.type(screen.getByLabelText('Porcentaje (%)'),'12.5');
 await user.click(screen.getByRole('button',{name:'Guardar'}));
 await waitFor(()=>expect(fetcher.mock.calls.some(([,init])=>init?.method==='PATCH')).toBe(true));
 expect(JSON.parse(String(fetcher.mock.calls.find(([,init])=>init?.method==='PATCH')![1]?.body))).toMatchObject({discountPercent:10,inheritOtaRanges:true,otaAdjustmentPercent:-12.5});
});
it('saves a markup and blocks an invalid downward percentage', async()=>{
 const user=await settings();await user.click(screen.getByRole('checkbox',{name:/Usar rangos tarifarios/}));
 await user.clear(screen.getByLabelText('Porcentaje (%)'));await user.type(screen.getByLabelText('Porcentaje (%)'),'100');
 await user.click(screen.getByRole('button',{name:'Guardar'}));
 expect(fetcher.mock.calls.some(([,init])=>init?.method==='PATCH')).toBe(false);
 await user.selectOptions(screen.getByLabelText('Ajuste del motor sobre el rango OTA'),'increase');
 await user.click(screen.getByRole('button',{name:'Guardar'}));
 await waitFor(()=>expect(fetcher.mock.calls.some(([,init])=>init?.method==='PATCH')).toBe(true));
 expect(JSON.parse(String(fetcher.mock.calls.find(([,init])=>init?.method==='PATCH')![1]?.body))).toMatchObject({otaAdjustmentPercent:100,discountPercent:10});
});
it('keeps physical room details collapsed and chooses a reference only when necessary', async()=>{
 const variant={id:'remote',name:'Premium dos personas',roomIds:['r1','r2'],roomNumbers:['201','202'],planId:null,planName:null,error:'Elegí una referencia',plans:[{id:'ota1',name:'OTA flexible',currency:'USD'},{id:'ota2',name:'OTA otra',currency:'USD'}]};
 fetcher.mockImplementation(async(input:RequestInfo|URL,init?:RequestInit)=>init?.method==='PATCH'?Response.json({success:true}):Response.json(String(input).endsWith('/config')?{roomTypes:[{...room,bookingOtaVariants:[variant]}],ratePlans:[plan]}:[]));
 const user=await settings();
 const details=screen.getByText(/Premium dos personas.*2 habitación/).closest('details');expect(details).not.toHaveAttribute('open');
 await user.selectOptions(screen.getByLabelText('Plan de referencia de OTAs Premium dos personas'),'ota2');
 await user.click(screen.getByRole('button',{name:'Guardar'}));
 await waitFor(()=>expect(fetcher.mock.calls.some(([,init])=>init?.method==='PATCH')).toBe(true));
 expect(JSON.parse(String(fetcher.mock.calls.find(([,init])=>init?.method==='PATCH')![1]?.body))).toMatchObject({otaReferencePlans:{remote:'ota2'}});
});
it('saves the motor reference without calling any OTA write endpoint or sales activation',async()=>{
 const source={configuredConnectionId:null,connectionId:'real',label:'Conexión real',sourceMode:'automatic',paused:true,roomCount:56,error:null,connections:[{id:'real',label:'Conexión real'}]};
 fetcher.mockImplementation(async(input:RequestInfo|URL,init?:RequestInit)=>init?.method==='PATCH'?Response.json({success:true}):Response.json(String(input).endsWith('/config')?{roomTypes:[room],ratePlans:[plan],otaSource:source,salesEnabled:false}:[]));
 const user=await settings();expect(screen.getByText(/sincronización pausada/)).toBeInTheDocument();
 await user.selectOptions(screen.getByLabelText('Conexión de referencia'),'real');await user.click(screen.getByRole('button',{name:'Guardar referencia'}));
 await waitFor(()=>expect(fetcher.mock.calls.some(([,init])=>init?.method==='PATCH')).toBe(true));
 const writes=fetcher.mock.calls.filter(([,init])=>init?.method==='PATCH');expect(writes).toHaveLength(1);expect(String(writes[0][0])).toBe('/api/admin/booking-engine/ota-source');expect(JSON.parse(String(writes[0][1]?.body))).toEqual({connectionId:'real'});
});
it('lets an operator replace a retired reference even when only one valid plan remains',async()=>{
 const variant={id:'remote',name:'Premium',roomIds:['r1'],roomNumbers:['201'],planId:null,planName:null,error:'El plan de referencia ya no está mapeado',plans:[{id:'current',name:'Plan vigente',currency:'USD'}]};
 fetcher.mockImplementation(async(input:RequestInfo|URL,init?:RequestInit)=>init?.method==='PATCH'?Response.json({success:true}):Response.json(String(input).endsWith('/config')?{roomTypes:[{...room,bookingOtaReferencePlans:{remote:'retired'},bookingOtaVariants:[variant]}],ratePlans:[plan]}:[]));
 const user=await settings();expect(screen.getByText(variant.error)).toBeInTheDocument();
 await user.selectOptions(screen.getByLabelText('Plan de referencia de OTAs Premium'),'current');await user.click(screen.getByRole('button',{name:'Guardar'}));
 await waitFor(()=>expect(fetcher.mock.calls.some(([,init])=>init?.method==='PATCH')).toBe(true));
 expect(JSON.parse(String(fetcher.mock.calls.find(([,init])=>init?.method==='PATCH')![1]?.body))).toMatchObject({otaReferencePlans:{remote:'current'}});
});
