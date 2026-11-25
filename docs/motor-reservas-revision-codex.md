# Motor de reservas — entrega para revisar con Codex

> Publicación del código autorizada por el propietario el 25/11/2026. La autorización NO incluye habilitar las ventas online: el motor debe publicarse con ventas bloqueadas. Las notas de entrega y revisión que siguen conservan su contexto histórico.

## Estado y límite de autorización

Cambios preparados localmente el 25 de noviembre de 2026. **No publicados, sin push a GitHub y sin cambios en la base, tarifas, fotos o infraestructura productivas.** El usuario pidió expresamente que Codex los revise antes de cualquier publicación. La vista previa principal conserva su código anterior.

La implementación está aislada en `.local/booking-engine-review`, basada en el código de Railway/GitHub observado como publicado: `marcesvetliza-ui/maran-pms`, revisión `7bd9cc127f676b3cc06385db77c95e742f16408c`. La revisión del despliegue se volvió a consultar al terminar y no había cambiado. Esto es metadato del despliegue, no una comprobación independiente del SHA servido por HTTP.

**No copiar el checkout completo sobre este proyecto ni hacer merge de historiales divergentes.** La copia principal está atrasada respecto de la implementación de calendario/Channex publicada; allí faltan dependencias necesarias. Integrar solamente el cambio específico sobre la versión de GitHub que corresponda, tras revisar diferencias.

## Dónde está el código

- Checkout local: `.local/booking-engine-review`.
- Rama local prevista para revisión: `review/booking-engine-no-publish` (no enviada a GitHub).
- Parche completo de entrega: `generated-artifacts/motor-reservas-codex.patch` en la raíz del proyecto.
- Copia de estas instrucciones dentro del checkout: `docs/motor-reservas-revision-codex.md`.
- Captura de la interfaz con **datos ficticios**, no configuración del hotel: `.local/booking-engine-review/generated-artifacts/booking-preview/configuracion.jpg`.

El parche incluye archivos nuevos y pruebas, no dependencias instaladas, imágenes del hotel, certificados, archivos de entorno, compilados, la captura, datos de prueba ni archivos generados por la compilación.

## Funcionalidad preparada

### Plan y descuento

En Motor de Reservas → Configuración, cada categoría permite elegir un plan tarifario existente de esa misma categoría y un descuento de 0 a 99,99%. El plan original no se modifica. El valor se obtiene por noche, considerando precios generales o por ocupación del calendario; el descuento se calcula en centavos. La reserva conserva el detalle exacto por noche y su evidencia de alta, no solamente un promedio.

El precio general diario sustituye al precio de ocupación base cuando no hay una sobrescritura de ocupación para esa noche. Las sobrescrituras de ocupación tienen prioridad. Revisar esta política comercial con el hotel si un mismo plan combina ambas modalidades; no cambiar el módulo OTA como parte de esta entrega.

### Calendario compartido

Se usa `calendarEffective` y las mismas `rate_calendar_entries` del PMS, sin consultar ni cambiar Channex. Se controlan vigencia de cada noche ocupada, stop-sell, cierre de llegada en check-in, cierre de salida en check-out, mínimo a la llegada, mínimo durante la estadía y máximo. El stop-sell de la fecha de salida no bloquea una noche que no se ocupa.

La disponibilidad consulta los controles compartidos de compromisos de grupos y la disponibilidad física, incluyendo historial de cambios de habitación, mantenimiento por fechas, habitaciones fuera de servicio, inactivas y virtuales. El público no puede aceptar una advertencia de sobreventa de grupos. Se muestra “Disponible”, no un conteo que podría ignorar compromisos grupales sin asignación.

Al confirmar, se vuelve a cotizar y se comprueba que el plan y el total coincidan con lo mostrado. Una tarifa desactualizada, cierre o falta de cupo devuelve conflicto antes de crear al huésped. La operación usa el mutex de inventario existente y una transacción; si falla la reserva, se revierte también el alta de huésped. Un formulario público ya no sobrescribe los datos de un huésped existente solo por conocer su email.

### Fotos

