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
