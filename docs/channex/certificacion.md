# Preparación de certificación PMS de Channex

Fuente de requisitos: texto de «PMS Certification Tests» aportado por el usuario el 29/10/2026; URL https://docs.channex.io/api-v.1-documentation/pms-certification-tests. La guía separada de buenas prácticas y la especificación completa de payloads todavía deben contrastarse antes de una validación externa.

Estado: captura ARI, calendario de venta y recepción entrante implementados en el PMS, pendientes de conexión y validación real en staging. Los cambios siguen en una rama separada, sin desplegar en la operación actual. No se ha enviado la certificación, generado task IDs reales ni habilitado ningún canal. La configuración y el envío están desactivados por defecto. Esto no acredita la integración completa.

## Flujo integrado en el producto

- La pantalla habitual de tarifas guarda en `rate_plans` desde `server/routes/rooms.ts` y `server/db-storage.ts`. Las reservas, habitaciones, mantenimiento y grupos usan sus tablas operativas habituales.
- `server/channex/ariSchema.ts` instala triggers de cambio en esas tablas. Un cambio y su evento se confirman o revierten juntos en la misma transacción. No hay llamadas a Channex dentro de un guardado del hotel.
- `server/channex/ariWorker.ts` consume únicamente eventos confirmados de `channex_ari_outbox`. `buildAriValues` transforma el estado vigente del PMS; `sendAri` realiza POST a `/availability` o `/restrictions` de staging. Los UUID proceden del mapeo persistido, no de los ejemplos del documento.
- El worker agrupa eventos por conexión y tipo, comprime días contiguos con valores iguales y evita reenviar valores ya publicados cuando no cambiaron. Una sincronización completa solicitada por el usuario incluye los 500 días, aun si no hubo cambios.
- Los contadores y el bloqueo de despacho son compartidos por las instancias del PMS. Cada intento reserva un espacio de 3,1 segundos, con máximo conservador de 20 solicitudes ARI por minuto. Los 429 respetan Retry-After y agregan espera global; 5xx y errores de conexión conservan eventos con backoff. Errores de configuración o 4xx requieren revisión y un reintento explícito.
- Los task IDs devueltos por Channex se guardan con los eventos. Un task ID confirma aceptación del pedido; esta etapa no consulta el estado posterior de la tarea.
- Un envío que se haya aceptado antes de una caída local puede repetirse con valores absolutos actuales. No crea pagos ni reservas. El registro de valores publicados y la confirmación local del evento se guardan juntos.
- El avance diario del horizonte publica solamente los días nuevos del borde de 500 días; no es un full sync periódico. También recupera varios días de interrupción.

## Alcance por piso

En Channex → Mapeo → Inventario y envíos a Channex se eligen piso y moneda y se muestran las habitaciones incluidas. Se usa `rooms.floor`; no se deduce el piso del número de habitación. La propuesta inicial es piso 2. Se excluyen habitaciones virtuales, REUB y habitaciones desactivadas. Habitaciones sucias cuentan como inventario futuro; mantenimiento y fuera de servicio lo descuentan.

La disponibilidad descuenta cada habitación reservada una sola vez, con salida exclusiva. El último día de un bloqueo de mantenimiento es inclusivo, conforme al Planning. Se descuentan conservadoramente los cupos de grupos pendientes de asignación: aunque puedan terminar en otro piso, no se los ofrece simultáneamente en el piloto. Los bloques de un mismo grupo/categoría se suman antes de restar las reservas ya asignadas.

El mapeo local/remoto debe ser completo y uno a uno para categorías. Las tarifas deben pertenecer a la categoría remota correspondiente. Una vez activa la captura, las ediciones de conexión/mapeos se rechazan hasta pausar. Durante la pausa se siguen registrando cambios para no perderlos; no se despachan. Cambiar alcance o mapeo prepara un recálculo para el nuevo estado.

La gestión de mapeos retirados en una propiedad ya vendible —cerrar primero el antiguo inventario remoto— queda para el procedimiento de producción. Esta etapa rechaza envíos a producción, incluso si se cambia la URL o el tipo de conexión.

## Activación para validación externa futura

