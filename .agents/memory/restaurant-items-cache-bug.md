---
name: Restaurant items cache bug
description: getUpdatedOrder() reads from React Query cache, not currentOrder — optimistic updates to currentOrder are invisible to the comanda UI.
---

# Restaurant items not appearing in comanda

## The rule
Any mutation that modifies order items must update BOTH `currentOrder` (via `setCurrentOrder`) AND the orders React Query cache (via `queryClient.setQueryData(["/api/restaurant/orders"], ...)`).

**Why:** `getUpdatedOrder()` in restaurant.tsx returns `orders.find(o => o.id === currentOrder.id) || currentOrder`. It prefers the React Query cache over the `currentOrder` state. Optimistic updates to `currentOrder` are bypassed by `getUpdatedOrder()` until the cache is also updated.

## How to apply
Every `onSuccess` handler that calls `setCurrentOrder` to add/remove items must also call:
```javascript
queryClient.setQueryData<any[]>(["/api/restaurant/orders"], (old) => {
  if (!Array.isArray(old)) return old;
  return old.map((o: any) =>
    o.id === orderId ? { ...o, items: <updated items array> } : o
  );
});
```
Then call `queryClient.invalidateQueries` for the background server sync.

## Mutations fixed
- `addItemMutation.onSuccess`: setQueryData adds the new item to the cache
- `removeItemMutation.onSuccess` (deleteItemMutation): setQueryData filters out the deleted item
