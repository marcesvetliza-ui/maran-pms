import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { render as baseRender, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { RoomPopover } from "./planning-room-popover";

function withCatalog({children}: {children: ReactNode}) {
  const client = new QueryClient({defaultOptions:{queries:{retry:false, gcTime:0, queryFn:async () => []}}});
  client.setQueryData(["/api/bed-types"], []);
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
describe("Reception room status", () => {
  it("shows the current state without manual cleaning actions", () => {
    render(<RoomPopover room={{id:"r1",roomNumber:"201",status:"dirty",bedConfig:"MAT"} as any}
      open onOpenChange={vi.fn()} onEditBedConfig={vi.fn()} maintenanceAlertRoomIds={new Set()} />);
    expect(screen.getByText("La limpieza se gestiona desde Housekeeping.")).toBeInTheDocument();
    expect(screen.queryAllByTestId(/^button-status-/)).toHaveLength(0);
    expect(screen.getByRole("button", {name:"Cambiar"})).toBeInTheDocument();
  });
});

function render(ui: React.ReactElement) { return baseRender(ui, {wrapper:withCatalog}); }
