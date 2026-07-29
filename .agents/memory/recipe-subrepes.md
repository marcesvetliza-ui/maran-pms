---
name: Recetas de producción intermedias (Elaboraciones)
description: Cómo funciona el sistema de sub-recetas / elaboraciones base en el módulo Recetas & Costos.
---

# Recetas de producción intermedias (Elaboraciones)

## Schema

- `recipes.menu_item_id` — ahora NULLABLE (antes NOT NULL). Null cuando `is_base=true`.
- `recipes.is_base` — boolean DEFAULT false. `true` = elaboración base standalone.
- `recipes.name` — texto para elaboraciones (no ligadas a un menu item).
- `recipes.production_unit` — unidad del batch (g, kg, ml, L, porciones, unidades).
- `recipes.production_yield` — numeric: cuánto produce este batch (ej: 1000 ml de bechamel).
- `recipe_ingredients.sub_recipe_id` — varchar nullable; apunta a `recipes.id` si el ingrediente es otra elaboración. Mutuamente excluyente con `inventory_item_id`.

## Regla de negocio

Cada ingrediente de una receta tiene exactamente uno de:
- `inventoryItemId` → materia prima directa del inventario
- `subRecipeId` → elaboración base; su costo/unidad = totalCostDeLaElaboración / productionYield

## Backend — getRecipeByMenuItem

Ahora filtra explícitamente `is_base = false` para no confundir elaboraciones sin menu_item_id con platos.

## Backend — deductStockFromOrder

Función recursiva `deductIngredients(ingredients, multiplier, depth)`:
- Si el ingrediente tiene `subRecipeId`: carga la sub-receta, calcula ratio = (grossQty / productionYield) × multiplier, y recursivamente expande sus ingredientes.
- Depth guard: `if (depth > 6) return` para prevenir recursión infinita.
- Safe por tanto para cadenas de elaboraciones (bechamel → leche, manteca, harina).

## Frontend — recetas-costos.tsx

- Tabs: "Platos del Menú" y "Elaboraciones Base".
- Elaboraciones: tabla inline + create form en la misma page, dialog separado para agregar ingredientes.
- Combo de ingredientes: toggle "Materia Prima" / "Elaboración Base".
- Al seleccionar una elaboración como ingrediente, `unitCost` se pre-llena con el costo/unidad actual (snapshot estático; se puede actualizar recreando el ingrediente).
- Costo/unidad mostrado en tabla principal de elaboraciones: `totalCost / productionYield`.

**Why:** sistema de costeo preciso para preparaciones semi-terminadas; stock se descuenta a nivel de materias primas incluso cuando el plato usa una elaboración intermedia.