1. Completar el resto de la integración y revisar la guía de buenas prácticas. Usar una instancia de PMS y una propiedad de Channex de prueba, sin canales reales.
2. Crear la propiedad de certificación, moneda USD, dos categorías y los cuatro planes que solicita el documento, usando datos realistas y variables en el propio PMS.
3. Cargar la credencial desde la pantalla protegida de conexiones; no enviarla por chat ni escribirla en un script. Sincronizar catálogo y mapear identificadores.
4. Configurar piso y moneda. Esta versión usa la tarifa diaria del calendario cuando existe y la tarifa base del plan en las otras fechas, sin conversión; debe coincidir con la moneda de Channex y cubrir las fechas publicadas. No envía tarifas diferenciadas por ocupación.
5. Activar la integración de prueba prepara dos eventos iniciales, de disponibilidad y de tarifas/restricciones, con 500 días. Con `CHANNEX_ARI_STAGING_ENABLED` ausente o distinto de `true`, no hay tráfico externo. Esta variable es una segunda habilitación del servidor, no un requisito para editar o consultar el alcance.
6. Para una prueba real, el responsable puede habilitar esa variable únicamente en la instancia de pruebas. Solo se permite `https://staging.channex.io/api/v1` y una conexión `demo`. No se ha configurado esa variable durante este trabajo.
7. Realizar cambios desde Tarifas, Reservas y Planning y comprobar tareas, contenido recibido y estado en Channex. La sincronización completa de recuperación se limita a una cada 24 horas; no se dispara en un temporizador.

No existe una pantalla ni un script que reproduzca las tablas de certificación. Los tests automáticos usan datos sintéticos, una base descartable y transporte remoto sustituido: no se envían a Channex ni se presentan como evidencia de certificación.

## Cobertura y pendientes

| Requisito del documento | Estado después de esta etapa |
| --- | --- |
| 1. Full sync de 500 días, dos llamadas | Implementado para disponibilidad, tarifas diarias y restricciones; pendiente de validación contra staging. |
| 2–4. Cambios de tarifas por fecha/período y varios planes | Calendario integrado en Planes Tarifarios, con edición conjunta, revisión y guardado atómico. Pruebas locales; pendiente de ejecución real contra staging. |
| 5–8. Min stay, stop sell, CTA/CTD, max stay y períodos largos | Modelo diario, interfaz de venta y transformación implementados para mínimo de llegada y de estadía, máximo, cierres y períodos largos. Pendiente de validar los escenarios en staging. |
| 9–10. Disponibilidad | Cálculo y eventos implementados para el alcance elegido. Falta demostrar los casos desde la UI contra staging. |
| 11. Reservas | Receptor staging, inbox inmutable, ACK tras persistencia y altas/cambios/cancelaciones transaccionales implementados y probados localmente en ARS. Bandeja anterior conservada. Reintento migrado a `/booking_revisions/:id`. Falta validar payloads y webhook reales; reservas en otra moneda o con conflictos quedan para revisión. |
| 12. Límites y reintentos | Implementados y probados localmente; falta comprobarlos contra staging. |
| 13. Solo cambios | Captura transaccional y deltas implementados. Full sync manual/inicial y avance incremental del horizonte. |
| 14. Declaración de capacidades | Ambos mínimos (arrival/through), stop sell, CTA, CTD y máximo implementados. Sigue pendiente decidir/validar tarifas por ocupación, tarjetas y alcance de PCI. |
| Revisión por pantalla compartida / formulario | Pendientes. El formulario se completa con task IDs reales después de ejecutar los casos desde el PMS. |

## Validación de desarrollo

- Suite cliente completa: 854 pruebas aprobadas; incluye la configuración y vista previa del alcance.
- PostgreSQL 16 descartable: 22 pruebas de alcance y calendario, grupos, rollback, movimientos, pausa/reanudación, agrupación, deltas, limitación compartida, 429/5xx, guardas y avance del horizonte.
- Pruebas de transporte: payload agrupado, host de staging, rechazo de producción, Retry-After y respuestas inválidas, con fetch sustituido.
- Permisos: se requieren `api:channex:config` para configurar, pedir full sync y reintentar. La lectura exige autenticación.
- TypeScript y compilación de producción verificados antes del commit.
- Servidor: 25 pruebas de calendario, permisos, cola, credenciales y transporte aprobadas; sin tráfico externo.
- Instalación desde cero: migraciones completas y helpers del calendario/Channex ejecutados en otra base PostgreSQL descartable; verificación de esquema financiero aprobada.
- Regresión sobre ese esquema real: cinco pruebas existentes de tarifas, permisos de Jefatura y errores de validación aprobadas.

