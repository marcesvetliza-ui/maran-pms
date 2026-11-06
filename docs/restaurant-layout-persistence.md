# Restaurant: guardado explícito de las posiciones

Reporte: al mover mesas dentro del mismo sector, luego de volver a entrar aparecían como antes. El flujo anterior intentaba un PATCH por cada drop; el botón Guardar Layout sólo salía del modo edición. El movimiento no tenía onError y no había confirmación del guardado del conjunto. Los seeds revisados no reescriben posiciones existentes. Una muestra de los últimos 1001 registros del despliegue actual no permitió reconstruir solicitudes de movimiento ni atribuir el incidente a la sesión de Gonzalo; no se afirma una causa individual confirmada ni se modifican sus permisos.

## Cambio

Las posiciones se editan en un borrador. Guardar Layout envía sólo las mesas movidas a PATCH /api/restaurant/layout y espera una confirmación JSON explícita. Mientras guarda muestra su estado y evita nuevos movimientos. Los errores mantienen el modo edición y el borrador, muestran el mensaje y permiten reintentar. Después del éxito actualiza la caché con las posiciones confirmadas y vuelve a consultar el servidor, evitando que un fallo de refetch muestre datos antiguos como si se hubieran guardado.

Se puede arrastrar o tocar/clicar la mesa y después su destino. Al mover sobre otra mesa del mismo sector intercambia posiciones en el borrador; ambas se guardan juntas. Descartar movimientos descarta únicamente posiciones no guardadas. Las altas de mesas, cambios de capacidad y otras funciones conservan sus circuitos existentes. Los cambios que llegan por una actualización de datos no se incluyen como movimientos propios.

La ruta exige el mismo permiso `api:restaurant:edit-layout` que habilita el botón. Bajo transacción y bloqueo común, verifica mesas/sectores activos, posiciones iniciales esperadas, límites del plano y ocupación final de celdas. Rechaza un editor desactualizado sin sobrescribir al primero; un reintento tras respuesta perdida se reconoce cuando todas las posiciones ya coinciden. Si falla cualquier escritura, se revierte todo. Actualiza únicamente position_x/position_y, conservando identidad, número, sector, capacidad, estado y comandas.

No hay migraciones ni reordenamiento automático del plano real. No se recuperan posiciones históricas que no llegaron a guardarse. La distribución actual sólo cambia cuando un usuario guarda movimientos explícitos.

## Verificación

- Interfaz real de Restaurant con backend simulado: tocar mesa, destino, Guardar Layout, desmontar/limpiar caché/volver a entrar y comprobar posición persistida.
- Hook: intercambios sin alterar estado operativo, no escribir antes de guardar, conservar borrador y reintento tras error, actualizar caché sólo tras éxito, descartar sin escribir.
- PostgreSQL local y middleware de permisos real: gerente autorizado, anónimo/rol sin permiso rechazados, persistencia, reintento idempotente, conflicto concurrente, celdas ocupadas y fuera de sector, rollback ante fallo de segunda escritura.
- Regresiones de transferencias/cobros y concurrencia de Restaurant: 17 pruebas PG junto con layout. Cuatro pruebas de UI en cada rama. Readiness financiero conserva 503 en la prueba afectada anteriormente. TypeScript y builds completos.

Maran y Xenia incluyen el mismo cambio de layout. No se usó la sesión real de Gonzalo ni se modificaron datos operativos del hotel desde la evaluación.

## Uso

Recargar la página. Editar Layout → mover las mesas dentro del sector → Guardar Layout → esperar Layout guardado. Al volver a entrar se usa el plano persistido. Si hay un error o conflicto, el editor permanece abierto y muestra el motivo; no debe interpretarse como un guardado exitoso.
