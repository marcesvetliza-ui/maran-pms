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
endpoint genérico de edición de habitaciones rechaza cambios de estado incluso
para supervisión: las correcciones usan el endpoint de Housekeeping con sus
controles y auditoría. Si llega el mismo estado se omite de la escritura para no
pisar un cambio concurrente ni renovar la fecha de limpieza.

La planificación de Housekeeping muestra el late check-out y su hora junto a
la salida prevista. Se obtiene de la reserva actual en cada consulta y conserva
el refresco periódico existente (30 segundos); no implica checkout ni modifica
la prioridad de tareas automáticamente.

La renovación diaria recuperada se documenta en housekeeping-daily-service.md.

## Correcciones excepcionales

Habitaciones y Housekeeping comparten un diálogo con motivo obligatorio de
hasta 500 caracteres y comparación del estado original. Cancelar no escribe;
un conflicto conserva el motivo para revisión. El servidor exige supervisión y
acceso a Housekeeping, registra usuario, motivo y estados antes/después en la
misma transacción, y conserva la protección de tareas en curso.

Corregir limpieza no registra un check-in: un cuarto vacío no puede marcarse
ocupado. Limpiar un cuarto con estadía ingresada conserva su ocupación; marcarlo
sucio también mantiene la ocupación. Las acciones normales de iniciar/finalizar
una tarea conservan su flujo y no piden este motivo excepcional.
