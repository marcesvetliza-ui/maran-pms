---
name: Presupuestos multi-área
description: Cómo están armados los presupuestos (quotes) por área (Grupos/Recepción vs Eventos/SPA/Restaurant), y la convención de habitaciones×noches en ítems de alojamiento.
---

## Áreas y esquema de ítems
- 5 áreas de origen: `grupos`, `recepcion` (usan tabla de ítems editable + PDF "hockey"), `eventos`, `spa`, `restaurant` (catálogo de servicios vía `quoteCatalogItems`, PDF de catálogo, sin tabla de ítems libre).
- Los ítems de línea de Grupos/Recepción viven en `presupuesto_items` (sector, descripcion, detalle, cantidad, precioUnitario, descuento, subtotal). El backend confía en el `subtotal` que manda el cliente — no lo recalcula.
- `quoteCatalogItems` + `quoteConditions` controlan el catálogo y las condiciones por defecto de cada área; configurable en `/config/presupuestos`.

## Habitaciones × noches (ítems de alojamiento)
- En hotelería, un ítem de alojamiento tiene dos cantidades independientes: cantidad de habitaciones y cantidad de noches. El campo `cantidad` en `presupuesto_items` representa las **noches** (el precio unitario ya es "precio por noche"); se agregó `cantidadHabitaciones` (default "1") como multiplicador adicional.
- Subtotal = `cantidadHabitaciones × cantidad(noches) × precioUnitario × (1-descuento%)`. Default "1" en `cantidadHabitaciones` preserva el cálculo anterior para ítems viejos y para sectores no-alojamiento (restaurant/spa/evento/otro).
- El campo "Cant. Habs" solo se muestra/aplica para ítems de sector `alojamiento` (decisión explícita del usuario) — para otros sectores queda fijo en "1" y no aparece en el formulario.
- **Por qué esta forma y no una columna de tabla nueva**: el usuario pidió explícitamente no reestructurar todo el archivo. Se insertó el campo dentro de la misma celda de "Descripción" (al lado del autocompletar de tipo de habitación) en vez de agregar una columna entera a la tabla — evita tocar el header compartido y los `colSpan` de toda la tabla de ítems.
- El PDF (server/routes/presupuestos.ts) tiene dos layouts de tabla de ítems (con descuento / sin descuento). Se agregó la columna "CANT. HABS" en ambos, angostando solo el ancho de la columna "DESCRIPCIÓN" y dejando las posiciones de las columnas siguientes (precio, subtotal) sin cambios — mismo principio de mínimo diff.
