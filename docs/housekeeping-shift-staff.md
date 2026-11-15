# Turno: personal operativo y finalización de limpieza

## Uso

- **Agregar personal**, junto a Disponibilidad del personal, permite registrar nombre y tipo: **Personal fijo** o **Personal extra**.
- No crea usuarios de acceso al sistema. El personal fijo permanece disponible; el extra sólo es seleccionable para la jornada elegida.
- La jornada activa cambia con el calendario de Argentina, también cuando la tablet recupera el foco. Se conserva una fecha histórica elegida explícitamente.
- El historial nunca se elimina por el cambio de día. Si quedaron pendientes de un extra anterior, se muestran con nombre y habitación en un aviso.
- Las habitaciones se distribuyen en dos columnas desde tablet y en una en celular. El filtro permite ver todo el personal, sin asignar o una persona concreta.
- **Terminar** sólo se habilita para una limpieza asignada no futura. Registra la finalización y la condición limpia de la habitación, conservando una estadía ingresada y el aviso de preparación especial «No mover».
- La asignación deja de contar como pendiente; la tarea conserva quién realizó el trabajo. Si no hubo inicio registrado, no se inventa una hora de comienzo.
- Las tareas de inspección o mantenimiento no se finalizan con este botón. Los bloqueos de habitación y No molestar no se sobrescriben.

## Seguridad y persistencia

Las altas, la disponibilidad y la finalización de Turno requieren los permisos existentes de acceso a Housekeeping y supervisión. El personal operativo se almacena por separado de las cuentas de acceso. El servidor valida la jornada de cada extra y audita los cambios.

La finalización utiliza bloqueo de habitación y tarea, valida que la persona asignada siga siendo la esperada y guarda habitación, tarea y auditoría en una sola transacción. Los reintentos de una misma tarea ya finalizada no duplican efectos.

La migración aditiva está incluida en el arranque incremental de producción, además de los archivos de esquema y migración. No elimina ni modifica usuarios existentes.

## Verificación realizada

- 34 pruebas PostgreSQL del circuito de tareas, incluyendo altas operativas, alcance diario, disponibilidad, finalización, concurrencia, ocupación, historial, permisos y reversión por fallas de auditoría.
- Otras 14 pruebas PostgreSQL de disponibilidad y planificación.
- 18 pruebas de interfaz en los componentes y páginas afectados.
- TypeScript y compilación frontend/backend correctos.
- Revisión visual local en tablet y celular con datos sintéticos; no se comprobó una sesión real del hotel.

Las pruebas de persistencia utilizaron exclusivamente una base local descartable, con autorización explícita de las pruebas destructivas sobre esa base. No se modificaron datos del hotel.
