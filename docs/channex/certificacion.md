# Preparación de certificación PMS de Channex

Fuente de requisitos: texto de «PMS Certification Tests» aportado por el usuario el 29/10/2026; URL https://docs.channex.io/api-v.1-documentation/pms-certification-tests. La guía separada de buenas prácticas y la especificación completa de payloads todavía deben contrastarse antes de una validación externa.

Estado: primera etapa implementada en el PMS, pendiente de conexión y validación real en staging. No se ha enviado la certificación, generado task IDs reales ni habilitado ningún canal. La configuración y el envío están desactivados por defecto. Esto no acredita la integración completa.

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
4. Configurar piso y moneda. Esta versión usa la tarifa base del plan, sin conversión; debe coincidir con la moneda de Channex y cubrir las fechas publicadas. No envía tarifas diferenciadas por ocupación.
5. Activar la integración de prueba prepara dos eventos iniciales, de disponibilidad y de tarifas, con 500 días. Con `CHANNEX_ARI_STAGING_ENABLED` ausente o distinto de `true`, no hay tráfico externo. Esta variable es una segunda habilitación del servidor, no un requisito para editar o consultar el alcance.
6. Para una prueba real, el responsable puede habilitar esa variable únicamente en la instancia de pruebas. Solo se permite `https://staging.channex.io/api/v1` y una conexión `demo`. No se ha configurado esa variable durante este trabajo.
7. Realizar cambios desde Tarifas, Reservas y Planning y comprobar tareas, contenido recibido y estado en Channex. La sincronización completa de recuperación se limita a una cada 24 horas; no se dispara en un temporizador.

No existe una pantalla ni un script que reproduzca las tablas de certificación. Los tests automáticos usan datos sintéticos, una base descartable y transporte remoto sustituido: no se envían a Channex ni se presentan como evidencia de certificación.

## Cobertura y pendientes

| Requisito del documento | Estado después de esta etapa |
| --- | --- |
| 1. Full sync de 500 días, dos llamadas | Preparado para disponibilidad y tarifas base; falta modelo de restricciones y validación real. |
| 2–4. Cambios de tarifas por fecha/período y varios planes | El guardado de tarifas base ya genera eventos. Falta calendario diario y edición conjunta desde las pantallas normales. |
| 5–8. Min stay, stop sell, CTA/CTD, max stay y períodos largos | Pendientes de modelo, interfaz habitual y transformación de restricciones. |
| 9–10. Disponibilidad | Cálculo y eventos implementados para el alcance elegido. Falta demostrar los casos desde la UI contra staging. |
| 11. Reservas | Sigue la bandeja de prueba existente: falta webhook y creación/modificación/cancelación real en el PMS, idempotencia y ACK después de persistir. El reintento actual con `/bookings/:id` debe pasar a revisiones. |
| 12. Límites y reintentos | Implementados y probados localmente; falta comprobarlos contra staging. |
| 13. Solo cambios | Captura transaccional y deltas implementados. Full sync manual/inicial y avance incremental del horizonte. |
| 14. Declaración de capacidades | Pendiente: min stay arrival/through, restricciones, ocupación, tarjetas y alcance de PCI. No se debe afirmar soporte no implementado. |
| Revisión por pantalla compartida / formulario | Pendientes. El formulario se completa con task IDs reales después de ejecutar los casos desde el PMS. |

## Validación de desarrollo

- Suite cliente completa: 850 pruebas aprobadas; incluye la configuración y vista previa del alcance.
- PostgreSQL 16 descartable: 13 pruebas de alcance, grupos, rollback, movimientos, pausa/reanudación, agrupación, deltas, limitación compartida, 429/5xx, guardas y avance del horizonte.
- Pruebas de transporte: payload agrupado, host de staging, rechazo de producción, Retry-After y respuestas inválidas, con fetch sustituido.
- Permisos: se requieren `api:channex:config` para configurar, pedir full sync y reintentar. La lectura exige autenticación.
- TypeScript y compilación de producción se verifican antes del commit.

La prueba de PostgreSQL solo admite la base local descartable `127.0.0.1:55448/channex_test`, o el servicio descartable conocido de CI `localhost:5432/maran_test` con `CI=true`. Crea y elimina un esquema único propio; no usa la base operativa. CI recibe `CHANNEX_TEST_DATABASE_URL` explícitamente.
