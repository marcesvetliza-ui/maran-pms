# Asignación desde la bandeja OTA

En **Canales OTAs → Reservas recibidas**, una reserva pendiente o en revisión que todavía no esté vinculada al PMS ofrece **Asignar al PMS**, tanto en la fila como en el detalle. La acción requiere el permiso por rol **Gestionar y reintentar reservas recibidas**.

1. Revisar la estadía, el importe original y, para USD, la cotización y el total en ARS propuestos.
2. Elegir categoría y habitación disponible para cada unidad recibida. No se asigna una misma habitación a dos unidades.
3. Si la categoría elegida difiere de la correspondencia del canal, el formulario muestra origen y destino y exige marcar la confirmación del cambio antes de guardar.
4. Una selección fuera del alcance o mapeo automático requiere además el permiso **Configurar conexiones, credenciales y mapeos** y una confirmación específica. Esta excepción corresponde solamente a la reserva: no amplía el inventario publicado ni modifica los mapeos.
5. Indicar el motivo y pulsar **Confirmar asignación al PMS**. El servidor vuelve a validar disponibilidad, capacidad, mantenimiento, grupos, revisión del canal, mapeos y cotización.

La asignación conserva el importe y los precios por noche originales del canal; no aplica la tarifa vigente de la categoría de destino. La primera aplicación conserva la cotización de conversión para revisiones posteriores. No registra un cobro ni un movimiento de Caja.

Las habitaciones, la conversión, el vínculo al canal, la revisión y la auditoría se guardan en una sola transacción. El historial de la reserva y la auditoría identifican al operador, motivo, categoría original y destino. Un reintento de la misma confirmación devuelve la asignación existente sin crear otra reserva.

Si llegó otra revisión, cambió la cotización o una habitación dejó de estar disponible, se debe actualizar la bandeja o las opciones y volver a revisar antes de confirmar. No se puede asignar una cancelación ni una reserva con datos de origen inválidos.

Las modificaciones posteriores de una reserva asignada excepcionalmente fuera del alcance o mapeo automático quedan para revisión, para evitar que un cambio del canal deshaga la elección del hotel. Las cancelaciones siguen los controles existentes de modificaciones locales e historial financiero.

## Verificación

- PostgreSQL descartable: `server/tests/channex-assignment.pg.test.ts` y regresión `server/tests/channex-inbound.pg.test.ts`.
- Interfaz: `client/src/components/channex-manual-assignment.test.tsx` y `channex-reservations-inbox.test.tsx`.
- Navegador con datos sintéticos: levantar `npx vite --config scripts/ota-access-browser/vite.config.ts` y ejecutar `node scripts/ota-access-browser/verify-assignment.mjs`. Comprueba permisos, confirmaciones, ausencia de escrituras previas y anchos de 1440, 768 y 390 píxeles.

La publicación de esta función no asigna reservas existentes ni activa Booking.com. La reserva real se asigna cuando el equipo confirma su elección desde la bandeja.
