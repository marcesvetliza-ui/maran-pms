import { beforeEach, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AddShiftStaff } from "./add-shift-staff";
import { apiRequest } from "@/lib/queryClient";

vi.mock("@/lib/queryClient", async (original) => ({
  ...(await original<typeof import("@/lib/queryClient")>()),
  apiRequest: vi.fn(),
}));

beforeEach(() => {
  vi.mocked(apiRequest).mockReset().mockResolvedValue(new Response(null, { status: 201 }));
});

it("adds extra shift staff without requiring an account", async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <AddShiftStaff date="2026-06-18" />
    </QueryClientProvider>,
  );

  fireEvent.click(screen.getByRole("button", { name: "Agregar personal" }));
  fireEvent.click(screen.getByRole("button", { name: "Personal extra" }));
  fireEvent.change(screen.getByLabelText("Nombre y apellido"), {
    target: { value: "Lucía Benítez" },
  });
  expect(screen.getByText(/No necesita una cuenta de acceso/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Agregar al turno" }));

  await waitFor(() =>
    expect(apiRequest).toHaveBeenCalledWith("POST", "/api/housekeeping/staff", {
      fullName: "Lucía Benítez",
      kind: "extra",
      date: "2026-06-18",
    }),
  );
  expect(await screen.findByRole("button", { name: "Agregar personal" })).toBeInTheDocument();
  client.clear();
});

it("keeps the selected service date if midnight passes while adding someone",async()=>{
  const client=new QueryClient({defaultOptions:{queries:{retry:false}}});
  const mount=(date:string)=><QueryClientProvider client={client}><AddShiftStaff date={date}/></QueryClientProvider>;
  const view=render(mount("2026-06-18"));
  fireEvent.click(screen.getByRole("button",{name:"Agregar personal"}));
  fireEvent.click(screen.getByRole("button",{name:"Personal extra"}));
  fireEvent.change(screen.getByLabelText("Nombre y apellido"),{target:{value:"Refuerzo sintético"}});
  view.rerender(mount("2026-06-19"));
  fireEvent.click(screen.getByRole("button",{name:"Agregar al turno"}));
  await waitFor(()=>expect(apiRequest).toHaveBeenCalledWith("POST","/api/housekeeping/staff",{
    fullName:"Refuerzo sintético",kind:"extra",date:"2026-06-18",
  }));
  client.clear();
});
