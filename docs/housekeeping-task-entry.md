# Accesos a tareas de Housekeeping

La acción desde el detalle de una habitación abre un formulario individual con
la habitación fija. Conserva fecha, responsable, tipo, prioridad e instrucciones;
no muestra selección ni búsqueda de otras habitaciones.

Planificación por fecha tiene un único acceso general a la asignación masiva,
con la fecha consultada precargada. Cada tarea muestra responsable, prioridad,
estado e instrucciones. Las pendientes permiten abrir el editor precargado desde
su tarjeta; guardar modifica el mismo ID mediante el PATCH existente. Las tareas
en curso o finalizadas no ofrecen ese cambio.

Se reutilizan las validaciones del servidor y la protección contra duplicados de
igual tipo/fecha. Tras guardar se refrescan tanto tareas como planificación.
No cambia estados de limpieza, ocupación, No mover, permisos ni inspecciones.
No requiere migración ni activación.

Validación: pruebas de componentes de Housekeeping, TypeScript y compilación.

## Revisión de estados y salidas

El planning de Recepción muestra el estado sin ofrecer botones de cambio. El
endpoint genérico de edición de habitaciones exige además supervisión de
Housekeeping cuando se intenta cambiar realmente el estado; los formularios
que envían el mismo estado pueden seguir editando otros datos.

La planificación de Housekeeping muestra el late check-out y su hora junto a
la salida prevista. Se obtiene de la reserva actual en cada consulta y conserva
el refresco periódico existente (30 segundos); no implica checkout ni modifica
la prioridad de tareas automáticamente.

La renovación diaria recuperada se documenta en housekeeping-daily-service.md.
