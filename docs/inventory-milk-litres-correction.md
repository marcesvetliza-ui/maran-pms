# Corrección de unidad base y nombres de unidades de receta

Solicitud: Leche entera está en unidad y se quiere llevar a litro. El guardado de equivalencias falló con Falta equivalencia explícita de L a kg; no fue un rechazo de permisos. Los logs identifican el PUT fallido del artículo, pero no permiten identificar por sí solos la receta o subreceta que pidió esa conversión.

En Maran se corrigió además el editor temporal de unidades para guardar base y equivalencias juntas. Esta rama Xenia conserva su editor y el bloqueo de unidad base; recibe la normalización de nombres y los errores con contexto de receta.

Recetas permite L y unidades, mientras Inventario usa litro y unidad. La resolución reconoce esos nombres equivalentes, mL/ml y mayúsculas de kg/g; busca primero equivalencias con unidad canónica y conserva compatibilidad con una clave histórica. No convierte litros a kilos ni porciones a unidades por inferencia.

Si una receta o subreceta sigue usando dimensiones incompatibles, la cascada devuelve su nombre, ingrediente y unidades. La escritura completa se revierte: no se dejan costos o unidades parcialmente actualizados. No se eliminan recetas ni se corrigen sus cantidades automáticamente.

No se habilita en Xenia el modo de corrección temporal de unidades de Maran. No se modifican cantidades, precios ni datos del hotel directamente.

Pruebas: equivalencias L/litro/ml y protección de masa/volumen; PostgreSQL con recetas históricas en L, equivalencias guardadas en litro, costos, cantidades, stock y consumo coherentes; rollback con subreceta incompatible y error con nombre de receta.
