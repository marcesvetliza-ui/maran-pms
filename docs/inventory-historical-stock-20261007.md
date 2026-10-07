# Stock por fecha e impresión

Artículos incluye Fecha de stock e Imprimir stock filtrado. Hoy muestra saldo actual (día en curso); una fecha anterior representa el cierre del día en Argentina, antes de las 00:00 del día siguiente. No se permiten fechas futuras.

La consulta histórica lee cantidades y movimientos en una única instantánea PostgreSQL. Por depósito requiere un movimiento con saldo observado al cierre o antes, sin ambigüedad de timestamp, y comprueba que sus cambios posteriores concilien con el saldo actual. Las transferencias descuentan del origen y suman al destino; los ajustes usan new_stock - previous_stock y conservan su dirección.

Un depósito sin un saldo observado previo, con movimientos simultáneos sin ancla utilizable o con saldo incongruente queda Sin información histórica. El global exige todos los depósitos reconstruibles, suma actual por depósitos igual al global y ausencia de movimientos sin ubicación. La comprobación no puede certificar movimientos borrados o alteraciones históricas que no dejaron evidencia; no completa cantidades ausentes ni sustituye por el stock actual. El historial viejo puede resultar parcialmente consultable.

Los nombres, clasificación, mínimos y catálogo corresponden a la configuración actual. No hay precios históricos fiables, por lo que la consulta de fechas anteriores omite costos. Los indicadores superiores siguen mostrando situación actual. Un fallo de consulta histórica bloquea impresión/exportación y no muestra saldos actuales como históricos.

Impresión respeta búsqueda, área, agrupamiento, subagrupamiento, tipo, fecha y depósito. Incluye SKU, artículo, subagrupamiento, saldo y unidad; costos actuales según permiso solo para hoy. El CSV histórico informa fecha, filtros y saldos desconocidos. Se conserva el CSV actual con sus límites y estados. Ambos formatos escapan contenido y el CSV neutraliza fórmulas de planilla.

Validación: 31 pruebas de interfaz/regresión de Inventario, 5 de cálculo histórico, 2 contra PostgreSQL, TypeScript y compilación. No se migraron cantidades ni se modificaron saldos del hotel.
