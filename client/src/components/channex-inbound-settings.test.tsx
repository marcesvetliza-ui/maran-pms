import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
const state=vi.hoisted(()=>({allowed:true}));
vi.mock("@/App",()=>({useAuth:()=>({hasPermission:()=>state.allowed})}));
vi.mock("@tanstack/react-query",()=>({useQuery:()=>({data:{serverEnabled:false,settings:{enabled:false,has_token:false},revisions:[{revision_id:"revision",booking_id:"booking",status:"review",review_code:"UNSUPPORTED_CURRENCY",acked_at:null}]},refetch:vi.fn()}),useMutation:()=>({mutate:vi.fn(),isPending:false})}));
vi.mock("@/lib/queryClient",()=>({apiRequest:vi.fn(),queryClient:{invalidateQueries:vi.fn()}}));
import { ChannexInboundSettings } from "./channex-inbound-settings";
afterEach(()=>{cleanup();state.allowed=true;});
describe("Channex inbound operating controls",()=>{
 it("makes disabled external reception and review reasons explicit",()=>{
  render(<ChannexInboundSettings connectionId="conn"/>);
  expect(screen.getByText("Conexión entrante desactivada en el servidor.")).toBeInTheDocument();
  expect(screen.getByText(/La moneda requiere revisión/)).toBeInTheDocument();
  expect(screen.getByRole("button",{name:"Reintentar revisión"})).toBeInTheDocument();
 });
 it("does not expose configuration controls without permission",()=>{
  state.allowed=false;render(<ChannexInboundSettings connectionId="conn"/>);
  expect(screen.queryByText("Recepción de reservas de Channex")).not.toBeInTheDocument();
 });
});
