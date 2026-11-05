# Cierre explícito de un intento de recepción con factura anulada

Incidente habitación307: los logs confirman reintentos de un intento anterior sobre FA5-100, anulada, total y acreditado156000, intent.status y settlement.status completed. El número125 indicado inicialmente no identifica el documento de ese reintento. No se reasigna el intento a otra factura.

El estado de recepción identifica la factura anulada y ofrece Cerrar intento de factura anulada solo con evidencia suficiente. Se exige misma reserva/operación, cuenta corriente, recuperación version2, cero cobros nuevos preparados y total acreditado completo. Para operaciones históricas se acepta liquidación original durable ya completada; de lo contrario se verifica que las NC vinculadas concilien el total neto, sin documentos pendientes. Se admite reconciliation_status NULL para documentos históricos, como los controles existentes de NC.

La acción reutiliza correct-reception bajo lock financiero y de serie. En transacción bloquea operación, documento y, cuando corresponde, NC; vuelve a comprobar evidencia y cambia únicamente stage/error_code del journal a corrected/BILLING_CANCELLED_OPERATION_CLOSED. Conserva invoice_id, request_snapshot, hash, factura anulada, NC, pagos y movimientos. Registra auditoría una sola vez. Nunca consulta ni autoriza ARCA, nunca borra comprobantes ni permite reemitir el mismo operationId.

El cliente limpia su intento local solo después de la confirmación del servidor, renueva su identificador, refresca folio/facturas y cierra el diálogo. No hace check-out, no prepara automáticamente otra factura ni registra deuda nueva. Reabrir la habitación reconstruye los datos vigentes con los controles normales.

Validación: pruebas PostgreSQL con factura cancelada y reemplazo125 inalterados, doble reintento y auditoría única, histórico sin NC inventada, rechazo de NC pendiente/parcial y cobro nuevo pendiente. Prueba UI de única escritura correct-reception, limpieza local y ausencia de emisión/pago/check-out. Regresión de rechazo ARCA, incertidumbre y recuperación de operaciones emitidas.

Sin reparación directa de datos de producción; el cierre lo ejecuta el usuario desde el botón.
