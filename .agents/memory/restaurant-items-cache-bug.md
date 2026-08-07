---
name: Restaurant items cache bug
description: Items no aparecen en comanda — patrón correcto para actualizaciones optimistas inmediatas en addItemMutation.
---

# Restaurant items not appearing in comanda

## El problema raíz (recurring)
`invalidateQueries` es async sin await. Si el usuario cambia de tab "Menú → Comanda" antes que el background refetch termine, la comanda muestra el cache stale (sin el ítem). El ítem se ve después del refetch pero el usuario no lo percibe.

## La regla definitiva
La actualización del `currentOrder` y del cache de React Query debe ocurrir **ANTES** de que el servidor responda, en `handleConfirmItem`, no en `onSuccess`.

**Pattern correcto (addItemMutation):**

1. En `handleConfirmItem`: crear un temp item con `id: "temp-<timestamp>"`, actualizar `currentOrder` + cache inmediatamente, limpiar `pendingItem` ahí mismo, pasar `_tempId` y `_displayName` como campos extra en `mutate()`.

2. En `onSuccess(newItem, variables)`: usar `variables._tempId` para reemplazar el temp item con el real del servidor. Llamar `invalidateQueries` para sync eventual.

3. En `onError(e, variables)`: revertir — filtrar el temp item del `currentOrder` y del cache.

**Por qué `variables` en onSuccess/onError:** TanStack Query pasa el argumento de `mutate()` como segundo parámetro de `onSuccess`/`onError`. Los campos extra (`_tempId`, `_displayName`) no se incluyen en el body HTTP (solo los campos explícitos del body), pero sí están disponibles en los callbacks.

**Por qué NO alcanza setCurrentOrder en onSuccess:** `getUpdatedOrder()` devuelve `orders.find(o => o.id === currentOrder.id) || currentOrder`. Prefiere el cache de React Query sobre `currentOrder`. Si el cache no está actualizado aún, el ítem no aparece aunque `currentOrder` lo tenga.

## deleteItemMutation — patrón diferente pero equivalente
deleteItemMutation hace la remoción en `onSuccess` (después del servidor) pero también actualiza AMBOS (`setCurrentOrder` + `setQueryData`). Funciona porque el DELETE tiene éxito rápido y no hay tab-switch en el flujo de anulación.

## 409 — orden existente al crear pedido
Usar `queryClient.refetchQueries({ queryKey: ["/api/restaurant/orders"] }).then(() => { const allOrders = queryClient.getQueryData(...); const existing = allOrders.find(o => o.id === existingOrderId); ... })`.
NO usar `fetchQuery({ queryKey: ["/api/restaurant/orders", id] })` — ese endpoint no tiene queryFn configurada y falla.
