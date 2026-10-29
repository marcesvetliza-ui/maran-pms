import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PlanningBedConfigDialog } from "./planning-dialogs";
const catalog = [
  {id:"b1",code:"CUSTOM",name:"Tres camas individuales",isActive:true},
  {id:"b2",code:"OTHER",name:"Otra combinación",isActive:true},
  {id:"b3",code:"OLD",name:"Configuración anterior",isActive:false},
];
describe("Planning uses the configured bed catalog", () => {
  it("shows custom names and excludes other active beds when the room is restricted", async () => {
    const client = new QueryClient({defaultOptions:{queries:{retry:false,gcTime:0,queryFn:async () => catalog}}});
    client.setQueryData(["/api/bed-types"],catalog);
    render(<QueryClientProvider client={client}><PlanningBedConfigDialog
      editingBedConfig={{roomId:"room",roomNumber:"201",current:"OLD",allowed:["CUSTOM","OLD"]}}
      isPending={false} onChange={vi.fn()} onConfirm={vi.fn()} onCancel={vi.fn()}
    /></QueryClientProvider>);
    expect(screen.getByTestId("select-bedconfig")).toHaveTextContent("Configuración anterior");
    fireEvent.click(screen.getByTestId("select-bedconfig"));
    // Radix opens on pointerdown; use keyboard for a deterministic jsdom path.
    fireEvent.keyDown(screen.getByTestId("select-bedconfig"),{key:"ArrowDown"});
    expect(await screen.findByRole("option",{name:"Tres camas individuales"})).toBeInTheDocument();
    expect(screen.queryByRole("option",{name:"Otra combinación"})).not.toBeInTheDocument();
    expect(screen.getByRole("option",{name:"Configuración anterior"})).toHaveAttribute("aria-disabled","true");
    client.clear();
  });
});
