# Camajes configurables por habitación

Habitaciones consultaba una lista fija y no el catálogo de Administración → Tipos de Camaje.
Housekeeping, su planificación y el diálogo de recepción también tenían selectores fijos.

## Cambio

- Un catálogo compartido usa los códigos y nombres de `/api/bed-types`.
- Los selectores muestran tipos activos ordenados alfabéticamente y respetan los camajes permitidos de cada habitación.
- Los tipos desactivados o ausentes que ya están guardados siguen visibles; no se convierten en opciones nuevas para otras habitaciones.
- Se conservan códigos históricos conocidos cuando están explícitamente guardados en esa habitación; no se hace una migración ni se reescriben códigos.
- Se diferencian camaje físico actual, camajes admitidos y pedido/preparación de la reserva.
- La edición y creación de habitaciones y la confirmación física validan el catálogo en servidor.
- Confirmar una preparación sigue comprobando revisiones, pedido, habitación, permisos y ocupación. No cambia limpieza ni «No mover».
- El formulario de Nueva reserva también usa el catálogo; no se cambia su contrato de persistencia del pedido.

## Validación

Casos de catálogo personalizado y nombres configurados, restricción por habitación, guardado y reapertura, retención de valores históricos inactivos, rechazo de códigos no válidos y permisos. El test de ruta en memoria ejecuta los handlers registrados y su middleware real con almacenamiento simulado; no prueba persistencia PostgreSQL.

No se consultó ni modificó la base operativa. La ejecución de las pruebas HTTP con listeners quedó impedida por EPERM del entorno; las validaciones de ruta se comprobaron en memoria sin listeners. No se ejecutó integración PostgreSQL para este cambio.

Resultados finales: suite cliente completa, 155 archivos y 835 pruebas aprobadas; seis pruebas de rutas en memoria aprobadas; TypeScript sin errores.
