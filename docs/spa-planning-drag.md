# Reprogramar turnos simples desde el planning SPA

El planning diario permite arrastrar turnos pendientes o confirmados de hoy en adelante, con el permiso existente `api:spa:write`. El movimiento usa pasos de 30 minutos, conserva la duración guardada y debe caber íntegro entre 08:00 y 22:00. Al soltar se muestran el gabinete y horario anteriores y nuevos; sólo confirmar envía el cambio. Cancelar no escribe nada.

Los circuitos y sus recursos, turnos en curso, finalizados, cancelados y ausencias no se arrastran. La edición existente continúa disponible según sus permisos y reglas. El arrastre se implementa con el mouse mediante el mecanismo nativo del navegador; no sustituye el formulario en dispositivos táctiles.

`POST /api/spa/appointments/:id/move` acepta únicamente gabinete, inicio y una instantánea de la programación anterior. Bloquea la fila, verifica que no haya cambiado, rechaza circuitos y reutiliza los bloqueos y controles de ocupación actuales, incluidos recursos de otros circuitos. Actualiza sólo gabinete/inicio/fin y registra auditoría en la misma transacción. No cambia fecha, tratamiento, profesional, importes, cuentas, comprobantes, pagos ni insumos. Un error no aplica el movimiento y actualiza la grilla desde el servidor.

Pruebas: confirmación/cancelación, conflicto, permisos, estados excluidos, límites de horario, actualización concurrente, ocupación por recursos de circuito, dos movimientos al mismo destino y conservación de datos financieros en PostgreSQL local. Prueba adicional en Chromium sobre la pantalla SPA real con API sintética. Sin acceso a operaciones del hotel.
