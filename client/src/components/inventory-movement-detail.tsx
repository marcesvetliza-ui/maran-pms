import { Link } from "wouter";
import { formatHotelDateTime } from "@/lib/hotelTime";

export type InventoryMovementDetailData = {
  id: string; movementType: string; quantity: string | number; previousStock: string | number; newStock: string | number;
  createdAt: string; createdBy?: string | null; reference?: string | null; notes?: string | null;
  sourceType?: string | null; sourceId?: string | null; warehouseId?: string | null; toWarehouseId?: string | null;
};
const origins: Record<string, string> = {
  production_run:"Producción",source_stock_reversal:"Reversión de stock del documento",
  manual: "Carga manual", purchase_invoice: "Comprobante de compra", restaurant_order: "Consumo de restaurant",
  internal_movement: "Movimiento interno", spa_account: "Cuenta SPA", spa_account_item: "Consumo SPA",
  movement_reversal: "Reversión por anulación", movement_correction: "Corrección de movimiento", transfer: "Transferencia", initial_stock: "Stock inicial",
};
export function InventoryMovementDetail({ movement, warehouses }: { movement: InventoryMovementDetailData; warehouses: {id: string; name: string}[] }) {
  const warehouse = (id?: string | null) => id ? warehouses.find(w => w.id === id)?.name || `Depósito ${id}` : "No registrado";
  return <div className="space-y-2 text-sm" data-testid={`movement-detail-${movement.id}`}>
    <dl className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2 lg:grid-cols-3">
      {[
        ["Fecha", formatHotelDateTime(movement.createdAt)], ["Origen", movement.sourceType ? origins[movement.sourceType] || movement.sourceType : "No registrado"],
        ["Cantidad registrada", String(movement.quantity)], ["Stock anterior → nuevo", `${movement.previousStock} → ${movement.newStock}`],
        ["Depósito", warehouse(movement.warehouseId)], ["Destino", warehouse(movement.toWarehouseId)],
        ["Operador", movement.createdBy || "No registrado"], ["Referencia", movement.reference || "No registrada"],
        ["Identificador de origen", movement.sourceId || "No registrado"],
      ].map(([label, value]) => <div key={label}><dt className="text-muted-foreground">{label}</dt><dd className="whitespace-pre-wrap break-words">{value}</dd></div>)}
    </dl>
    <div><span className="text-muted-foreground">Notas completas: </span><span className="whitespace-pre-wrap break-words">{movement.notes || "Sin notas"}</span></div>
    {movement.sourceType === "purchase_invoice" && movement.sourceId && <Link className="inline-block underline text-primary" href={`/purchase-invoices?invoiceId=${encodeURIComponent(movement.sourceId)}`}>Abrir comprobante de compra</Link>}
  </div>;
}
