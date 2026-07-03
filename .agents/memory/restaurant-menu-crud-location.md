---
name: Restaurant menu/category CRUD location
description: Where plato and category management live, and how the "Agregar Plato" wizard behaves — check here before touching menu item or category CRUD in restaurant.tsx or recetas-costos.tsx.
---

Menu item (plato) and category CRUD were intentionally removed from `restaurant.tsx` (no "Menu" tab there anymore) and now live exclusively in `recetas-costos.tsx`, reached via "Categorías" and "Agregar Plato" buttons in that page's header.

**Why:** Mozos (waitstaff) use the Restaurant page for order-taking only and should not be able to edit the menu/prices from there. `restaurant.tsx` still keeps the `menuCategories`/`menuItems` queries for order-taking (category filters, item selection) — only the CRUD (forms, mutations, dialogs) was moved.

**How to apply:** When creating a new plato via "Agregar Plato", it's a 2-step wizard: step 1 is the basic-fields dialog (reused `menuItemFormSchema`), and on successful create it auto-opens the existing recipe dialog (`openRecipeDialog`) as step 2 to load ingredients/costs. Editing an existing plato's basic fields stays single-step (no auto-transition to recipe). Don't reintroduce plato/category CRUD into `restaurant.tsx`.
