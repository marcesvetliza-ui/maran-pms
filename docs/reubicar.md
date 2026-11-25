# Reubicar · Maran y Xenia

Probado inicialmente en Xenia (PR 191) y aprobado por el usuario para Maran.
La versión de Maran conserva sus correcciones actuales de grupos, cargos,
Hospitalidad, huéspedes y facturación. Se habilita el API con sesión y el permiso
existente de Reservas en producción. El diseño compartido incorpora encabezado
azul, superficies suaves, tarjetas redondeadas y selección visible en ambos temas.

Desde Planning o el detalle de una reserva, **Reubicar** abre un asistente con
búsqueda por habitación, apellido o código, incluyendo REUB. La búsqueda devuelve
hasta 30 resultados. Requiere el permiso ya existente de Reservas; no otorga roles.

Se ofrecen destinos libres para toda la estadía futura o para las noches pendientes
desde hoy de una reserva checked_in. Una estadía vencida necesita primero resolver
su fecha de salida; el asistente no inventa noches ni da un out. No se programan
traslados futuros de huéspedes alojados, intercambios ni cadenas en esta versión.

Categorías en sort_order del catálogo y números en orden natural; filtros de misma
categoría, mismo armado, listas para ingresar, piso y número. Se muestra el último
camaje registrado, separándolo del solicitado. No se promete limpieza futura.
Habitaciones sucias o en limpieza se muestran como disponibles en inventario, pero
no admiten traslado efectivo de un huésped alojado hasta estar listas. Capacidad,
inactividad, virtuales, mantenimiento, estadías superpuestas, huéspedes con salida
vencida sin out y límites early/late se revisan. La advertencia NO MOVER requiere
revisión explícita; se conserva su nota y se deja la preparación en revisión en el
destino. Cambios/ambigüedad de camaje generan una tarea de preparación de HK.

El servidor valida todo otra vez al confirmar, con el mismo mutex transaccional de
inventario usado por creación/asignación y Channex, locks de reserva y habitaciones,
tokens de los datos revisados y clave de intento durable. Un fallo de auditoría
revierte reserva, estados, preparación, tarea e historial. El reintento idéntico
devuelve el mismo resultado sin repetir. Un intento reutilizado con otros datos se
rechaza. GET no mueve ni aparta habitaciones; cancelar no escribe.

Se conserva la identidad única de reserva, categoría contratada, paquete, precios por
noche, fechas originales, consumos, pagos, anticipos, folios y documentos fiscales.
No se llama al cierre ni a ARCA ni se modifican importes para habilitar un traslado.
Los grupos conservan su vínculo y financiación. La categoría contratada cumple el
cupo original; la habitación física consume capacidad en destino, también cuando
es de otra categoría. Channex usa la habitación física para disponibilidad y la
categoría contratada para reconocer el cupo ya asignado del grupo.

## Historia de habitaciones

`reservations.room_history` almacena exclusivamente tramos terminados, con salida
exclusiva. `room_id` sigue siendo la habitación actual; el último tramo termina en
la salida original de la reserva. Una reubicación hoy no cambia las noches de ayer;
dos cambios el mismo día no crean noches duplicadas. Planning, conflictos físicos,
disponibilidad de habitaciones, inventario de grupos, producción por noche y detalle
de Revenue leen esos tramos. Los importes se distribuyen sobre las noches originales,
no se recalculan sobre cada tramo. Housekeeping por fecha usa el destino de esa noche.

La migración incremental agrega room_history nullable y reservation_relocations,
sin reconstruir cambios antiguos a partir del indicador moved_from_room_number.
Los cambios históricos previos conservan su evidencia disponible; no se inventan
tramos retrospectivos. POST/PATCH genéricos no pueden fabricar room_history.
Los cambios de habitación de huéspedes alojados por el escritor existente conservan
también los tramos; se evita borrar el ingreso original o acortar antes de un cambio
ya registrado. REUB y el arrastre existente siguen disponibles.

## Validación

Pruebas PostgreSQL con base local descartable: períodos completos, futuro, REUB,
traslados sucesivos, dos recepcionistas/dos huéspedes por un destino, reintentos,
conflictos nuevos, tokens desactualizados, preparación especial, capacidad, rollback
por auditoría, permisos también en producción y datos financieros de grupos
intactos. Pruebas de interfaz del flujo, filtros, motivo, confirmaciones y reintento.
Regresión de disponibilidad, inventario grupal, Housekeeping, alojamiento y Revenue;
tipos y build; revisión visual a tamaños de tablet y móvil.
