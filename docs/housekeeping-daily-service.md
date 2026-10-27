# Servicio diario durante una estadía

La limpieza de una habitación ocupada se registra con fecha de Argentina. Al cambiar la fecha local, un proceso automático (cada minuto, también al iniciar el servidor) cambia de `limpia_ocupada` a `occupied` únicamente habitaciones físicas activas con una reserva realmente `checked_in`, servicio registrado de un día anterior y ninguna tarea en curso. No usa la salida prevista como checkout.

Housekeeping muestra **Ocupada · limpieza pendiente** para ese caso, tanto en habitaciones como en planificación y asignación de hoy. Un ingreso recién registrado no se etiqueta automáticamente como servicio vencido. Las habitaciones se refrescan cada 30 segundos mientras la pantalla está visible.

El estado sigue siendo ocupado: no libera inventario, no cancela reservas ni modifica cargos o cobros. No crea tareas, no reasigna personal ni descuenta insumos. No toca `No molestar`, mantenimiento, fuera de servicio, habitaciones vacías, limpieza en curso ni la marca de reserva **Limpia — No mover**. Verificar el trabajo de ayer no acredita el servicio de hoy.

La actualización usa una transacción con auditoría por habitación y es idempotente entre instancias. Si el servidor estuvo detenido recupera servicios vencidos al iniciar. Una limpieza completada hoy se protege con la fecha actual; los cambios ordinarios de estado limpian esa fecha, para no arrastrar el servicio de otro huésped. Las fechas no se aceptan desde formularios de habitaciones.

Migración: `20261022_housekeeping_service_day.sql`. Agrega `rooms.housekeeping_service_date` y fecha hoy las habitaciones ya marcadas limpias ocupadas sin fecha. Así no se altera su estado inmediatamente al desplegar; serán candidatas desde la próxima jornada. No se inventan horarios ni tareas históricas. El cambio de jornada usa medianoche argentina, independiente de informes manuales de Night Audit.

Validación en base PostgreSQL local desechable: límite de medianoche argentina, servicio de hoy, reservas realmente ocupadas incluso con salida prevista vencida, conservación de No mover/importes, exclusiones, concurrencia e idempotencia, reanudación tras interrupción, protección de fecha e inspección de trabajo anterior. Sin acceso a datos del hotel.
