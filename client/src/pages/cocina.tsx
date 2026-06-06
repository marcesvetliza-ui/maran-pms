import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { CheckCircle2, Clock, ChefHat, Loader2, RefreshCw, Wifi } from "lucide-react";

function elapsedMins(dateStr: string | null | undefined): number {
  if (!dateStr) return 0;
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / 60000);
}

function elapsedLabel(mins: number): string {
  if (mins < 60) return `${mins} min`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

function TimeBadge({ since }: { since: string | null }) {
  const [, forceUpdate] = useState(0);
  useEffect(() => {
    const t = setInterval(() => forceUpdate((n) => n + 1), 30000);
    return () => clearInterval(t);
  }, []);

  if (!since) return null;
  const mins = elapsedMins(since);
  const cls =
    mins < 10
      ? "bg-emerald-500 text-white"
      : mins < 20
      ? "bg-amber-500 text-white"
      : "bg-red-500 text-white animate-pulse";

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-sm font-bold ${cls}`}
    >
      <Clock className="w-3.5 h-3.5" />
      {elapsedLabel(mins)}
    </span>
  );
}

const STATUS_LABEL: Record<string, string> = {
  preparing: "EN COCINA",
  ready: "LISTO",
  pending: "PENDIENTE",
};

const STATUS_COLOR: Record<string, string> = {
  preparing: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200",
  ready: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200",
  pending: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200",
};

export default function CocinaPage() {
  const { toast } = useToast();
  const [tick, setTick] = useState(0);

  // Auto-refresh every 10 seconds
  const { data: orders = [], isFetching, refetch } = useQuery<any[]>({
    queryKey: ["/api/restaurant/kitchen"],
    refetchInterval: 10000,
  });

  // Force re-render every 30s to update elapsed time badges
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 30000);
    return () => clearInterval(t);
  }, []);

  const markItemReadyMutation = useMutation({
    mutationFn: ({ orderId, itemId }: { orderId: string; itemId: string }) =>
      apiRequest("PATCH", `/api/restaurant/orders/${orderId}/items/${itemId}`, {
        status: "ready",
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/restaurant/kitchen"] });
    },
    onError: () => toast({ title: "Error al marcar listo", variant: "destructive" }),
  });

  const markAllReadyMutation = useMutation({
    mutationFn: async ({ orderId, items }: { orderId: string; items: any[] }) => {
      const preparing = items.filter((i) => i.status === "preparing");
      await Promise.all(
        preparing.map((i) =>
          apiRequest("PATCH", `/api/restaurant/orders/${orderId}/items/${i.id}`, {
            status: "ready",
          })
        )
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/restaurant/kitchen"] });
      toast({ title: "Todo marcado como listo ✓" });
    },
    onError: () => toast({ title: "Error", variant: "destructive" }),
  });

  const preparingOrders = orders.filter((o: any) =>
    o.kitchenItems?.some((i: any) => i.status === "preparing")
  );
  const readyOrders = orders.filter(
    (o: any) =>
      o.kitchenItems?.every((i: any) => i.status === "ready") &&
      o.kitchenItems?.length > 0
  );

  return (
    <div className="min-h-screen bg-gray-950 text-white flex flex-col">
      {/* Header */}
      <header className="bg-gray-900 border-b border-gray-800 px-6 py-4 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <ChefHat className="w-7 h-7 text-orange-400" />
          <div>
            <h1 className="text-xl font-bold tracking-tight">COCINA</h1>
            <p className="text-xs text-gray-400">Maran Suites & Towers</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          {orders.length > 0 && (
            <div className="flex gap-3 text-sm">
              {preparingOrders.length > 0 && (
                <span className="bg-blue-900/60 text-blue-300 px-3 py-1 rounded-full font-medium">
                  {preparingOrders.length} en cocina
                </span>
              )}
              {readyOrders.length > 0 && (
                <span className="bg-emerald-900/60 text-emerald-300 px-3 py-1 rounded-full font-medium">
                  {readyOrders.length} listos
                </span>
              )}
            </div>
          )}
          <button
            onClick={() => refetch()}
            className="p-2 rounded-full hover:bg-gray-800 transition-colors"
            data-testid="button-cocina-refresh"
          >
            <RefreshCw
              className={`w-5 h-5 text-gray-400 ${isFetching ? "animate-spin" : ""}`}
            />
          </button>
          <div className="flex items-center gap-1.5 text-xs text-emerald-400">
            <Wifi className="w-3.5 h-3.5" />
            <span>LIVE</span>
          </div>
        </div>
      </header>

      {/* Content */}
      <div className="flex-1 p-4 sm:p-6">
        {orders.length === 0 && !isFetching && (
          <div className="flex flex-col items-center justify-center h-64 gap-4 text-gray-500">
            <CheckCircle2 className="w-16 h-16 text-emerald-600" />
            <p className="text-xl font-semibold">Sin pedidos pendientes</p>
            <p className="text-sm">La cocina está al día</p>
          </div>
        )}

        {isFetching && orders.length === 0 && (
          <div className="flex items-center justify-center h-64">
            <Loader2 className="w-8 h-8 animate-spin text-gray-500" />
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {orders.map((order: any) => {
            const preparingItems = order.kitchenItems?.filter(
              (i: any) => i.status === "preparing"
            ) ?? [];
            const readyItems = order.kitchenItems?.filter(
              (i: any) => i.status === "ready"
            ) ?? [];
            const allReady = preparingItems.length === 0 && readyItems.length > 0;

            return (
              <div
                key={order.id}
                data-testid={`card-kitchen-order-${order.id}`}
                className={`rounded-2xl border overflow-hidden flex flex-col transition-all ${
                  allReady
                    ? "bg-emerald-950/40 border-emerald-700"
                    : "bg-gray-900 border-gray-800"
                }`}
              >
                {/* Card header */}
                <div className="px-4 py-3 border-b border-gray-800 flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-2xl font-black text-white">
                        Mesa {order.tableNumber}
                      </span>
                      {order.areaName && (
                        <span className="text-xs text-gray-400 bg-gray-800 px-2 py-0.5 rounded-full">
                          {order.areaName}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5">
                      Mozo: {order.waiterName ?? "—"} · #{order.orderNumber}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1.5 shrink-0">
                    <TimeBadge since={order.oldestSentAt} />
                    {order.cuentaPedida && (
                      <span className="bg-red-600 text-white text-xs font-bold px-2 py-0.5 rounded-full animate-pulse">
                        ⚡ CUENTA
                      </span>
                    )}
                  </div>
                </div>

                {/* Items */}
                <div className="flex-1 divide-y divide-gray-800">
                  {order.kitchenItems?.map((item: any) => (
                    <div
                      key={item.id}
                      className="px-4 py-3 flex items-center gap-3"
                    >
                      <span className="text-lg font-black text-white w-8 shrink-0 text-center">
                        {item.quantity}×
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-white leading-tight">
                          {item.menuItem?.name ?? "Ítem"}
                        </p>
                        {item.notes && (
                          <p className="text-xs text-amber-400 mt-0.5">
                            ⚠ {item.notes}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span
                          className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                            STATUS_COLOR[item.status] ?? ""
                          }`}
                        >
                          {STATUS_LABEL[item.status] ?? item.status}
                        </span>
                        {item.status === "preparing" && (
                          <button
                            onClick={() =>
                              markItemReadyMutation.mutate({
                                orderId: order.id,
                                itemId: item.id,
                              })
                            }
                            disabled={markItemReadyMutation.isPending}
                            className="w-8 h-8 rounded-full bg-emerald-600 hover:bg-emerald-500 flex items-center justify-center transition-colors"
                            data-testid={`button-ready-item-${item.id}`}
                            title="Marcar listo"
                          >
                            <CheckCircle2 className="w-4 h-4 text-white" />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Card footer — mark all ready */}
                {preparingItems.length > 0 && (
                  <div className="px-4 py-3 border-t border-gray-800 bg-gray-900/50">
                    <Button
                      className="w-full bg-emerald-600 hover:bg-emerald-500 text-white gap-2 font-bold"
                      onClick={() =>
                        markAllReadyMutation.mutate({
                          orderId: order.id,
                          items: order.kitchenItems,
                        })
                      }
                      disabled={markAllReadyMutation.isPending}
                      data-testid={`button-all-ready-${order.id}`}
                    >
                      {markAllReadyMutation.isPending ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <CheckCircle2 className="w-5 h-5" />
                      )}
                      TODO LISTO
                    </Button>
                  </div>
                )}

                {allReady && (
                  <div className="px-4 py-3 border-t border-emerald-800/50 text-center">
                    <p className="text-emerald-400 font-bold text-sm">
                      ✓ Listo para servir
                    </p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
