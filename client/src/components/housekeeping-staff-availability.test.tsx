import { beforeEach, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { HousekeepingStaffAvailability } from "./housekeeping-staff-availability";
import { apiRequest, queryClient } from "@/lib/queryClient";
vi.mock("@/lib/queryClient", async (original) => ({
  ...(await original<typeof import("@/lib/queryClient")>()),
  apiRequest: vi.fn(),
}));
beforeEach(() => {
  queryClient.clear();
  vi.mocked(apiRequest)
    .mockReset()
    .mockImplementation(
      async () =>
        new Response(
          JSON.stringify([
            {
              userId: "u",
              fullName: "Ana",
              status: "day_off",
              shift: null,
              startTime: null,
              endTime: null,
              notes: "",
              taskCount: 2,
            },
          ]),
        ),
    );
});
function mount() {
  render(
    <QueryClientProvider client={queryClient}>
      <HousekeepingStaffAvailability />
    </QueryClientProvider>,
  );
}
it("shows assigned work during a day off and does not silently change tasks", async () => {
  mount();
  expect(await screen.findByText(/Tiene tareas asignadas/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Completar · Ana" }));
  fireEvent.change(screen.getByLabelText("Estado"), {
    target: { value: "working" },
  });
  fireEvent.change(screen.getByLabelText("Desde"), {
    target: { value: "08:00" },
  });
  expect(
    screen.getByRole("button", { name: "Guardar disponibilidad" }),
  ).toBeDisabled();
  fireEvent.change(screen.getByLabelText("Hasta"), {
    target: { value: "16:00" },
  });
  fireEvent.click(
    screen.getByRole("button", { name: "Guardar disponibilidad" }),
  );
  await waitFor(() =>
    expect(apiRequest).toHaveBeenCalledWith(
      "PUT",
      expect.stringContaining("/availability/u/"),
      expect.objectContaining({
        status: "working",
        startTime: "08:00",
        endTime: "16:00",
      }),
    ),
  );
});
it("cancel does not save", async () => {
  mount();
  fireEvent.click(
    await screen.findByRole("button", { name: "Completar · Ana" }),
  );
  fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
  expect(vi.mocked(apiRequest).mock.calls.every(([m]) => m === "GET")).toBe(
    true,
  );
});
