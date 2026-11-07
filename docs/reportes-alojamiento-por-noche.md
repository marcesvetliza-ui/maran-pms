# Reportes de alojamiento por noche

## Alcance

Maran: Ejecutivo, reportes de ocupación, ingresos por tipo y por canal, KPIs gerenciales, análisis de ocupación, componente alojamiento de ingresos/resultados y comparativo mensual. Se usa `server/reports/lodging.ts`. No se modifica una reserva, cobro, cargo, factura ni tarifa al consultar.

Revenue Management conserva su motor de pronóstico, pace y grupos. No se declara unificada esa pantalla con la nueva producción realizada. Tampoco cambia la disponibilidad comercial de Channex ni las reglas para vender.

## Criterio

- Rango inclusivo desde/hasta. Cada estadía ocupa ingreso <= noche < salida; se incluye la última noche del mes.
- Realizado: noches hasta hoy argentino con estado checked_in/checked_out. Compromisos desde hoy sin realizar y noches futuras de estados activos se informan por separado. Confirmadas antiguas sin check-in, canceladas y no-show no generan producción realizada.
- Para nightly_v1 se valida el calendario completo, importes y reconciliación con total_room_amount. Se toma rateCents menos discountCents. Un detalle inválido no cae silenciosamente en otra fórmula.
- Para legacy se distribuye el total guardado de toda la estadía en centavos, repartiendo el resto desde la primera noche. El campo nights ni una tarifa plana posterior reemplazan la duración entre fechas. Se marca la distribución como estimada, no como precio histórico registrado. Total ausente no equivale a cero. Una cortesía legacy necesita motivo; una tarifa nocturna explícita válida de cero cuenta como tal.
- Ingresos parciales si faltan precios. El ADR usa las noches con precio conocido; se informa cuántas faltan. RevPAR es ingreso conocido / habitaciones-noche de capacidad; no se presenta como completo si faltan tarifas.
- Capacidad por día: habitaciones del inventario operativo actual (activas, no virtuales, no REUB), menos bloqueos fechados con salida exclusiva. Se deduplican los bloqueos. Es una estimación histórica basada en la configuración actual, no una reconstrucción de altas/bajas de habitaciones.
- Categoría según la habitación física asignada en el inventario actual, para que numerador y denominador usen el mismo universo. Los cambios históricos de categoría no están reconstruidos.
- Cupos o reservas sin habitación asignada no son ocupación física. Las reservas sin asignar, las superposiciones y la ocupación de habitaciones bloqueadas se advierten. No se ocultan conflictos limitando artificialmente la ocupación a 100%.
- El comparativo anual pondera la ocupación por capacidad-noches, no promedia porcentajes mensuales con igual peso. La comparación interanual de Ejecutivo usa las mismas fechas del año anterior y ajusta 29/02 a 28/02 cuando corresponde.

## Trazabilidad y presentación

La API protegida `GET /api/reports/lodging-detail?from=AAAA-MM-DD&to=AAAA-MM-DD` permite contrastar resumen, detalle diario y reserva/noche. Usa el permiso existente de KPIs. No contiene nombres de huéspedes ni datos de pago. Las consultas de origen se hacen en una transacción de solo lectura y aislamiento repeatable read.

Las pantallas muestran el criterio y advertencias de distribución estimada, precios faltantes y conflictos. Ejecutivo distingue ocupación del período del estado actual de habitaciones. Los reportes de ocupación separan noches por venir de las realizadas; la columna sin ocupación realizada no representa disponibilidad comercial.

## Límites y comprobación pendiente

Las cifras históricas pueden cambiar si se modifica posteriormente la reserva o el inventario actual: no se crean cierres inmutables en este cambio. Se conservan las reglas previas de extras, cuentas por área, compras/NC, comisiones estimadas y otros componentes del resultado. Las advertencias de alojamiento no certifican los demás componentes.

Falta conciliar con Administración un mes cerrado y el corte actual: cruzar una estadía entre meses, comparar tarifas/descuentos guardados por noche, cortesías, faltantes, canceladas y bloqueos; sumar el detalle diario y compararlo con KPIs, Ejecutivo y tipos/canales. Las pruebas sintéticas no cuantifican diferencias reales del hotel.
