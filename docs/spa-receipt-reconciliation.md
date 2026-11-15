# Cierre de conciliación de comprobantes SPA

Los tickets y vouchers internos de SPA emitidos desde el recorrido directo conservaban `reconciliation_status=pendiente` del borrador de homologación, incluso cuando Caja ya tenía el ingreso correcto. El estado visible no indicaba por sí solo un cobro faltante.

El recorrido directo de SPA en efectivo guarda ahora el ingreso y su conciliación en una misma transacción, con auditoría. La comprobación usa el comprobante persistido, su medio e importe y los movimientos activos de su propia referencia. Un reintento reutiliza el ingreso existente, sin volver a cobrar. No se concilian ingresos con importe, área o medio distintos, anulados, duplicados, con errores o con una corrección fiscal. Los comprobantes con otra cuenta o intención económica conservan sus circuitos propios.

La vinculación de una factura A/B con su cuenta SPA también completa la conciliación dentro de la transacción que registra pago, folio, cierre y stock.

Las regularizaciones históricas sólo actualizan el estado de comprobantes cuyo ingreso existente se verificó. No cambian importes ni movimientos de Caja. Las posibles ventas duplicadas necesitan confirmación de SPA; no se eliminan automáticamente.

La integración PostgreSQL cubre emisión real por el endpoint, consulta del listado, reintentos concurrentes, conservación de datos, rechazo de ingresos inconsistentes y reversión completa ante un fallo de auditoría.
