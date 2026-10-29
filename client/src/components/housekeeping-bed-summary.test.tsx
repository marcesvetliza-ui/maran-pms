import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import {render as baseRender,screen} from "@testing-library/react";
import {describe,it,expect} from "vitest";
import {HousekeepingBedSummary} from "./housekeeping-bed-summary";
const request:any={bedTypeName:"Twin",bedTypeNotes:"Camas separadas",bedPreparation:null,preparationCurrent:false};
function withCatalog({children}: {children: ReactNode}) {
  const client = new QueryClient({defaultOptions:{queries:{retry:false, gcTime:0, queryFn:async () => []}}});
  client.setQueryData(["/api/bed-types"], []);
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
describe("Requested and prepared beds",()=>{
 it("does not imply preparation simply because a bed was requested",()=>{
  render(<HousekeepingBedSummary request={request}/>);
  expect(screen.getByText(/Solicitado por la reserva/).parentElement).toHaveTextContent("Twin · Camas separadas");
  expect(screen.getByText("Pendiente de confirmar para esta reserva.")).toBeInTheDocument();
  expect(screen.queryByText("Preparado para esta reserva")).not.toBeInTheDocument();
 });
 it.each([true,false])("distinguishes current confirmation from stale preparation (%s)",current=>{
  render(<HousekeepingBedSummary request={{...request,preparationCurrent:current,bedPreparation:{bedConfig:"MAT",confirmedAt:"2095-02-02T15:00:00Z"}}}/>);
  expect(screen.getByText(/Preparación registrada/).parentElement).toHaveTextContent("Matrimonial");
  expect(screen.getByText(current?"Preparado para esta reserva":"Confirmación anterior: requiere revisión")).toBeInTheDocument();
 });
});

function render(ui: React.ReactElement) { return baseRender(ui, {wrapper:withCatalog}); }
