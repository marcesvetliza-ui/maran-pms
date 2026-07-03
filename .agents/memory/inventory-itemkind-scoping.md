---
name: Inventory itemKind classification scoping
description: How itemKind (materia_prima/venta_directa/plato) interacts with category "area" when filtering ingredient pickers and sale selectors
---

`inventory_items.itemKind` (`materia_prima` | `venta_directa` | `plato`) is orthogonal to `item_categories.area` (`general` | `restaurant` | `spa` | ...). Do not assume raw materials live in the `restaurant` area — real ingredient stock (e.g. coffee, sugar) is typically filed under general categories like "Alimentos"/"Bebidas", not an area-specific one.

**Why:** An early version of the recetas-costos.tsx ingredient picker filtered `?area=restaurant&itemKind=materia_prima`, which returned zero results even after correctly tagging real ingredients as `materia_prima`, because those items' categories had `area=general`.

**How to apply:** Ingredient/ingredient-search pickers that use `itemKind=materia_prima` should NOT also constrain by `area` unless there's a specific reason — raw materials can be sourced from any category. Area-scoping is naturally handled elsewhere (e.g. a module's own consumption picker already filters by its own area, like spa.tsx doing `?area=spa`), so `plato`-kind items (dish mirrors, always `area=restaurant`) are automatically excluded from non-restaurant sale/consumption pickers without needing an extra itemKind check.