La prueba de PostgreSQL solo admite la base local descartable `127.0.0.1:55448/channex_test`, o el servicio descartable conocido de CI `localhost:5432/maran_test` con `CI=true`. Crea y elimina un esquema único propio; no usa la base operativa. CI recibe `CHANNEX_TEST_DATABASE_URL` explícitamente.

## Calendario de venta por fecha

La pantalla normal **Planes Tarifarios → Calendario de venta** consulta el estado por noche y permite editar varios planes y períodos en un único guardado. Es una función operativa para venta por canales, no una interfaz de certificación. El calendario conserva la moneda original y no recalcula reservas, folios ni facturas ya guardados; tampoco reemplaza el cálculo legado de cotización de reservas directas.

`shared/rate-calendar.ts` define valores y validaciones. `server/rates/calendarRoutes.ts` expone la consulta y las acciones de revisión/confirmación bajo el permiso existente `api:rates:write`. `calendarService.ts` calcula una revisión a partir del estado persistido, comprueba su vigencia al confirmar y bloquea los planes en orden estable para evitar sobrescrituras concurrentes. Una operación admite hasta 20 planes, 500 días de horizonte y 5000 plan-noches. Las restricciones contradictorias o los períodos superpuestos con cambios incompatibles se rechazan antes de guardar.

El guardado actualiza `rate_calendar_entries` y su auditoría en una única transacción. Triggers por sentencia agregan los cambios por plan en la misma transacción y los publican en la cola. Un lote grande no se corta al alcanzar 1000 eventos: el worker conserva juntas las transacciones seleccionadas. `buildAriValues` consulta los precios y reglas por fecha del PMS y transforma ambos mínimos, máximo, stop sell, CTA y CTD a los campos de Channex. Al quitar una regla se envía también su valor explícito de apertura/default; omitirlo dejaría el cierre anterior en el canal.

Campos vacíos en la edición conservan valores; `false` abre un cierre y `0` elimina el máximo. Volver a tarifa base quita solo el precio especial y conserva las demás reglas. Los días fuera de la vigencia del plan se identifican en la consulta y no admiten edición. Se usa precio plano por plan; no se publican aún variantes por ocupación.

La suite PostgreSQL comprueba la revisión sin escrituras, guardado múltiple con un envío agrupado, restauración de defaults, herencia del precio base, reversión de calendario/auditoría/outbox ante fallo, revisión vencida y confirmaciones simultáneas. Las pruebas HTTP llaman a las APIs normales del PMS en una base descartable; el transporte Channex está sustituido y no genera evidencia de certificación real.


## Recepción de reservas — desarrollo del 29/10/2026

La rama incorpora los cambios operativos publicados hasta `18fab56c`, sin promover el trabajo de Channex a main ni desplegarlo. La bandeja anterior sigue siendo un preview y nunca crea reservas. La nueva recepción aparece como control independiente junto al alcance de inventario.

### Activación aislada

- El servidor exige `CHANNEX_INBOUND_STAGING_ENABLED=true`, ausente por defecto. No se configuró durante este trabajo. Sin esa variable el webhook responde 404 y el worker no consulta base ni red.
- La conexión debe estar activa, tener entorno `demo`, URL exacta `https://staging.channex.io/api/v1`, alcance ARI configurado y recepción explícitamente habilitada. Ninguno de esos controles habilita producción.
- Desde la configuración de Channex se genera una clave de webhook. Solo se muestra una vez, se guarda su SHA-256 y se verifica en tiempo constante. Se configura como encabezado `X-Channex-Webhook-Token`, nunca como parámetro URL. El token se envía evitando el logger de cuerpos JSON del servidor. Registrar el webhook en el proveedor aún es un paso pendiente de staging; no se efectuó ninguna llamada de configuración remota.
- `POST /api/channex/inbound/:id/notify` es una notificación autenticada y limitada, no una API que acepte reservas del cuerpo. Persiste la solicitud de consultar el feed. Las carreras con un fetch en curso se detectan por versión; el arranque del worker recupera avisos interrumpidos.

