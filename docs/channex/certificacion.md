# Preparación de certificación PMS de Channex

Fuente de requisitos: texto de «PMS Certification Tests» aportado por el usuario el 29/10/2026; URL https://docs.channex.io/api-v.1-documentation/pms-certification-tests. La guía separada de buenas prácticas y la especificación completa de payloads todavía deben contrastarse antes de una validación externa.

Estado: captura ARI y calendario de venta por fecha implementados en el PMS, pendientes de conexión y validación real en staging. Los cambios siguen en una rama separada, sin desplegar en la operación actual. No se ha enviado la certificación, generado task IDs reales ni habilitado ningún canal. La configuración y el envío están desactivados por defecto. Esto no acredita la integración completa.

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
| 11. Reservas | Sigue la bandeja de prueba existente: falta webhook y creación/modificación/cancelación real en el PMS, idempotencia y ACK después de persistir. El reintento actual con `/bookings/:id` debe pasar a revisiones. |
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
