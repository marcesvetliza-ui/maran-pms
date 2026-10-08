# Recuperación de notas de crédito en cuenta corriente

El cargo nuevo utiliza credit-operation:UUID; las notas de crédito de reserva buscaban solo TIPO-NÚMERO. La corrección identifica el cargo por la operación persistida en la factura o por el payment_id normalizado, conservando también el formato anterior. Nunca deduce el vínculo por CUIT, nombre o importe.

La compensación se realiza en la misma transacción que la conciliación de la NC. Bloquea el cargo, rechaza vínculos ambiguos, conserva los pagos y movimientos de caja, mantiene el área del cargo y limita las compensaciones al importe originalmente cargado. El identificador de la NC evita duplicados. Los importes ya compensados se identifican por las NC vinculadas a esa factura, evitando confundir números de diferentes puntos de venta. Se excluyen movimientos anulados.

Para una NC de reserva ya emitida y conciliada, Facturación → listado de comprobantes → Revisar CC. Confirmar la revisión: solo agrega el movimiento faltante en cuenta corriente, con referencia a NC y cargo y registro de auditoría. No emite otro comprobante, no actualiza monto_acreditado ni vuelve a ajustar el folio. Si no encuentra un cargo o encuentra varios, exige revisión; no inventa asociaciones.

Caso informado: JOHNSON ACERO, NC A 0021-00000002, $390.000. El caso concreto debe revisarse en la aplicación desplegada; no se dispone de conexión directa a producción en esta sesión y no se modificó su saldo desde el entorno de desarrollo.