Permite elegir archivos JPEG, PNG o WebP, convertirlos a JPEG de hasta 1600 px y 600 KiB, previsualizar, elegir principal y quitar imágenes de la galería. Máximo 10 fotos visibles por categoría; se conservan los enlaces http/https existentes.

Los JPEG se guardan en PostgreSQL, no en disco efímero ni en un nuevo servicio externo. El servidor controla tamaño, base64 canónico, estructura JPEG y dimensiones; los sirve con tipo fijo, `nosniff` y política restrictiva. No se aceptan SVG/HTML. La inspección estructural no es un antivirus ni un decodificador completo de JPEG.

Las imágenes cargadas son borradores hasta Guardar: la ruta pública solo sirve fotos enlazadas a una categoría visible. Al quitarlas dejan de ser públicas. Hay un límite de 20 blobs por categoría (incluye borradores); las cargas sin enlace de más de 24 horas se eliminan en las operaciones de carga/guardado. No hay proceso de limpieza externo ni cambios de infraestructura. Evaluar el tamaño de la base si crece el catálogo.

Configuración y carga requieren autenticación y el permiso granular vigente del Motor de Reservas. No se crean credenciales ni se cambian permisos de roles.

## Advertencia antes de publicar

**La migración NO elige planes por cuenta del hotel. Una categoría sin plan seleccionado no ofrece ventas online**, aunque antes el código hubiera elegido automáticamente el más barato. No publicar sin coordinar la selección de planes y descuentos de cada categoría y verificar fechas de venta. Es una política deliberada de no vender a un precio inferido, no una pérdida de tarifas.

La selección de un plan concreto no cambia automáticamente a otra versión futura cuando ese plan vence. Hace falta elegir el plan correcto. La herencia es del calendario de ese plan, no de cierres que alguien cambie únicamente en una extranet externa.

## Migraciones y configuración

- Se agregan únicamente `booking_engine_configs`, `booking_engine_photos` y `booking_engine_sales` mediante SQL idempotente, llamado desde las migraciones incrementales del servidor. Se probó ejecutar ese SQL dos veces.
- No hay migraciones ejecutadas sobre la base real del hotel ni cambios al esquema de la vista previa principal.
- No requiere nuevas variables de entorno, claves o servicios.
- La preparación para publicar llama `ensureBookingEngineSchema()` desde el arranque y el bootstrap de CI, después de `runMigrations()`. Se conserva intacto `server/migrate.ts`; la migración del motor es aditiva, transaccional, serializada entre instancias y no habilita ventas.
- No ejecutar el arranque/migrador apuntando a producción durante la revisión. Cualquier publicación/migración futura requiere autorización independiente.
- Verificar que el calendario tarifario publicado y sus migraciones existan en la revisión sobre la que se integra el parche.

## Pruebas efectuadas en la entrega original

Desde `.local/booking-engine-review`:

```bash
npx vitest run --config vitest.server.config.ts server/tests/booking-engine.test.ts server/tests/booking-engine-http.test.ts
npx vitest run client/src/pages/admin-booking-engine.test.tsx
bash script/test-booking-engine-isolated.sh
npx tsc --noEmit --pretty false
npm run build
git diff --check
```

Resultados: **42 pruebas de lógica/API/permisos + 4 de interfaz + 7 con PostgreSQL real = 53 aprobadas**. TypeScript y compilación aprobados. La compilación conserva sus avisos de tamaño de bundles; no se intentó resolverlos en este alcance.

La prueba PostgreSQL inicia un cluster nuevo, accesible solo por socket Unix temporal, con esquema y datos sintéticos. No hereda la conexión de la aplicación ni utiliza datos operativos. Al terminar apaga y elimina su propio cluster. Requiere herramientas PostgreSQL disponibles localmente; **no sustituirla por una ejecución sobre DATABASE_URL del hotel**.

Se verificaron persistencia y retiro público de fotos, mantenimiento inclusivo, grupos confirmados/tentativos, cierres, límites de estadía, vigencia, plan/precio manipulados, rollback ante fallo de inserción y competencia de dos confirmaciones por la última habitación. Se verificó también que el alta auditada conserva los precios nocturnos exactos.

