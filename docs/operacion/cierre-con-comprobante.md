# Cierre con factura o voucher

Regla operativa confirmada el 29/10/2026: un voucher no fiscal es un comprobante final, no una solicitud de factura fiscal posterior. Un circuito se considera saldado cuando sus cargos están documentados y sus pagos/liquidaciones cubren el importe. Cargos nuevos o saldos impagos siguen pendientes por su diferencia.

Recepción cuenta `cierre_habitacion` para la documentación de los cargos, además de FA/FB/FC/FT/FM/FMB. El total fiscal se conserva separado del total documentado: un voucher no obtiene CAE ni se representa como factura ARCA. La prefactura y la validación de fuentes del servidor consideran los vouchers emitidos; no pueden volver a consumir cargos ya documentados. Un voucher anulado no cancela esos cargos. La lectura del folio y su PDF usan el mismo cálculo; no se modifican pagos, Caja o comprobantes existentes.

Si una reserva individual conserva saldo operativo y ya no hay conceptos disponibles para emitir (por ejemplo, un traslado desde SPA), Recepción puede elegir Cuenta Corriente y usar «Cerrar y pasar a Cuenta Corriente». La confirmación muestra el saldo completo y su destinatario. El servidor verifica nuevamente ese importe y registra juntos la liquidación de la habitación, el cargo pendiente en la cuenta elegida y el check-out, con auditoría. No emite otra factura; Caja recibe únicamente un movimiento informativo. Un reintento conserva la cuenta, el importe y la clave originales. Si el saldo cambió, no aplica el traslado y pide revisar el folio. Las reservas grupales conservan su circuito desde Folio Maestro.

SPA conserva el voucher, su recuperación idempotente y la consulta del historial. Una cuenta cerrada con voucher no ofrece otra facturación y el adaptador rechaza nuevos intentos. Las recuperaciones fiscales históricas verificadas de cuentas sin voucher emitido mantienen su circuito. La emisión de voucher exige saldo cubierto y sigue siendo transaccional con pagos, Caja y stock.

Restaurant conserva sus cierres existentes: pagos parciales no cierran hasta cubrir el total y reintentos no agregan ingresos. Las pruebas cubren explícitamente ticket, Voucher Justo y Room Service, además de los cierres fiscales con transporte simulado y las divisiones/pagos por ítem.

Validación realizada exclusivamente con fixtures y bases locales desechables; no se emitieron documentos reales ni se registró dinero en el hotel durante las pruebas. No se activaron conexiones de Channex.