### Persistencia y aplicación

`inboundSchema.ts` instala tablas nuevas. La revisión sanitizada y su hash se guardan de forma inmutable por conexión e ID antes de cualquier ACK. El ACK confirma recepción durable, no aceptación comercial ni aplicación al PMS: una revisión conflictiva puede estar confirmada y continuar en la bandeja local de revisión. No se guardan tarjetas, garantías, claves, documentos o notas libres del payload. No se usa esta etapa para PCI.

El worker usa `/booking_revisions/feed` y `/booking_revisions/:id/ack`. Los reintentos de la bandeja anterior usan `/booking_revisions/:id`; se retiró `/bookings/:id`. Los envíos respetan un espacio global persistido de 3,1 segundos y backoff; un 429 conserva Retry-After aun si la respuesta no es JSON. Las redirecciones HTTP no se siguen con credenciales. Una caída después de recibir una respuesta puede repetir el ACK del mismo ID, sin crear otra reserva.

La aplicación usa `storage.createReservation` y `storage.updateReservation` del PMS. El bloqueo existente de inventario se vuelve reentrante dentro de una operación compuesta; los bloqueos financieros de sus reservas se toman en orden y en una única sesión. Habitaciones, huésped, precios nocturnos, auditoría, cursor de revisión y eventos ARI se confirman o revierten juntos. Los precios por noche se conservan exactamente, sin reemplazarlos por una media redondeada.

Se asignan únicamente habitaciones físicas activas del piso configurado, con capacidad y disponibilidad válidas. El mapeo de tarifa debe pertenecer a la misma categoría y moneda. Una reserva múltiple requiere identidades estables por habitación; si falla una parte se revierte toda la revisión. Una referencia externa ya existente sin vínculo de Channex se deriva a revisión, no se fusiona ni se duplica.

Las revisiones antiguas no deshacen las nuevas. Orden temporal ambiguo, colisión de ID, falta de inventario, reservas/huéspedes modificados por el hotel, historias financieras, vínculos grupales, estadías iniciadas o cerradas y reapertura de cancelaciones requieren revisión. No se eliminan ni devuelven cobros, no se emiten facturas y no se crea Caja. Una cancelación con historia financiera queda para intervención operativa, conservando reserva y dinero.

El historial recibido impide eliminar su conexión y exige pausar la recepción antes de cambiar su identidad/credencial. La consulta muestra estados de aplicación y ACK por separado, motivos y reintento de las situaciones revisables. El registro original no se sobrescribe.

### Límites para certificación

El contrato se ha probado con fixtures sintéticos estrictos; no se dispone todavía de un payload completo contrastado de la conexión real ni se verificó la configuración del encabezado del webhook en el proveedor. Campos/identidades desconocidos se conservan de forma sanitizada para revisión y no se adivinan. El detalle de tarifas debe cubrir cada noche y sumar el total; impuestos, extras o descuentos que no coincidan exigen revisión.

La importación automática está limitada a ARS porque el folio actual no modela moneda por reserva. Las pruebas oficiales proponen USD: antes de ejecutar ese escenario hay que resolver explícitamente el soporte de moneda en el PMS o acordar el entorno de validación con Channex. No se ingresan montos USD como si fueran pesos ni se usa un script para simular la aceptación del escenario.

Quedan pendientes la validación real de contrato y mejores prácticas, alta del webhook en staging, observación de sus eventos/ACK, los escenarios completos desde pantallas normales, task IDs reales, formulario y revisión en vivo. Este desarrollo no acredita certificación ni conexión productiva.

### Evidencia local de esta etapa

- 878 pruebas cliente aprobadas, incluidos los controles de recepción.
- 32 pruebas servidor aprobadas: contrato, rutas, autenticación, permisos, transporte de revisiones, credenciales y regresión ARI, sin llamadas externas.
- 39 pruebas PostgreSQL aprobadas: 15 de recepción, 20 del motor nocturno y 4 de la bandeja anterior, con datos ficticios en una base nueva descartable.
- Instalación de esquema completo, TypeScript y compilación de producción verificados localmente.
