type DestinationOrder = {
  id: string;
  status: string;
  orderNumber: string;
  orderLabel?: string | null;
  tableId?: string | null;
  table?: { tableNumber: string };
};

export function restaurantMoveDestinations<T extends DestinationOrder>(orders: T[], sourceId?: string) {
  return orders.filter(order => order.id !== sourceId && ["open", "in_progress", "served"].includes(order.status));
}

type DestinationTable={id:string;tableNumber:string;areaId?:string;status:string;isActive?:string|boolean|null;area?:{name?:string}};
export function restaurantAvailableMoveTables(tables:DestinationTable[],orders:DestinationOrder[]){
  const occupied=new Set(orders.filter(o=>['open','in_progress','served'].includes(o.status)).map(o=>o.tableId).filter(Boolean));
  return tables.filter(t=>t.status==='available'&&t.isActive!==false&&t.isActive!=='false'&&!occupied.has(t.id)).sort((a,b)=>a.tableNumber.localeCompare(b.tableNumber,undefined,{numeric:true}));
}
export function RestaurantMoveDestination({ orders,tables=[],areas=[],sourceId,value,onChange,testId='select-move-target-order' }: {
  orders: DestinationOrder[];tables?:DestinationTable[];areas?:{id:string;name:string;isActive?:string|boolean}[];
  sourceId?: string;value: string;onChange: (value: string) => void;testId?:string;
}) {
  const destinations = restaurantMoveDestinations(orders, sourceId);
  const available=restaurantAvailableMoveTables(tables,orders).filter(t=>!areas.some(a=>a.id===t.areaId&&(a.isActive===false||a.isActive==='false')));
  return (
    <div className="space-y-1.5">
      <label htmlFor={testId} className="text-sm font-medium">Mesa destino</label>
      <select id={testId} className="w-full h-9 text-sm border rounded-md px-2 bg-background"
        value={value} onChange={event => onChange(event.target.value)} data-testid={testId}>
        <option value="">Seleccionar mesa...</option>
        {available.length>0&&<optgroup label="Mesas disponibles — abrir y mover">
          {available.map(table=><option key={table.id} value={`table:${table.id}`}>Mesa {table.tableNumber}{(table.area?.name||areas.find(a=>a.id===table.areaId)?.name)?` — ${table.area?.name||areas.find(a=>a.id===table.areaId)?.name}`:''} · Disponible</option>)}
        </optgroup>}
        {destinations.length>0&&<optgroup label="Comandas abiertas">
        {destinations.map(order => (
          <option key={order.id} value={order.id}>
            {order.table ? `Mesa ${order.table.tableNumber} — ` : ''}{order.orderLabel || order.orderNumber}
          </option>
        ))}</optgroup>}
      </select>
      <p className="text-xs text-muted-foreground">{available.length?'Elegí una mesa disponible para abrirla y mover los artículos en un solo paso.':'No hay mesas disponibles para abrir.'}{!destinations.length?' No hay otras comandas activas.':''}</p>
    </div>
  );
}
