# Recuperación de operaciones de recepción con factura parcialmente acreditada

La pantalla de Facturación muestra «Emitida» tanto para estado `emitida` como `parcial`. El endpoint de recuperación y la conciliación solo admitían `emitida`; además, el descubrimiento de operaciones volvía a presentar como pendientes liquidaciones terminadas cuando una NC cambiaba luego el estado a `parcial`.

Se reconoce el estado fiscal parcial como emitido para descubrir la operación. La recuperación admite una factura parcial sin importe acreditado, o una parcialmente acreditada únicamente cuando la conciliación y su liquidación ya terminaron. En este último caso retorna el mismo comprobante sin repetir cargos. Una nota de crédito con liquidación incompleta requiere conciliación: no se aplica automáticamente el cargo bruto anterior. Los documentos anulados siguen bloqueados y el error identifica comprobante y estado.

Sin migraciones ni escrituras directas de reparación en datos del hotel. El check-out conserva sus verificaciones normales. Esta corrección no acredita por sí sola el resultado de un comprobante específico en producción; debe comprobarse retomando la operación original.

Validación: regresión HTTP de reintentos sin segunda emisión/cargo, descubrimiento de CC completada y pendiente, protección de facturas anuladas/acreditadas, conciliación idempotente con PostgreSQL local, estabilidad de emisión/CC y pruebas del diálogo de prefactura; TypeScript y compilación.
