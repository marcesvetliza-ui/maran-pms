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
