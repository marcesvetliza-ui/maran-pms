import {fireEvent,render,screen,waitFor} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {QueryClientProvider} from "@tanstack/react-query";
import {afterEach,beforeEach,expect,it,vi} from "vitest";
import {queryClient} from "@/lib/queryClient";
const access=vi.hoisted(()=>({report:true}));
vi.mock("@/App",()=>({useAuth:()=>({
  user:{role:"admin"},
  hasPermission:(key:string)=>key==="sidebar:/housekeeping-daily-report"?access.report:true,
})}));
vi.mock("@/hooks/use-bed-catalog",()=>({useBedCatalog:()=>({label:()=>"",options:[],forRoom:()=>[]})}));
vi.mock("@/components/housekeeping-preparation",()=>({HousekeepingPreparationControl:()=>null}));
vi.mock("@/components/housekeeping-task-manager",()=>({HousekeepingTaskManager:()=>null}));
import Housekeeping from "./housekeeping";

beforeEach(()=>{
  access.report=true;
  queryClient.clear();
  vi.stubGlobal("fetch",vi.fn(async(input:RequestInfo|URL)=>{
    const url=String(input);
    let data:unknown=[];
    if(url==="/api/rooms")data=[{id:"r201",roomNumber:"201",status:"dirty",floor:2,roomType:{code:"DBL"}}];
    if(url.startsWith("/api/housekeeping/daily-report?"))data={
      date:url.split("date=")[1],checkIns:[],checkOuts:[],
    };
    return new Response(JSON.stringify(data),{headers:{"Content-Type":"application/json"}});
  }));
});
afterEach(()=>{queryClient.clear();vi.unstubAllGlobals();});
it("opens the same daily report inside Housekeeping only when selected",async()=>{
  const user=userEvent.setup();
  render(<QueryClientProvider client={queryClient}><Housekeeping/></QueryClientProvider>);
  const tab=await screen.findByRole("tab",{name:"Planilla Diaria"});
  expect(screen.queryByRole("heading",{name:"Planilla diaria Housekeeping"})).not.toBeInTheDocument();
  expect(vi.mocked(fetch).mock.calls.some(([url])=>String(url).includes("/daily-report"))).toBe(false);
  await user.click(tab);
  expect(await screen.findByRole("heading",{name:"Planilla diaria Housekeeping"})).toBeInTheDocument();
  expect(await screen.findByText("Sin salidas para esta fecha.")).toBeInTheDocument();
  expect(screen.getByRole("button",{name:"Imprimir"})).toBeEnabled();
  const date=screen.getByLabelText("Fecha");
  // Changing dates uses the original report's endpoint, not a duplicate implementation.
  fireEvent.change(date,{target:{value:"2026-11-14"}});
  await waitFor(()=>expect(vi.mocked(fetch).mock.calls.some(([url])=>String(url).endsWith("daily-report?date=2026-11-14"))).toBe(true));
  await user.click(screen.getByRole("tab",{name:"Habitaciones · Hoy"}));
  expect(screen.queryByRole("heading",{name:"Planilla diaria Housekeeping"})).not.toBeInTheDocument();
});
it("does not expose the report tab without the existing report permission",async()=>{
  access.report=false;
  render(<QueryClientProvider client={queryClient}><Housekeeping/></QueryClientProvider>);
  await screen.findByRole("tab",{name:"Habitaciones · Hoy"});
  expect(screen.queryByRole("tab",{name:"Planilla Diaria"})).not.toBeInTheDocument();
  expect(vi.mocked(fetch).mock.calls.some(([url])=>String(url).includes("/daily-report"))).toBe(false);
});
