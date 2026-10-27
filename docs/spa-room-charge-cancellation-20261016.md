# Anular desde Recepción un cargo transferido de SPA

La acción existente «Anular cargo» permite quitar de la cuenta de habitación un cargo transferido desde SPA, con motivo obligatorio. Conserva el registro como anulado para auditoría y deja de sumarlo al saldo.

No devuelve el importe a SPA, no reabre su cuenta, no cancela ni modifica el turno y no revierte consumos de stock. No crea ni anula pagos, movimientos de Caja o facturas. La resolución del servicio y sus consumos queda a cargo de quien autoriza la anulación.

## Implementación

La protección de financiación intercepta únicamente PATCH /api/charges/:id/anular para el cargo SPA verificado y ejecuta una anulación transaccional específica. El resto de los escritores legacy sigue bloqueado. Mantiene los mismos roles autorizados por la ruta de Recepción (admin, manager, reception), obtiene el operador de la sesión y descarta identidades enviadas por el navegador.

Verifica el cargo, su cuenta SPA y ambos movimientos de transferencia persistidos. Bloquea el ámbito SPA, la reserva y la misma clave de preparación fiscal usada por Recepción. No permite anular reservas cerradas ni cargos con historial fiscal o correcciones ambiguas. El control de historial fiscal se comparte con las acciones de extras manuales, sin alterar esa política.

Una única transacción marca el cargo como anulado, registra una contrapartida negativa al movimiento recibido, actualiza el saldo del folio de habitación y guarda motivo y operador en un evento inmutable. Una repetición o dos solicitudes simultáneas reutilizan el resultado original y no descuentan dos veces. SPA conserva el traslado original y muestra «Cargo anulado desde Recepción» con el motivo en su historial, saldo cero y sin opción de volver a facturar ese traslado.

El diálogo exige motivo antes de confirmar y presenta mensajes legibles del servidor. Un rechazo conserva el diálogo y el motivo ingresado.

## Verificación

PostgreSQL aislado con HTTP: autorización, motivo, identidad de sesión, anulación concurrente, ambos saldos, turno/stock/pagos inalterados, conservación ante comprobante emitido o pendiente, serialización con preparación fiscal y rollback si falla la auditoría. Regresiones de extras manuales contra otra base sintética. Pruebas del componente de Recepción y del folio SPA, más navegador del circuito financiero existente, motor, TypeScript y build.

No hay migraciones ni variables nuevas de Railway. No se consultaron datos operativos ni se emitieron comprobantes reales durante estas verificaciones.
