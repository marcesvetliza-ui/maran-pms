---
name: Restaurant items cache bug
description: Items no aparecen en comanda — dos bugs distintos: MAX(jsonb) en enrichment bulk + patrón optimista para addItemMutation.
---

# Restaurant items not appearing in comanda

## Bug 1 — ROOT CAUSE (server): `MAX(jsonb)` no existe en PostgreSQL

**La función `enrichRestaurantOrdersBulk` en `db-storage.ts` usaba `MAX(CASE WHEN ... THEN jsonb_build_object(...) END)` para agregar `table`, `area`, y `guest` en la query GROUP BY. PostgreSQL no tiene `max(jsonb)`, así que el enriquecimiento fallaba silenciosamente y retornaba `items: []` para TODAS las órdenes.**

La excepción era capturada en el catch de `getRestaurantOrders` con solo un `console.warn`, sin propagarse al cliente — por eso el bug era invisible (no había error 500, solo comandas vacías).

**Fix:** Castear `jsonb` a `text` para el `MAX`, luego volver a `::jsonb`:
```sql
-- MAL (lanza: function max(jsonb) does not exist):
MAX(CASE WHEN rt.id IS NOT NULL THEN jsonb_build_object(...) END) AS "table"

-- BIEN:
MAX(CASE WHEN rt.id IS NOT NULL THEN jsonb_build_object(...)::text END)::jsonb AS "table"
```

**Por qué funciona:** Cada orden tiene a lo sumo 1 mesa, 1 área, 1 huésped. `max(text)` es válido y retorna el único valor presente.

**Nota:** `enrichRestaurantOrder` (singular, para `/api/restaurant/orders/:id`) usa `CASE` directo SIN GROUP BY — no tiene este problema. Solo el bulk.

---

## Bug 2 — CLIENT: Actualización optimista en `addItemMutation`

`invalidateQueries` es async sin await. Si el usuario cambia de tab antes que el refetch termine, la comanda muestra el cache stale. Fix: actualización optimista en `handleConfirmItem` ANTES del servidor.

**Pattern correcto:**
1. En `handleConfirmItem`: crear temp item `id: "temp-<timestamp>"`, actualizar `currentOrder` + cache RQ inmediatamente, limpiar `pendingItem` ahí mismo, pasar `_tempId`/`_displayName` extra en `mutate()`.
2. En `onSuccess(newItem, variables)`: reemplazar temp con real usando `variables._tempId`.
3. En `onError(e, variables)`: revertir — filtrar el temp item de `currentOrder` y cache.

**Por qué `getUpdatedOrder()` también necesita el cache actualizado:** devuelve `orders.find(o => o.id === currentOrder.id) || currentOrder`. Prefiere el cache de RQ. Si el cache no está actualizado, el ítem no aparece en comanda aunque `currentOrder` lo tenga.

---

## Bug 3 — 409 orden existente al abrir mesa

Usar `queryClient.refetchQueries({ queryKey: ["/api/restaurant/orders"] }).then(() => { const allOrders = queryClient.getQueryData(...); ... })`.
NO usar `fetchQuery({ queryKey: ["/api/restaurant/orders", id] })` — ese endpoint no tiene queryFn configurada.