La interfaz se verificó mediante pruebas de componentes y una captura aislada con datos ficticios. No se inició sesión ni se completó una reserva desde un navegador contra la base del hotel.

## Revisión sugerida para Codex

1. Confirmar la base actual de GitHub/Railway y comparar estos cambios, sin sobrescribir avances posteriores.
2. Revisar permisos, almacenamiento de fotos, bloqueos/transacciones y cómo se guarda la cotización nocturna confiable.
3. Revisar el permiso existente del Motor para los usuarios que realmente configuran tarifas/fotos.
4. Repetir las pruebas anteriores en un entorno aislado y revisar el flujo visual en un ambiente no productivo.
5. Pedir al propietario los planes/descuentos definitivos y el OK de publicación. **No publicar como consecuencia automática de revisar.**

Fuera de este alcance: pagos online, sincronizaciones OTA, selección comercial real de planes/fotos, verificación de propiedad del email, rediseño de condiciones de menores, e idempotencia de reenvíos de una reserva cuando todavía queda más de una habitación. La prueba de competencia garantiza el cupo de la última habitación; no afirma que cualquier reintento sea una misma operación.


## Correcciones de Codex — 25/11/2026

Trabajo aislado en `fix/booking-engine-review-offline`, sobre GitHub `2ac2ae73a7bdf7ff3f21d169bc6d301d43cf8fff`. No hay publicación, activación online ni modificaciones a bases del hotel.

- Venta pública bloqueada en el servidor por `booking_engine_sales.enabled=false`, independiente de fotos, visibilidad, planes o descuentos. La migración inserta el estado deshabilitado; una fila ausente también bloquea. No se incluye endpoint ni interruptor para activar. Un futuro cambio de ese estado requiere el OK expreso del propietario; configurar categorías no lo habilita. El administrador ve el estado y la web pública muestra contacto del hotel, sin formulario de venta.
- Búsqueda y confirmación validan la misma cantidad de adultos y niños. Se cotiza y guarda el total de pasajeros; las edades quedan en las notas. No se cambian las condiciones comerciales de menores.
- La capacidad web por noche descuenta mantenimientos fechados antes de evaluar los compromisos grupales. Se pasa un mapa de capacidad opcional al guard compartido; los llamadores existentes, incluidas las OTAs, conservan su política.
- Se elimina el lock de toda `rate_calendar_entries`. La confirmación comparte únicamente la fila del plan seleccionado; el calendario y la conversión USD ya bloquean esos planes antes de escribir. Se prueban ambos sentidos de concurrencia: edición del mismo plan sin deadlock y edición de otro plan durante una confirmación.
- Se usan las restricciones existentes solamente para leer y cotizar. La configuración del motor no escribe en `rate_plans`, `rate_calendar_entries`, conexiones, mappings ni settings de Channex. Las futuras reservas autorizadas sí consumirán inventario y seguirán el circuito normal de disponibilidad del PMS/OTA.

Las tres reproducciones de la revisión se convirtieron en pruebas de regresión y pasan. `bash script/test-booking-engine-isolated.sh` incluye pruebas del bloqueo por defecto, configuración, fotos, familias, cupos, concurrencia y preservación de valores OTA reales calculados antes/después. Usa exclusivamente su cluster descartable por socket Unix.

`bash script/test-booking-engine-ota-isolated.sh` levanta otro cluster nuevo accesible solo en loopback y ejecuta las 93 pruebas PostgreSQL existentes de ARI, inbound y conversión USD. Sus transportes son callbacks sintéticos; no hay llamadas a canales reales. El script incluye los defaults de timestamps que esperan los fixtures antiguos, sin ejecutar seeds operativos. Si el puerto del fixture está ocupado, aborta antes de ejecutar pruebas.

La selección de planes y los descuentos comerciales siguen pendientes del hotel. Aun completándolos, las ventas de esta versión continúan deshabilitadas hasta una autorización explícita posterior. No habilitar ventas como parte de integrar o publicar código.
