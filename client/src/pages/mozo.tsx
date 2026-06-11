import { useState, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import { useAuth } from "@/App";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  ChefHat, LogOut, ArrowLeft, Plus, Minus, Send, Receipt, Clock, Users,
  UtensilsCrossed, CheckCircle2, Loader2, X
} from "lucide-react";

type View = "tables" | "detail" | "menu";

interface PendingItem {
  menuItemId: string;
  name: string;
  price: number;
  qty: number;
}

function elapsedMins(dateStr: string | null | undefined): number {
  if (!dateStr) return 0;
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / 60000);
}

function elapsedLabel(mins: number): string {
  if (mins < 60) return `${mins}m`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

function ElapsedBadge({ since, className = "" }: { since: string | null; className?: string }) {
  if (!since) return null;
  const mins = elapsedMins(since);
  const color =
    mins < 10 ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300"
    : mins < 20 ? "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300"
    : "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300";
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${color} ${className}`}>
      <Clock className="w-3 h-3" />
      {elapsedLabel(mins)}
    </span>
  );
}

export default function MozoPage() {
  const { user, logout } = useAuth();
  const { toast } = useToast();

  const [view, setView] = useState<View>("tables");
  const [selectedTableId, setSelectedTableId] = useState<string | null>(null);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [menuCategoryId, setMenuCategoryId] = useState<string | null>(null);
  const [pending, setPending] = useState<Record<string, PendingItem>>({});
  const [coversDialog, setCoversDialog] = useState<{ tableId: string; tableName: string } | null>(null);
  const [covers, setCovers] = useState(2);

  const { data: tables = [] } = useQuery<any[]>({ queryKey: ["/api/restaurant/tables"] });
  const { data: areas = [] } = useQuery<any[]>({ queryKey: ["/api/restaurant/areas"] });
  const { data: allOrders = [], refetch: refetchOrders } = useQuery<any[]>({
    queryKey: ["/api/restaurant/orders"],
    refetchInterval: 20000,
  });
  const { data: categories = [] } = useQuery<any[]>({ queryKey: ["/api/restaurant/menu/categories"] });
  const { data: menuItems = [] } = useQuery<any[]>({ queryKey: ["/api/restaurant/menu/items"] });
  const {
    data: orderDetail,
    refetch: refetchDetail,
    isFetching: detailFetching,
    isError: detailIsError,
    error: detailError,
  } = useQuery<any>({
    queryKey: [`/api/restaurant/orders/${selectedOrderId}`],
    enabled: !!selectedOrderId,
    refetchInterval: 15000,
    retry: 2,
  });

  const activeOrders = allOrders.filter((o: any) =>
    ["open", "in_progress"].includes(o.status)
  );
  const getTableOrder = useCallback(
    (tableId: string) => activeOrders.find((o: any) => o.tableId === tableId),
    [activeOrders]
  );
  const selectedTable = tables.find((t: any) => t.id === selectedTableId);

  const createOrderMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/restaurant/orders", data);
      return res.json();
    },
    onSuccess: async (order: any) => {
      // Pre-populate cache so the detail view renders immediately without waiting
      queryClient.setQueryData([`/api/restaurant/orders/${order.id}`], { ...order, items: [] });
      setSelectedOrderId(order.id);
      setCoversDialog(null);
      setView("detail");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["/api/restaurant/orders"] }),
        queryClient.invalidateQueries({ queryKey: ["/api/restaurant/tables"] }),
      ]);
    },
    onError: (e: any) => toast({ title: `Error al abrir mesa: ${e?.message ?? ""}`, variant: "destructive" }),
  });

  const sendKitchenMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/restaurant/orders/${selectedOrderId}/send-kitchen`, {}),
    onSuccess: () => {
      toast({ title: "Enviado a cocina ✓" });
      refetchDetail();
    },
    onError: (e: any) =>
      toast({ title: e?.message || "Error al enviar", variant: "destructive" }),
  });

  const pedirCuentaMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/restaurant/orders/${selectedOrderId}/pedir-cuenta`, {}),
    onSuccess: () => {
      toast({ title: "Cuenta pedida ✓" });
      refetchDetail();
      refetchOrders();
    },
    onError: () => toast({ title: "Error", variant: "destructive" }),
  });

  const addItemsMutation = useMutation({
    mutationFn: async () => {
      for (const item of Object.values(pending)) {
        await apiRequest("POST", `/api/restaurant/orders/${selectedOrderId}/items`, {
          menuItemId: item.menuItemId,
          quantity: item.qty,
        });
      }
    },
    onSuccess: () => {
      setPending({});
      setView("detail");
      refetchDetail();
      toast({ title: "Ítems agregados ✓" });
    },
    onError: () => toast({ title: "Error al agregar ítems", variant: "destructive" }),
  });

  const removeItemMutation = useMutation({
    mutationFn: (itemId: string) =>
      apiRequest("DELETE", `/api/restaurant/orders/${selectedOrderId}/items/${itemId}`, {}),
    onSuccess: () => refetchDetail(),
    onError: () => toast({ title: "Error al eliminar ítem", variant: "destructive" }),
  });

  function handleTableTap(table: any) {
    const order = getTableOrder(table.id);
    setSelectedTableId(table.id);
    if (order) {
      setSelectedOrderId(order.id);
      setView("detail");
    } else {
      setCovers(2);
      setCoversDialog({ tableId: table.id, tableName: table.tableNumber });
    }
  }

  function handleOpenTable() {
    if (!coversDialog) return;
    createOrderMutation.mutate({
      tableId: coversDialog.tableId,
      waiterName: user?.fullName || user?.username || "Mozo",
      covers,
      orderType: "dine_in",
    });
  }

  function addPending(item: any) {
    setPending((prev) => {
      const existing = prev[item.id];
      return {
        ...prev,
        [item.id]: {
          menuItemId: item.id,
          name: item.name,
          price: parseFloat(item.price),
          qty: (existing?.qty ?? 0) + 1,
        },
      };
    });
  }

  function removePending(itemId: string) {
    setPending((prev) => {
      const existing = prev[itemId];
      if (!existing || existing.qty <= 1) {
        const copy = { ...prev };
        delete copy[itemId];
        return copy;
      }
      return { ...prev, [itemId]: { ...existing, qty: existing.qty - 1 } };
    });
  }

  const totalPendingQty = Object.values(pending).reduce((s, i) => s + i.qty, 0);
  const totalPendingAmount = Object.values(pending).reduce(
    (s, i) => s + i.price * i.qty,
    0
  );

  const activeCategories = categories.filter((c: any) => c.isActive !== "false");
  const firstCatId = activeCategories[0]?.id ?? null;
  const currentCategoryId = menuCategoryId ?? firstCatId;
  const filteredItems = menuItems.filter(
    (m: any) => m.categoryId === currentCategoryId && m.isActive !== "false"
  );

  const unsentItems = orderDetail?.items?.filter(
    (i: any) => !i.sentAt && i.status === "pending"
  ) ?? [];
  const kitchenItems = orderDetail?.items?.filter(
    (i: any) => i.sentAt && i.status === "preparing"
  ) ?? [];
  const readyItems = orderDetail?.items?.filter(
    (i: any) => i.status === "ready"
  ) ?? [];
  const servedItems = orderDetail?.items?.filter(
    (i: any) => i.status === "served"
  ) ?? [];
  const isCuentaPedida = orderDetail?.cuentaPedida;

  const groupedTables = areas
    .filter((a: any) => a.isActive !== "false")
    .map((area: any) => ({
      area,
      tables: tables.filter(
        (t: any) => t.areaId === area.id && t.isActive !== "false"
      ),
    }))
    .filter((g) => g.tables.length > 0);

  return (
    <div className="min-h-screen flex flex-col bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-primary text-primary-foreground px-4 py-3 flex items-center justify-between shadow-md">
        <div className="flex items-center gap-3">
          {view === "tables" ? (
            <Link href="/restaurant">
              <button
                className="p-1.5 rounded-full hover:bg-white/20 transition-colors"
                data-testid="button-mozo-exit"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
            </Link>
          ) : (
            <button
              onClick={() => {
                if (view === "menu") { setPending({}); setView("detail"); }
                else { setView("tables"); setSelectedTableId(null); setSelectedOrderId(null); }
              }}
              className="p-1.5 rounded-full hover:bg-white/20 transition-colors"
              data-testid="button-mozo-back"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
          )}
          <div className="flex items-center gap-2">
            <UtensilsCrossed className="w-5 h-5" />
            <span className="font-semibold text-base">
              {view === "tables" ? "Mesas" : view === "menu" ? "Agregar ítems" : `Mesa ${selectedTable?.tableNumber ?? ""}`}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs opacity-80 hidden sm:block">
            {user?.fullName}
          </span>
          <button
            onClick={logout}
            className="p-1.5 rounded-full hover:bg-white/20 transition-colors"
            data-testid="button-mozo-logout"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* ── Tables View ─────────────────────────────────────────────────── */}
      {view === "tables" && (
        <div className="flex-1 overflow-y-auto p-4 space-y-6">
          {groupedTables.length === 0 && (
            <p className="text-center text-muted-foreground mt-16">No hay mesas configuradas.</p>
          )}
          {groupedTables.map(({ area, tables: areaTables }) => (
            <div key={area.id}>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
                {area.name}
              </h3>
              <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
                {areaTables.map((table: any) => {
                  const order = getTableOrder(table.id);
                  const isOccupied = !!order;
                  const isCuenta = order?.cuentaPedida;
                  const mins = order ? elapsedMins(order.openedAt) : 0;
                  return (
                    <button
                      key={table.id}
                      onClick={() => handleTableTap(table)}
                      data-testid={`button-table-${table.id}`}
                      className={`
                        relative rounded-xl p-3 flex flex-col items-center gap-1 border-2 transition-all active:scale-95 shadow-sm
                        ${isCuenta
                          ? "border-red-400 bg-red-50 dark:bg-red-950/40 text-red-800 dark:text-red-200"
                          : isOccupied
                          ? "border-amber-400 bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-200"
                          : "border-emerald-400 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200"}
                      `}
                    >
                      <span className="text-xl font-bold">{table.tableNumber}</span>
                      <span className="text-[10px] opacity-70 flex items-center gap-0.5">
                        <Users className="w-2.5 h-2.5" />
                        {table.capacity}
                      </span>
                      {isOccupied && (
                        <span className="text-[10px] font-medium mt-0.5">
                          {isCuenta ? "⚡ Cuenta" : elapsedLabel(mins)}
                        </span>
                      )}
                      {!isOccupied && (
                        <span className="text-[10px] opacity-60">Libre</span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Detail View ─────────────────────────────────────────────────── */}
      {view === "detail" && (
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Order meta */}
          <div className="px-4 py-3 bg-white dark:bg-gray-800 border-b flex items-center justify-between gap-2">
            <div className="flex items-center gap-3 text-sm text-muted-foreground">
              {orderDetail && (
                <>
                  <span className="flex items-center gap-1">
                    <Users className="w-3.5 h-3.5" />
                    {orderDetail.covers ?? 1} cubiertos
                  </span>
                  <ElapsedBadge since={orderDetail.openedAt} />
                  {isCuentaPedida && (
                    <Badge variant="destructive" className="text-xs">⚡ Cuenta pedida</Badge>
                  )}
                </>
              )}
              {detailFetching && <Loader2 className="w-3.5 h-3.5 animate-spin opacity-50" />}
            </div>
            <span className="text-sm font-semibold">
              ${parseFloat(orderDetail?.total ?? "0").toLocaleString("es-AR")}
            </span>
          </div>

          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
            {/* Sin enviar */}
            {unsentItems.length > 0 && (
              <ItemGroup label="Sin enviar" color="yellow" items={unsentItems} onRemove={(id) => removeItemMutation.mutate(id)} />
            )}
            {/* En cocina */}
            {kitchenItems.length > 0 && (
              <ItemGroup label="En cocina" color="blue" items={kitchenItems} />
            )}
            {/* Listos */}
            {readyItems.length > 0 && (
              <ItemGroup label="Listo para servir" color="green" items={readyItems} />
            )}
            {/* Servidos */}
            {servedItems.length > 0 && (
              <ItemGroup label="Servido" color="gray" items={servedItems} />
            )}
            {!orderDetail && detailIsError && (
              <div className="flex flex-col items-center justify-center h-32 gap-2">
                <p className="text-sm text-destructive font-medium">Error al cargar pedido</p>
                <p className="text-xs text-muted-foreground">{String((detailError as any)?.message ?? "")}</p>
                <Button size="sm" variant="outline" onClick={() => refetchDetail()}>Reintentar</Button>
              </div>
            )}
            {!orderDetail && !detailIsError && (
              <div className="flex items-center justify-center h-32">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            )}
            {orderDetail && (orderDetail.items ?? []).length === 0 && (
              <p className="text-center text-muted-foreground py-10 text-sm">
                Mesa abierta — agregá ítems para comenzar
              </p>
            )}
          </div>

          {/* Bottom action bar */}
          <div className="px-4 py-3 bg-white dark:bg-gray-800 border-t flex gap-2 shrink-0">
            <Button
              size="sm"
              variant="outline"
              className="flex-1 gap-1.5"
              onClick={() => { setMenuCategoryId(null); setView("menu"); }}
              data-testid="button-mozo-add-items"
            >
              <Plus className="w-4 h-4" />
              Agregar
            </Button>
            {unsentItems.length > 0 && (
              <Button
                size="sm"
                className="flex-1 gap-1.5 bg-blue-600 hover:bg-blue-700 text-white"
                onClick={() => sendKitchenMutation.mutate()}
                disabled={sendKitchenMutation.isPending}
                data-testid="button-mozo-send-kitchen"
              >
                {sendKitchenMutation.isPending
                  ? <Loader2 className="w-4 h-4 animate-spin" />
                  : <Send className="w-4 h-4" />}
                Enviar ({unsentItems.length})
              </Button>
            )}
            {!isCuentaPedida && orderDetail && (
              <Button
                size="sm"
                variant="outline"
                className="flex-1 gap-1.5 border-red-300 text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30"
                onClick={() => pedirCuentaMutation.mutate()}
                disabled={pedirCuentaMutation.isPending}
                data-testid="button-mozo-pedir-cuenta"
              >
                {pedirCuentaMutation.isPending
                  ? <Loader2 className="w-4 h-4 animate-spin" />
                  : <Receipt className="w-4 h-4" />}
                Cuenta
              </Button>
            )}
          </div>
        </div>
      )}

      {/* ── Menu View ─────────────────────────────────────────────────────── */}
      {view === "menu" && (
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Category tabs */}
          <div className="bg-white dark:bg-gray-800 border-b overflow-x-auto shrink-0">
            <div className="flex gap-1 px-3 py-2 min-w-max">
              {activeCategories.map((cat: any) => (
                <button
                  key={cat.id}
                  onClick={() => setMenuCategoryId(cat.id)}
                  data-testid={`button-menu-cat-${cat.id}`}
                  className={`px-3 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${
                    currentCategoryId === cat.id
                      ? "bg-primary text-primary-foreground"
                      : "bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-600"
                  }`}
                >
                  {cat.name}
                </button>
              ))}
            </div>
          </div>

          {/* Item list */}
          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {filteredItems.length === 0 && (
              <p className="text-center text-muted-foreground py-10 text-sm">
                Sin ítems en esta categoría
              </p>
            )}
            {filteredItems.map((item: any) => {
              const qty = pending[item.id]?.qty ?? 0;
              return (
                <div
                  key={item.id}
                  className="bg-white dark:bg-gray-800 rounded-xl p-3 flex items-center gap-3 shadow-sm border"
                >
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate">{item.name}</p>
                    {item.description && (
                      <p className="text-xs text-muted-foreground truncate">{item.description}</p>
                    )}
                    <p className="text-sm font-semibold text-primary mt-0.5">
                      ${parseFloat(item.price).toLocaleString("es-AR")}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {qty > 0 && (
                      <>
                        <button
                          onClick={() => removePending(item.id)}
                          className="w-8 h-8 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                          data-testid={`button-remove-${item.id}`}
                        >
                          <Minus className="w-4 h-4" />
                        </button>
                        <span className="w-5 text-center font-semibold text-sm">{qty}</span>
                      </>
                    )}
                    <button
                      onClick={() => addPending(item)}
                      className="w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center hover:opacity-90 transition-opacity"
                      data-testid={`button-add-${item.id}`}
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Confirm bar */}
          <div className="px-4 py-3 bg-white dark:bg-gray-800 border-t shrink-0">
            <Button
              className="w-full gap-2"
              disabled={totalPendingQty === 0 || addItemsMutation.isPending}
              onClick={() => addItemsMutation.mutate()}
              data-testid="button-mozo-confirm-items"
            >
              {addItemsMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <CheckCircle2 className="w-4 h-4" />
              )}
              {totalPendingQty > 0
                ? `Agregar ${totalPendingQty} ítem${totalPendingQty > 1 ? "s" : ""} — $${totalPendingAmount.toLocaleString("es-AR")}`
                : "Seleccioná ítems"}
            </Button>
          </div>
        </div>
      )}

      {/* ── Covers Dialog ────────────────────────────────────────────────── */}
      {coversDialog && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 px-4 pb-4 sm:pb-0">
          <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 w-full max-w-sm shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-lg">Mesa {coversDialog.tableName}</h3>
              <button onClick={() => setCoversDialog(null)} className="text-muted-foreground hover:text-foreground">
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-sm text-muted-foreground mb-4">¿Cuántos cubiertos?</p>
            <div className="flex items-center justify-center gap-6 mb-6">
              <button
                onClick={() => setCovers((c) => Math.max(1, c - 1))}
                className="w-12 h-12 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center text-xl hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                data-testid="button-covers-minus"
              >
                <Minus className="w-5 h-5" />
              </button>
              <span className="text-4xl font-bold w-12 text-center">{covers}</span>
              <button
                onClick={() => setCovers((c) => c + 1)}
                className="w-12 h-12 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xl hover:opacity-90 transition-opacity"
                data-testid="button-covers-plus"
              >
                <Plus className="w-5 h-5" />
              </button>
            </div>
            <Button
              className="w-full gap-2"
              onClick={handleOpenTable}
              disabled={createOrderMutation.isPending}
              data-testid="button-open-table"
            >
              {createOrderMutation.isPending
                ? <Loader2 className="w-4 h-4 animate-spin" />
                : <ChefHat className="w-4 h-4" />}
              Abrir Mesa
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function ItemGroup({
  label,
  color,
  items,
  onRemove,
}: {
  label: string;
  color: "yellow" | "blue" | "green" | "gray";
  items: any[];
  onRemove?: (id: string) => void;
}) {
  const colorMap = {
    yellow: "text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800",
    blue: "text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800",
    green: "text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800",
    gray: "text-muted-foreground border-border",
  };
  const bgMap = {
    yellow: "bg-amber-50 dark:bg-amber-950/20",
    blue: "bg-blue-50 dark:bg-blue-950/20",
    green: "bg-emerald-50 dark:bg-emerald-950/20",
    gray: "bg-gray-50 dark:bg-gray-800/50",
  };

  return (
    <div>
      <p className={`text-xs font-semibold uppercase tracking-wider mb-2 ${colorMap[color].split(" ")[0]} ${colorMap[color].split(" ")[1]}`}>
        {label}
      </p>
      <div className={`rounded-xl border overflow-hidden divide-y divide-border ${bgMap[color]} ${colorMap[color]}`}>
        {items.map((item: any) => (
          <div key={item.id} className="flex items-center gap-3 px-3 py-2.5">
            <span className="font-bold text-sm w-6 text-center">{item.quantity}×</span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">
                {item.menuItem?.name ?? "Ítem"}
              </p>
              {item.notes && (
                <p className="text-xs opacity-70 truncate">{item.notes}</p>
              )}
            </div>
            <span className="text-sm font-semibold shrink-0">
              ${parseFloat(item.subtotal ?? "0").toLocaleString("es-AR")}
            </span>
            {onRemove && (
              <button
                onClick={() => onRemove(item.id)}
                className="p-1 rounded hover:bg-black/10 transition-colors"
                data-testid={`button-remove-item-${item.id}`}
              >
                <X className="w-3.5 h-3.5 opacity-60" />
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
