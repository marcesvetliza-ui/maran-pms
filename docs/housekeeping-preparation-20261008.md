# Preparaciones especiales: Limpia — No mover

Housekeeping puede elegir la reserva asignada a una habitación y marcarla limpia con un aviso y una nota opcional de hasta 500 caracteres. Si existen varias reservas, debe seleccionar explícitamente la que corresponde. La habitación sigue contando como limpia; el aviso se almacena por reserva y habitación, separado del estado de limpieza y de No molestar.

El planning conserva los colores de las reservas. En las celdas cortas aparece un símbolo ámbar que permite consultar el motivo al tocarlo. El detalle muestra NO MOVER y la nota. El diálogo de arrastre muestra el pedido, las habitaciones de origen y destino y permite Cancelar / Mover igualmente. Los otros editores reciben la misma advertencia confirmable del servidor.

El movimiento confirmado conserva la nota y registra quién y cuándo movió la reserva. La nueva asignación aparece como REVISAR PREPARACIÓN en Housekeeping y en el planning: no se presume que los pedidos fueron trasladados. Housekeeping puede preparar el destino y marcarlo nuevamente, o quitar explícitamente el aviso. Cambiar la limpieza no borra el pedido.

No se hereda el aviso al crear o duplicar reservas. Las estadías finalizadas, anuladas o no-show no aparecen en los avisos activos de Housekeeping. El historial de la reserva conserva las acciones.

Seguridad: lectura y marcación requieren autenticación y permiso de Housekeeping; la modificación normal de la reserva no permite sobrescribir el aviso. El servidor vuelve a comprobar bajo bloqueo de fila que se confirmó la versión vigente del pedido antes de mover. El bloqueo respeta el orden de las operaciones de disponibilidad existentes.

Despliegue: columna JSONB reservations.housekeeping_preparation, migración aditiva e idempotente; sin variables nuevas ni cambios de saldos.
