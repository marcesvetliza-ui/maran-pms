# Corrección de unidad base y nombres de unidades de receta

Solicitud: Leche entera está en unidad y se quiere llevar a litro. El guardado de equivalencias falló con Falta equivalencia explícita de L a kg; no fue un rechazo de permisos. Los logs identifican el PUT fallido del artículo, pero no permiten identificar por sí solos la receta o subreceta que pidió esa conversión.

El editor tenía un formulario de equivalencias de la unidad guardada fuera del formulario principal, incluso al elegir otra unidad base. Ahora muestra una sola sección que sigue la unidad elegida. Durante un cambio de base no permite guardar equivalencias por separado contra la base anterior: se guardan juntas con Guardar del artículo.

Recetas permite L y unidades, mientras Inventario usa litro y unidad. La resolución reconoce esos nombres equivalentes, mL/ml y mayúsculas de kg/g; busca primero equivalencias con unidad canónica y conserva compatibilidad con una clave histórica. No convierte litros a kilos ni porciones a unidades por inferencia.

Si una receta o subreceta sigue usando dimensiones incompatibles, la cascada devuelve su nombre, ingrediente y unidades. Fuera de la corrección temporal se revierte la escritura completa. Desde la ampliación autorizada el05/11/2026, una corrección temporal puede guardar la unidad y conservar los costos anteriores de todas las recetas, con aviso persistente; ver inventory-unit-correction-window.md. No se eliminan recetas ni se corrigen sus cantidades automáticamente.

El desbloqueo temporal permanece igual, para los roles autorizados de catálogo, incluido responsable de depósito. Se conservan cantidades numéricas y stock histórico según ese modo. No se modificó directamente el artículo del hotel.

Pruebas: UI de una única sección, cambio unidad→litro atómico; equivalencias L/litro/ml y protección de masa/volumen; PostgreSQL con recetas históricas en L, costos, cantidades, stock y consumo coherentes; rollback con subreceta incompatible y error con nombre de receta.
