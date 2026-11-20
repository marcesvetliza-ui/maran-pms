import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export function restaurantOrderNumberForCharge(charge: {
  category?: string;
  description: string;
}) {
  return charge.category === "restaurant"
    ? (charge.description.match(/Pedido\s+(\S+)/)?.[1] ?? null)
    : null;
}

type RestaurantConsumption = {
  orderNumber: string;
  waiterName?: string | null;
  total: string | number;
  items: Array<{
    id: string | number;
    notes?: string | null;
    menuItemName?: string;
    quantity: number;
    subtotal: string | number;
  }>;
};

/** The same read-only order detail used from the reservation folio and checkout. */
export function RestaurantConsumptionDetail({
  orderNumber,
  onClose,
}: {
  orderNumber: string | null;
  onClose: () => void;
}) {
  const { data, isLoading, isError, refetch, isFetching } =
    useQuery<RestaurantConsumption>({
      queryKey: ["/api/restaurant/orders/by-number", orderNumber],
      queryFn: async ({ signal }) => {
        const res = await fetch(
          `/api/restaurant/orders/by-number/${encodeURIComponent(orderNumber!)}`,
          { credentials: "include", signal },
        );
        if (!res.ok)
          throw new Error("No se pudo consultar el detalle del pedido.");
        const detail = await res.json();
        if (
          !detail ||
          typeof detail.orderNumber !== "string" ||
          !Array.isArray(detail.items)
        )
          throw new Error("No se pudo consultar el detalle del pedido.");
        return detail;
      },
      enabled: !!orderNumber,
    });
  return (
    <Dialog
      open={!!orderNumber}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Detalle de Consumo — Restaurante</DialogTitle>
          <DialogDescription>
            Pedido #{data?.orderNumber || orderNumber}
            {data?.waiterName ? ` · Mozo: ${data.waiterName}` : ""}
          </DialogDescription>
        </DialogHeader>
        {isLoading ? (
          <div
            className="space-y-2 py-4"
            role="status"
            aria-label="Cargando detalle del pedido"
          >
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
          </div>
        ) : isError ? (
          <div className="space-y-2 py-4" role="alert">
            <p className="text-sm text-muted-foreground">
              No se pudo consultar el detalle del pedido. Podés reintentar o
              cerrar este detalle para continuar.
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={isFetching}
              onClick={() => void refetch()}
            >
              Reintentar consulta
            </Button>
          </div>
        ) : data ? (
          <div className="space-y-3">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Descripción</TableHead>
                  <TableHead className="text-center w-14">Cant.</TableHead>
                  <TableHead className="text-right w-28">Subtotal</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(data.items || []).map((item) => {
                  const customName = (item.notes || "").match(
                    /^\[(.+?)\]/,
                  )?.[1];
                  return (
                    <TableRow key={item.id}>
                      <TableCell className="text-sm">
                        {customName || item.menuItemName || "Ítem"}
                        {item.notes && !customName && (
                          <span className="block text-xs text-muted-foreground">
                            {item.notes}
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-center text-sm">
                        {item.quantity}
                      </TableCell>
                      <TableCell className="text-right text-sm font-medium">
                        $
                        {Number(item.subtotal || 0).toLocaleString("es-AR", {
                          minimumFractionDigits: 2,
                        })}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
            <div className="flex justify-between font-semibold text-sm pt-1 border-t px-1">
              <span>Total</span>
              <span>
                $
                {Number(data.total || 0).toLocaleString("es-AR", {
                  minimumFractionDigits: 2,
                })}
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              * Precio incluye IVA. El desglose se realiza al facturar al
              huésped.
            </p>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground py-4 text-center">
            No se encontró el detalle del pedido.
          </p>
        )}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Cerrar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
