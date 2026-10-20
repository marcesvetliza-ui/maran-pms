import { useQuery } from '@tanstack/react-query';
import { INVENTORY_UNITS, inventoryUnitFactor } from '@shared/inventoryUnits';

type Conversion = { fromUnit: string; factor: string };
type Props = {
  itemId: string; stockUnit: string; stockCost: number;
  unit: string; quantity: string;
  onChange: (value: { unit: string; quantity: string; cost: string }) => void;
};

export function ingredientUnits(stockUnit: string, conversions: Conversion[]) {
  return INVENTORY_UNITS.flatMap(unit => {
    try {
      const configured = conversions.find(row => row.fromUnit === unit);
      return [{ unit, factor: inventoryUnitFactor(unit, stockUnit, configured ? Number(configured.factor) : undefined) }];
    } catch { return []; }
  });
}

export function RecipeIngredientUnit({ itemId, stockUnit, stockCost, unit, quantity, onChange }: Props) {
  const { data = [], isLoading, isError } = useQuery<Conversion[]>({
    queryKey: [`/api/inventory/items/${itemId}/unit-conversions`],
  });
  const options = ingredientUnits(stockUnit, isError ? [] : data);
  return <div className="space-y-1">
    <select className="h-9 px-2 border rounded-md bg-background text-sm" aria-label="Unidad del ingrediente"
      value={unit} onChange={event => {
        const next = options.find(option => option.unit === event.target.value);
        const previous = options.find(option => option.unit === unit);
        if (!next || !previous) return;
        const converted = quantity === '' ? '' : String(Number((Number(quantity) * previous.factor / next.factor).toFixed(9)));
        onChange({ unit: next.unit, quantity: converted, cost: (stockCost * next.factor).toFixed(4) });
      }}>
      {options.map(option => <option key={option.unit} value={option.unit}>{option.unit}</option>)}
    </select>
    {isLoading && <p className="text-xs text-muted-foreground">Cargando equivalencias…</p>}
    {isError && <p className="text-xs text-destructive">No se pudieron cargar los envases. Las conversiones estándar siguen disponibles.</p>}
    <p className="text-xs text-muted-foreground">Costo por {unit}. Stock en {stockUnit}.</p>
  </div>;
}
