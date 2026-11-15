import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { isActiveWarehouse } from "@/lib/inventory-warehouse";

type Row = { originalLineId?: number; itemId: string; warehouseId: string; quantity: string; unit: string; unitCost: string };
export type RemitoDraft = { stockItems?: Row[]; valid: boolean; subtotal: number };
const selectClass = "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm";

/** Edits the saved receipt, never the item's live balance or a newly reconstructed entry. */
export function PurchaseRemitoEditor({ snapshot, items, warehouses, onChange }: {
  snapshot: any; items: any[]; warehouses: any[]; onChange: (draft: RemitoDraft) => void;
}) {
  const original: any[] = snapshot.articleLines || [];
  const editable = original.length > 0 && original.every(line => line.warehouse_id && line.stock_quantity != null && line.stock_unit);
  const [rows, setRows] = useState<Row[]>(() => original.map(line => ({
    originalLineId: Number(line.id), itemId: line.item_id, warehouseId: line.warehouse_id || "",
    quantity: String(line.quantity), unit: line.input_unit || line.stock_unit || "", unitCost: String(line.unit_price),
  })));
  const valid = rows.length > 0 && rows.every(row => row.itemId && row.warehouseId && Number(row.quantity) > 0 &&
    Number.isFinite(Number(row.quantity)) && row.unitCost !== "" && Number.isFinite(Number(row.unitCost)) && Number(row.unitCost) >= 0);
  const subtotal = editable ? rows.reduce((sum, row) => sum + Math.round(Number(row.quantity) * Number(row.unitCost) * 100) / 100, 0)
    : original.length ? original.reduce((sum, line) => sum + Number(line.line_total || 0), 0) : Number(snapshot.monto_neto || 0);
  useEffect(() => {
    onChange({ stockItems: editable ? rows : undefined, valid: !editable || valid, subtotal });
  }, [rows, editable, valid, subtotal, onChange]);
  const update = (index: number, patch: Partial<Row>) => setRows(previous => previous.map((row, i) => i === index ? { ...row, ...patch } : row));

  if (!editable) return <div className="rounded-md border p-3 text-sm space-y-2">
    <p role="status">Este remito antiguo no tiene un detalle de stock completo. Podés corregir sus datos; para cambiar artículos o cantidades necesita conciliación. No se reconstruirán ingresos por suposición.</p>
    {original.map((line, index) => <p key={line.id ?? index}>{line.item_name}: {line.quantity} × ${line.unit_price}</p>)}
  </div>;
  return <section className="space-y-3" aria-label="Editar artículos del remito" data-testid="remito-stock-editor">
    <p className="text-sm text-muted-foreground">
      Se ajustará solo la diferencia respecto del remito original. Quitar un artículo devuelve su ingreso; cambiar el depósito corrige ambos saldos.
      Si el stock ya fue consumido y no alcanza, no se guardará ningún cambio.
      Los costos editados corrigen el remito, no reemplazan el costo actual del catálogo.
    </p>
    {rows.map((row, index) => {
      const originalLine = original.find(line => Number(line.id) === row.originalLineId);
      return <div key={index} className="space-y-3 rounded-md border p-3" data-testid={`remito-edit-row-${index}`}>
        <div className="grid gap-3 sm:grid-cols-2">
          <Label className="space-y-1">Artículo
            <select className={selectClass} aria-label={`Artículo ${index + 1}`} value={row.itemId} onChange={event => {
              const item = items.find(value => String(value.id) === event.target.value);
              update(index, { itemId: event.target.value, unit: item?.unit || "", unitCost: String(item?.costPrice ?? "0") });
            }}>
              <option value="">Elegí un artículo</option>
              {!items.some(item => String(item.id) === row.itemId) && row.itemId && <option value={row.itemId}>{originalLine?.item_name || row.itemId}</option>}
              {items.filter(item => String(item.id) === row.itemId || (item.isActive !== "false" && item.purchaseEnabled !== false && item.itemKind !== "plato")).map(item =>
                <option key={item.id} value={item.id}>{item.sku ? `${item.sku} — ` : ""}{item.name}</option>)}
            </select>
          </Label>
          <Label className="space-y-1">Depósito
            <select className={selectClass} aria-label={`Depósito ${index + 1}`} value={row.warehouseId} onChange={event => update(index, { warehouseId: event.target.value })}>
              <option value="">Elegí un depósito</option>
              {!warehouses.some(warehouse => String(warehouse.id) === row.warehouseId) && row.warehouseId && <option value={row.warehouseId}>Depósito original</option>}
              {warehouses.filter(warehouse => isActiveWarehouse(warehouse) || String(warehouse.id) === row.warehouseId).map(warehouse =>
                <option key={warehouse.id} value={warehouse.id}>{warehouse.name}{!isActiveWarehouse(warehouse) ? " (inactivo)" : ""}</option>)}
            </select>
          </Label>
          <Label className="space-y-1">Cantidad ({row.unit || "unidad"})
            <Input aria-label={`Cantidad ${index + 1}`} type="number" min="0.001" step="0.001" value={row.quantity}
              onChange={event => update(index, { quantity: event.target.value })} />
          </Label>
          <Label className="space-y-1">Costo unitario del remito
            <Input aria-label={`Costo unitario ${index + 1}`} type="number" min="0" step="0.01" value={row.unitCost}
              onChange={event => update(index, { unitCost: event.target.value })} />
          </Label>
        </div>
        {originalLine && <p className="text-xs text-muted-foreground">Original: {originalLine.item_name} — {originalLine.quantity} {originalLine.input_unit || originalLine.stock_unit}.</p>}
        <Button type="button" variant="outline" size="sm" onClick={() => setRows(previous => previous.filter((_, i) => i !== index))}>Quitar artículo {index + 1}</Button>
      </div>;
    })}
    <Button type="button" variant="outline" onClick={() => setRows(previous => [...previous, {
      itemId: "", warehouseId: "", quantity: "1", unit: "unidad", unitCost: "0",
    }])}>Agregar artículo al remito</Button>
    {!valid && <p role="alert" className="text-sm text-destructive">Completá al menos un artículo con depósito, cantidad positiva y costo válido.</p>}
  </section>;
}
