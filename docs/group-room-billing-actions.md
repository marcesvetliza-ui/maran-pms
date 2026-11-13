# Cobrar y facturar desde una habitación de grupo

Pertenecer a un grupo ya no selecciona automáticamente el modo de sólo facturación en Prefactura. Se conserva el folio grupal y el detalle por habitación.

- **Cobrar y facturar estos cargos** es la opción inicial. Usa los medios de pago elegidos y conserva el plan de cobro original para completar la operación después de emitir. Los pagos previos aplicados reducen el dinero nuevo.
- **Sólo facturar** es una elección explícita: consume los conceptos fiscales pendientes, conserva el saldo por cobrar y no registra ingresos ni traslados de deuda. El servidor rechaza una acción que contradiga el plan de pago.
- **Cobrar una factura ya emitida** permite seleccionar, en la cuenta de la habitación, una factura emitida previamente sin cobro. Registra su cobro total y vínculo fiscal en la misma transacción que Caja, el folio y la auditoría. No pide otro CAE ni emite otra factura.

El último recorrido se limita a facturas de la habitación emitidas en modo «sólo facturar», conciliadas, sin pagos vinculados, aplicaciones previas, NC ni ajustes. Las facturas parcialmente cobradas o con historia ambigua necesitan revisión; no se deduce un cobro de la sola existencia de un comprobante.

Si existen anticipos grupales sin asignar, se puede aplicarlos desde la cuenta o confirmar expresamente que se recibe dinero nuevo. La confirmación queda en el intento de cobro original; no redistribuye anticipos ni altera comprobantes anteriores.

Los reintentos mantienen importes, receptor, medios y claves originales. Los intentos antiguos verificables siguen recuperándose. Una pantalla antigua no puede iniciar automáticamente una nueva factura sin cobro: se solicita actualizar y elegir la acción. Sólo se descarta el intento local si el servidor comprobó que no tiene operación ni factura persistida.

## Verificación

Las pruebas cubren selección explícita, contado en efectivo, recuperación de transferencia, cobro posterior de extras sin liquidar alojamiento, conservación fiscal, reintentos concurrentes, rechazo de un segundo cobro, reversión sin turno abierto y dinero nuevo con anticipos pendientes. Se verifican los saldos de habitación y grupo y los vínculos entre pago, folio, factura y Caja.
