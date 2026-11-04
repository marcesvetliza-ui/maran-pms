type DestinationOrder = {
  id: string;
  status: string;
  orderNumber: string;
  orderLabel?: string | null;
  table?: { tableNumber: string };
};

export function restaurantMoveDestinations<T extends DestinationOrder>(orders: T[], sourceId?: string) {
  return orders.filter(order => order.id !== sourceId && ["open", "in_progress", "served"].includes(order.status));
}

export function RestaurantMoveDestination({ orders, sourceId, value, onChange }: {
  orders: DestinationOrder[];
  sourceId?: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const destinations = restaurantMoveDestinations(orders, sourceId);
  return (
    <div className="space-y-1.5">
      <label htmlFor="restaurant-move-destination" className="text-sm font-medium">Comanda destino</label>
      <select id="restaurant-move-destination" className="w-full h-9 text-sm border rounded-md px-2 bg-background"
        value={value} onChange={event => onChange(event.target.value)} data-testid="select-move-target-order">
        <option value="">Seleccionar comanda...</option>
        <option value="new">Nueva comanda (ticket separado)</option>
        {destinations.map(order => (
          <option key={order.id} value={order.id}>
            {order.orderLabel || order.orderNumber}{order.table ? ` — Mesa ${order.table.tableNumber}` : ""}
          </option>
        ))}
      </select>
      {destinations.length === 0 && (
        <p className="text-xs text-muted-foreground">No hay otras comandas activas. Podés crear una nueva comanda para separar estos ítems.</p>
      )}
    </div>
  );
}
