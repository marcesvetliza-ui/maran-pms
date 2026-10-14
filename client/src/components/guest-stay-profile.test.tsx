import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { emptyStayProfile } from "@shared/guestStayProfile";
import { GuestStayProfileEditor, StaySelectionEditor, SelectedFamilyCompanions, useStayDraft, ReservationStayDetails, ReservationGuestCount } from "./guest-stay-profile";
import { GuestFormDialog } from "@/pages/guests";

const mocks = vi.hoisted(() => ({ api: vi.fn(), toast: vi.fn() }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: mocks.toast }) }));
vi.mock("@/lib/queryClient", async original => ({ ...await original<any>(), apiRequest: mocks.api }));
const profile = { ...emptyStayProfile(), vehicles: [{ id:"car",plate:"ABC123",brand:"Toyota",model:"Corolla",color:"Blanco" }], family:[{ id:"child",firstName:"Ana",lastName:"Prueba",relationship:"Hija",documentType:"DNI",documentNumber:"123",dateOfBirth:"2015-01-01",nationality:"Argentina" }], pets:[{id:"pet",name:"Lola",species:"Perro",notes:""}] };
function wrapper({ children }: any) { return <QueryClientProvider client={new QueryClient({ defaultOptions:{ queries:{retry:false},mutations:{retry:false} } })}>{children}</QueryClientProvider>; }
beforeEach(() => {
  mocks.api.mockReset(); mocks.toast.mockReset();
  vi.stubGlobal("fetch",vi.fn(async () => ({ok:true,json:async()=>({id:"guest",tipoPersona:"fisica",stayProfile:profile})})));
});
afterEach(() => { cleanup();vi.unstubAllGlobals(); });
function Harness({ guestId = "guest" }: { guestId?: string }) {
  const draft = useStayDraft(guestId);
  return <><SelectedFamilyCompanions value={draft.value} onChange={draft.onChange}/><StaySelectionEditor guestId={guestId} value={draft.value} onChange={draft.onChange}/><output data-testid="selection">{JSON.stringify(draft.request)}</output></>;
}
it("muestra datos habituales sin marcar y conserva la selección al cerrar un desplegable",async()=>{
  render(<Harness/>,{wrapper});
  await screen.findByText(/ABC123/);
  const choices=screen.getAllByRole("checkbox",{hidden:true});expect(choices.every(row=>!(row as HTMLInputElement).checked)).toBe(true);
  fireEvent.click(screen.getByText(/ABC123/));
  expect(JSON.parse(screen.getByTestId("selection").textContent!).selection.vehicles).toHaveLength(1);
  fireEvent.click(screen.getByText("Vehículos"));fireEvent.click(screen.getByText("Vehículos"));
  expect(JSON.parse(screen.getByTestId("selection").textContent!).selection.vehicles).toHaveLength(1);
});
it("cambiar de titular no arrastra selecciones",async()=>{
  const result=render(<Harness/>,{wrapper});await screen.findByText(/ABC123/);fireEvent.click(screen.getByText(/ABC123/));
  result.rerender(<Harness guestId="other"/>);
  expect(JSON.parse(screen.getByTestId("selection").textContent!).selection).toEqual(emptyStayProfile());
  result.rerender(<Harness guestId="guest"/>);
  expect(JSON.parse(screen.getByTestId("selection").textContent!).selection).toEqual(emptyStayProfile());
});
it("seleccionar un familiar lo incluye una vez y quitarlo desmarca la misma selección",async()=>{
  render(<Harness/>,{wrapper});await screen.findByText(/ABC123/);
  const family=screen.getByText(/Ana Prueba.*Hija/).closest("label")!.querySelector("input")!;
  fireEvent.click(family);expect(JSON.parse(screen.getByTestId("selection").textContent!).selection.family).toHaveLength(1);
  expect(screen.getAllByText("Quitar de esta reserva")).toHaveLength(1);
  fireEvent.click(screen.getByText("Quitar de esta reserva"));expect(family.checked).toBe(false);
  expect(JSON.parse(screen.getByTestId("selection").textContent!).selection.family).toHaveLength(0);
});
it("un dato ocasional solo se recuerda si se elige esa opción",async()=>{
  render(<Harness/>,{wrapper});await screen.findByText(/ABC123/);
  fireEvent.click(screen.getByText("Agregar mascota ocasional"));fireEvent.change(screen.getByLabelText("Nombre"),{target:{value:"Milo"}});fireEvent.change(screen.getByLabelText("Especie"),{target:{value:"Gato"}});
  fireEvent.click(screen.getByText("Incluir en esta reserva"));
  const first=JSON.parse(screen.getByTestId("selection").textContent!);expect(first.selection.pets[0].name).toBe("Milo");expect(first.remember.pets).toHaveLength(0);
  fireEvent.click(screen.getByText("Agregar mascota ocasional"));fireEvent.change(screen.getByLabelText("Nombre"),{target:{value:"Otra"}});fireEvent.change(screen.getByLabelText("Especie"),{target:{value:"Perro"}});
  fireEvent.click(screen.getByLabelText("Guardar también en la ficha del huésped para próximas visitas"));fireEvent.click(screen.getByText("Incluir en esta reserva"));
  expect(JSON.parse(screen.getByTestId("selection").textContent!).remember.pets[0].name).toBe("Otra");
});
it("no incluye un familiar incompleto y permite corregirlo",async()=>{
  render(<Harness/>,{wrapper});await screen.findByText(/ABC123/);fireEvent.click(screen.getByText("Agregar familiar ocasional"));fireEvent.click(screen.getByText("Incluir en esta reserva"));
  expect(screen.getByRole("alert").textContent).toContain("obligatorios");expect(JSON.parse(screen.getByTestId("selection").textContent!).selection.family).toHaveLength(0);
});
it("al abrir una reserva conserva sus selecciones y muestra un conflicto sin perder cambios",async()=>{
  mocks.api.mockResolvedValueOnce({json:async()=>({...profile,guestId:"guest",version:2})}).mockRejectedValueOnce(new Error('409: {"error":"Otra persona actualizó estos datos"}'));
  render(<ReservationStayDetails reservationId="r" guestId="guest"/>,{wrapper});await screen.findByText(/ABC123/);
  const car=screen.getByText(/ABC123/).closest("label")!.querySelector("input")!;expect(car.checked).toBe(true);fireEvent.click(car);fireEvent.click(screen.getByText("Guardar datos de la estadía"));
  await waitFor(()=>expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({description:"Otra persona actualizó estos datos"})));
  expect(screen.getByText("Guardar datos de la estadía")).toBeTruthy();expect(car.checked).toBe(false);
  expect(mocks.api.mock.calls[1][2]).toMatchObject({version:2,selection:{vehicles:[]}});
});
it("actualiza la cantidad visible de la reserva inmediatamente después de guardar un familiar",async()=>{
  let details={...emptyStayProfile(),guestId:"guest",version:0,numberOfGuests:1,companionCount:0};
  mocks.api.mockImplementation(async(method:string,_path:string,body:any)=>{
    if(method==="PUT")details={...body.selection,guestId:"guest",version:1,numberOfGuests:2,companionCount:1};
    return {json:async()=>details};
  });
  render(<><ReservationGuestCount reservationId="r" guestId="guest" fallback={1}/><ReservationStayDetails reservationId="r" guestId="guest"/></>,{wrapper});
  await screen.findByText(/Ana Prueba.*Hija/);expect(screen.getByText("1 persona(s)")).toBeTruthy();
  fireEvent.click(screen.getByText(/Ana Prueba.*Hija/));fireEvent.click(screen.getByText("Guardar datos de la estadía"));
  await screen.findByText("2 persona(s)");
});
it("permite corregir una reserva anterior sin volver a seleccionar familiares",async()=>{
  let details={...profile,guestId:"guest",version:1,numberOfGuests:1,companionCount:1};
  mocks.api.mockImplementation(async(method:string)=>{
    if(method==="PUT")details={...details,version:2,numberOfGuests:2};
    return {json:async()=>details};
  });
  render(<><ReservationGuestCount reservationId="r" guestId="guest" fallback={1}/><ReservationStayDetails reservationId="r" guestId="guest"/></>,{wrapper});
  fireEvent.click(await screen.findByText("Actualizar cantidad a 2 huéspedes"));
  await screen.findByText("2 persona(s)");
  expect(mocks.api.mock.calls.find(([method])=>method==="PUT")?.[2]).toMatchObject({version:1,selection:profile});
});
it("editar un perfil conserva el vehículo anterior, permite agregar otro y no borra al cerrar",()=>{
  function Editor(){const [value,setValue]=useState(profile);return <><GuestStayProfileEditor value={value} onChange={setValue}/><output>{JSON.stringify(value)}</output></>;}
  render(<Editor/>);fireEvent.click(screen.getByText("Agregar vehículo"));expect(screen.getAllByLabelText("Patente")).toHaveLength(2);expect((screen.getAllByLabelText("Patente")[0] as HTMLInputElement).value).toBe("ABC123");
  fireEvent.click(screen.getByText("Vehículos"));expect(screen.getAllByLabelText("Patente")).toHaveLength(2);
});
it("el formulario muestra nacimiento y guarda datos habituales sin generar clientes familiares",async()=>{
  const saveGuest=vi.fn(async(data:any)=>({ ...data,id:"new" }));
  render(<GuestFormDialog open onOpenChange={vi.fn()} onSuccess={vi.fn()} saveGuest={saveGuest} guest={{id:"guest",firstName:"Titular",lastName:"Prueba",stayProfile:profile} as any}/>,{wrapper});
  expect(screen.getByTestId("input-fecha-nacimiento")).toBeTruthy();fireEvent.change(screen.getByTestId("input-fecha-nacimiento"),{target:{value:"1980-02-03"}});fireEvent.click(screen.getByTestId("button-submit-guest"));
  await waitFor(()=>expect(saveGuest).toHaveBeenCalledWith(expect.objectContaining({fechaNacimiento:"1980-02-03",stayProfile:profile})));
  expect(mocks.api).not.toHaveBeenCalled();
});
