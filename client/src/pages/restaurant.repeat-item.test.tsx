import { QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { queryClient } from "@/lib/queryClient";
const { toast } = vi.hoisted(() => ({ toast: vi.fn() }));
vi.mock("@/App", () => ({ useAuth: () => ({ user: { role: "manager" }, hasPermission: () => true, selectedPosNumero: 1, selectedPosNombre: "Restaurant" }) }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast }) }));
import RestaurantPage from "./restaurant";

let order: any, requests: { path: string; body: any }[], failRepeat: boolean;
const menuItem = { id: "dish", categoryId: "food", name: "Milanesa", price: "1500.00", isActive: "true", isAvailable: "true" };
beforeEach(() => {
  queryClient.clear(); requests = []; failRepeat = false; toast.mockClear();
  order = { id: "order", tableId: "table", areaId: "area", orderNumber: "Prueba", status: "in_progress", activeCourse: 1, covers: 4, total: "6000.00", openedAt: new Date().toISOString(), items: [
    { id: "z-old", menuItemId: "dish", quantity: 1, unitPrice: "1500.00", subtotal: "1500.00", course: 3, status: "waiting_course", menuItem },
    { id: "a-last", menuItemId: "dish", quantity: 3, unitPrice: "1500.00", subtotal: "4500.00", course: 1, status: "pending", notes: "sin sal", menuItem },
  ] };
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = String(input);
    const json = (data: any, status = 200) => new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
    if (init?.method === "POST" && path.endsWith("/repeat")) {
      requests.push({ path, body: JSON.parse(String(init.body)) });
      if (failRepeat) return json({ error: "El plato está inactivo o no disponible" }, 409);
      const source = order.items.find((item: any) => path.includes(`/items/${item.id}/`));
      const item = { ...source, id: `repeat-${requests.length}`, orderId: order.id, quantity: 1, subtotal: source.unitPrice, status: "pending", paid: false, sentAt: null };
      order = { ...order, items: [...order.items, item], total: (Number(order.total) + Number(item.subtotal)).toFixed(2) };
      return json(item, 201);
    }
    if (init?.method === "POST" && path.endsWith("/items")) {
      const body = JSON.parse(String(init.body)); requests.push({ path, body });
      const item = { ...body, id: "new-dish", orderId: order.id, unitPrice: "1500.00", subtotal: "1500.00", status: "pending", menuItem };
      order = { ...order, items: [...order.items, item] }; return json(item, 201);
    }
    if (path === "/api/restaurant/orders") return json([order]);
    if (path === "/api/restaurant/tables") return json([{ id: "table", tableNumber: "1", areaId: "area", status: "occupied", positionX: 0, positionY: 0, capacity: 4, isActive: "true" }]);
    if (path === "/api/restaurant/areas") return json([{ id: "area", name: "Salón", areaType: "indoor", hasTables: "true", isActive: "true" }]);
    if (path === "/api/restaurant/menu/categories") return json([{ id: "food", name: "Platos", isActive: "true" }]);
    if (path === "/api/restaurant/menu/items") return json([menuItem]);
    return json([]);
  }));
});
afterEach(() => { cleanup(); queryClient.clear(); vi.unstubAllGlobals(); });
async function openOrder() {
  const user = userEvent.setup();
  render(<QueryClientProvider client={queryClient}><RestaurantPage /></QueryClientProvider>);
  await user.click(await screen.findByTestId("table-1"));
  await screen.findByRole("heading", { name: "Comanda" });
  return user;
}
it("shows a single repeat button on the last added row across course groups and appends separate units", async () => {
  const user = await openOrder();
  expect(screen.getAllByRole("button", { name: "Repetir ítem" })).toHaveLength(1);
  expect(screen.queryByTestId("button-repeat-item-z-old")).not.toBeInTheDocument();
  await user.click(screen.getByTestId("button-repeat-item-a-last"));
  await user.click(await screen.findByTestId("button-repeat-item-repeat-1"));
  await screen.findByTestId("button-repeat-item-repeat-2");
  expect(requests.map(r => r.path)).toEqual([
    "/api/restaurant/orders/order/items/a-last/repeat", "/api/restaurant/orders/order/items/repeat-1/repeat",
  ]);
  expect(order.items.map((i: any) => i.quantity)).toEqual([1, 3, 1, 1]);
  expect(order.items.slice(2).every((i: any) => i.notes === "sin sal")).toBe(true);
  expect(screen.getAllByRole("button", { name: "Repetir ítem" })).toHaveLength(1);
});
it("keeps the shortcut while choosing products and moves it to the next product added normally", async () => {
  const user = await openOrder();
  await user.click(screen.getByTestId("button-comanda-add-more-footer"));
  const last = screen.getByTestId("last-added-item");
  expect(last).toHaveTextContent("Milanesa");
  await user.click(within(last).getByRole("button", { name: "Repetir ítem" }));
  await screen.findByTestId("button-repeat-item-repeat-1");
  await user.type(screen.getByTestId("input-menu-search"), "Milanesa");
  await user.click(screen.getByTestId("select-item-dish"));
  await user.click(screen.getByTestId("button-confirm-item"));
  await screen.findByTestId("button-repeat-item-new-dish");
  expect(screen.getAllByRole("button", { name: "Repetir ítem" })).toHaveLength(1);
});
it("does not add a phantom row or change quantities when the repeat is rejected", async () => {
  failRepeat = true;
  const user = await openOrder();
  await user.click(screen.getByTestId("button-repeat-item-a-last"));
  await waitFor(() => expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: "No se pudo repetir el ítem", variant: "destructive" })));
  expect(order.items).toHaveLength(2);
  expect(screen.getByTestId("button-repeat-item-a-last")).toBeEnabled();
});
