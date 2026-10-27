# Housekeeping: tareas, asignaciones y coherencia operativa

Primera entrega de las etapas 1 y 2 acordadas el 21/10/2026. Rama
`fix/housekeeping-operational-tasks`, desde main `8a1938f1`.

## Qué cambia

- La limpieza finalizada consulta la ocupación real (`checked_in`): una habitación
  que sigue alojada queda `limpia_ocupada`, aunque tenga salida prevista hoy. Una
  salida prevista no se transforma en un checkout.
- La tarea completada no se marca inspeccionada. La supervisión registra una
  verificación separada y el servidor guarda la identidad real de quien inspecciona.
  Se conserva el significado actual de limpia/disponible; no se introduce una
  política nueva de inspección obligatoria para vender habitaciones.
- Listado y ejecución del personal se limitan a sus propias asignaciones también
  en el servidor, incluso sin fecha o intentando consultar otra persona. Sin tareas
  asignadas la vista móvil queda vacía, sin mostrar habitaciones ajenas.
- La supervisión mantiene controles de escritorio. Sólo el permiso existente
  `api:housekeeping:supervisor-view`, junto al acceso a Housekeeping, habilita crear,
  asignar, editar, eliminar pendientes y verificar. No se cambian roles ni permisos
  configurados en el hotel.
- Una tarea sólo empieza si está pendiente y corresponde a hoy. Repetir inicio o
  finalización no cambia relojes ni duplica auditorías. Otra tarea en curso en la
  misma habitación impide un segundo inicio. Se puede finalizar y verificar trabajo
  comenzado el día anterior, sin perderlo al cambiar la fecha.
- No se inicia una limpieza en No molestar, mantenimiento o fuera de servicio.
  Si No molestar se indica durante el trabajo, finalizar no elimina ese aviso.
  Un cambio manual a limpia no puede dejar oculto un cronómetro activo: se pide
  finalizar la tarea. Una verificación tampoco pisa otra tarea en curso.
- Tarea, habitación y auditoría se guardan en una misma transacción. La auditoría
  incluye actor, datos anteriores y posteriores. Una falla de guardado revierte todo.

## Crear y asignar

Se agrega un formulario compartido para una o varias habitaciones con fecha,
responsable, tipo, prioridad e instrucciones. Permite buscar por habitación/piso,
seleccionar visibles y revisar la cantidad antes de guardar. El formulario tiene
scroll dentro de la pantalla y conserva los datos ante errores.

La lista de tareas se filtra por fecha y estado. Desde allí se pueden editar o
reasignar pendientes conservando instrucciones, consultar horarios y duración, y
confirmar verificaciones. Las tarjetas de habitación abren el mismo formulario.
La vista móvil muestra instrucciones completas y prioriza tareas activas y urgentes.

Las altas múltiples son completas o no se guardan. Se validan habitaciones físicas,
personal activo, fechas y tipos. Una tarea pendiente/en curso del mismo tipo,
habitación y fecha evita duplicar el envío. No se modifica una tarea ya comenzada
para reasignarla ni se eliminan tareas con historial de ejecución. Se conserva el
acceso simple de Turno, sin permitir que sobrescriba silenciosamente varias tareas.

## Qué se conserva

`Limpia — No mover`, preparación especial, avisos a Recepción y confirmaciones por
cambio de habitación quedan intactos. No se cambian reservas, pagos ni facturación.
Tampoco se implementan reinicios nocturnos de estados, reconstrucción histórica de
la grilla, camaje futuro, consumos automáticos ni planificación de francos.
Elegir una fecha en tareas permite programarlas; no simula el estado físico futuro.
No hay migración ni activación manual.

## Validación

- PostgreSQL local desechable: aislamiento por responsable, permisos, creación
  múltiple, duplicados y concurrencia, transiciones, ocupación y checkout real,
  No mover, No molestar, inspección, cambio de jornada y rollback ante falla de
  auditoría. También se ejecutan las suites existentes de preparación especial y
  planilla diaria.
- Interfaz: creación múltiple, conservación de instrucciones al editar, cancelar
  sin escritura, error legible y confirmación de inspección. Se mantienen pruebas
  existentes de preparación, advertencias por cambio de habitación y planilla.
- Permisos de planilla e inventario: pruebas existentes del servidor.
- TypeScript y build del proyecto.
- Chromium local con APIs simuladas: formulario en escritorio y móvil; una mucama
  sin asignaciones no ve tarjetas ajenas ni controles de gestión.

Los datos de estas pruebas son sintéticos. No se ejecutaron operaciones en el hotel
ni se publicó esta rama en main. No se acredita un recorrido con teléfonos y sesiones
reales del personal; queda para la revisión operativa de esta entrega.
