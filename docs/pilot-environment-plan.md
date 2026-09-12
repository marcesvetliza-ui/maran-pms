# Plan de ambiente piloto — Maran PMS

**Estado:** Fase 1 (análisis técnico). No se modificó código de aplicación, esquema, configuración de ejecución, variables de entorno, secretos, bases de datos, scripts de datos, workflows ni deployments.

**Alcance de esta fase:** relevamiento en profundidad de emails/notificaciones, reservas, huéspedes, check-in/check-out, disponibilidad, habitaciones, tipos de habitación, tarifas, autenticación/autorización e identificación de base de datos. Facturación/ARCA, Caja, pagos, contabilidad, reportes y configuración se relevaron de forma resumida (con profundización puntual donde se detectó una integración activa real).

Todas las referencias a archivos son rutas reales del repositorio en la rama de este análisis, confirmadas por lectura directa del código — no se asumió ningún nombre.

---

## 1. Resumen ejecutivo

Maran PMS es una aplicación Node.js/Express + React (TypeScript, ESM) con PostgreSQL vía Drizzle ORM. Hoy corre una única instancia para el hotel real, con una única base de datos y sin ningún concepto de "ambiente" persistente más allá de `NODE_ENV` (`development` / `production`).

Hallazgos centrales:

- **No existe ninguna variable ni marca que distinga "piloto" de "producción".** Todo el comportamiento condicional depende de `NODE_ENV`, que solo tiene dos valores reales en uso (`development`, `production`) y controla muy pocas cosas (cookies seguras, exposición de un par de endpoints de diagnóstico, y si se corre `drizzle-kit migrate()` o el camino de migraciones incrementales).
- **Los emails NO se pueden bloquear hoy solo ocultando la interfaz.** El envío depende de una fila de configuración en la base (`email_config.global_enabled` + credenciales SMTP/Resend guardadas en esa misma fila), no de una variable de entorno. Cualquier cambio accidental de esa fila en piloto enviaría correos reales. Además existe un camino independiente (backup automático por email) que **no** respeta ese flag.
- **ARCA (facturación electrónica) ya tiene un modo "ficticio" nativo** (`arcaAmbiente: "ficticio" | "homologacion" | "produccion"`, default `"ficticio"`) que impide llamar a los web services reales de AFIP. Es un buen punto de partida, pero es config de base de datos editable por un admin, no un bloqueo de servidor independiente del ambiente.
- **La autorización por rol en el backend es real pero muy parcial.** Hay un middleware global que exige *estar autenticado* para casi todo `/api/*`, pero el control por **rol** (`requireRole`) solo está aplicado en un subconjunto de rutas (gestión de usuarios, algunas de facturación/reconciliación, altas/bajas de habitaciones-tarifas-inventario, algunas de config). **Reservas, Huéspedes, Planning, Check-in/Check-out, Folios y Caja no tienen ninguna restricción de rol propia**: cualquier usuario autenticado, sin importar su rol asignado (`housekeeping`, `spa`, `restaurant`, etc.), puede leer y escribir en esos módulos vía API, aunque la interfaz le oculte el menú.
- **No existe hoy un usuario "de solo lectura" ni un usuario técnico acotado.** El modelo de roles no soporta permisos por módulo ni de solo-lectura; es binario (autenticado o no) más un puñado de excepciones admin-only.
- Hay una integración externa activa que no estaba en la lista original del pedido y conviene sumar al inventario: un **webhook bidireccional con un chatbot externo ("MARA")** que corre en otro despliegue de Replit.
- No se encontró integración real de WhatsApp, SMS ni pasarela de pagos (Mercado Pago es solo una etiqueta interna que el personal tilda manualmente; no hay llamada a ninguna API de cobro).
- Se detectó un **secreto en texto plano versionado en el repositorio** (`.replit`, variable `CHATBOT_WEBHOOK_SECRET`) y un Sentry DSN también versionado. No es parte del alcance de esta fase corregirlo, pero se documenta como riesgo existente independiente del piloto.

**Recomendación de cierre (ver sección 20):** es seguro continuar con las fases siguientes, pero la Fase con mayor impacto real de seguridad no es la de variables de entorno — es la de autorización backend (Fase 6 propuesta), porque hoy no puede crearse un usuario piloto "seguro por diseño" sin ese trabajo. Ver sección 6 y 18 para el detalle y la decisión pendiente de aprobación.

---

## 2. Arquitectura actual relevante

### Stack y arranque
- Backend: Express + TypeScript (ESM), entrypoint `server/index.ts`.
- Frontend: React 18 + Vite, servido embebido por el mismo proceso Express (`server/vite.ts` en dev, `server/static.ts` en producción).
- ORM: Drizzle sobre `node-postgres` (`server/db.ts`), esquema único en `shared/schema.ts`.
- Sesión: `express-session` + `connect-pg-simple` (tabla `sessions` en la misma base), Passport Local (`server/auth.ts`).

### Secuencia de arranque (`server/index.ts`)
1. Se abre el puerto HTTP **antes** de cualquier inicialización lenta (comentario explícito en el código: los healthchecks de Cloud Run/Railway disparan a los pocos milisegundos).
2. Se valida que existan `DATABASE_URL` y `SESSION_SECRET`; si falta alguna, `process.exit(1)` con mensaje de error (líneas 40-48). Este es el único chequeo de configuración obligatoria al iniciar.
3. Se inicializa Sentry, Helmet, rate limiting (500 req/15min en `/api`, 10 intentos/15min en `/api/auth/login`), parsers JSON.
4. Se registran las rutas (`registerRoutes`).
5. **En background, después de que el puerto ya está abierto:** se corren migraciones (`runMigrations()`), luego `seedDatabase()` y `refreshRealData()` (ambas idempotentes), inicialización de turnos de caja, una decena de `ALTER TABLE ... IF NOT EXISTS` / `INSERT ... ON CONFLICT DO NOTHING` sueltos directamente en `index.ts`, sincronización de secuencias, liberación de mesas de restaurant huérfanas, y arranque de dos schedulers (Night Audit y Backup a las 03:00 ARG).

Esto es importante para el piloto: **las migraciones y el seed corren automáticamente en cada arranque del proceso**, contra cualquier base a la que apunte `DATABASE_URL`. No hay ningún paso manual intermedio hoy. Es una ventaja para bootstrapear un piloto rápido, pero también el motivo por el que la identificación persistente de la base (sección 10) es crítica: si `DATABASE_URL` de piloto apuntara por error a la base de producción, el sistema arrancaría igual y empezaría a escribir ahí sin ninguna advertencia.

### Variables de entorno detectadas (uso real en código, sin exponer valores)
| Variable | Dónde se usa | Efecto |
|---|---|---|
| `NODE_ENV` | `server/index.ts`, `server/auth.ts`, `server/migrate.ts`, `server/sentry.ts`, `server/logger.ts`, `server/routes.ts` | `production` → sirve estáticos, cookie `secure`, exige `SESSION_SECRET`, desactiva `/api/auth/setup` y `/api/source/files`, usa migración incremental en vez de `drizzle-kit migrate()`, formato de logs |
| `ENVIRONMENT` | `server/routes.ts:185` (`/api/health`) | Si está seteada, se muestra en `/api/health` en vez de `NODE_ENV`. **No controla ningún comportamiento**, es solo informativa — ya existe una variable con este nombre pero es puramente cosmética hoy. |
| `DATABASE_URL` | `server/db.ts`, `drizzle.config.ts` | Obligatoria; sin ella el proceso no arranca |
| `SESSION_SECRET` | `server/auth.ts` | Obligatoria en producción; en dev cae a un valor fijo de desarrollo con warning |
| `PORT` | `server/index.ts` | Puerto de escucha, default 5000 |
| `SENTRY_DSN` / `VITE_SENTRY_DSN` | `server/sentry.ts`, build de cliente | Habilita reporte de errores a Sentry si está seteada |
| `AI_INTEGRATIONS_OPENAI_API_KEY` / `OPENAI_API_KEY`, `AI_INTEGRATIONS_OPENAI_BASE_URL` | `server/routes.ts` (chatbot de ayuda interno `/api/help/chat`) | Llamadas a OpenAI para el asistente de staff |
| `MARA_BASE_URL`, `CHATBOT_WEBHOOK_SECRET` | `server/routes.ts` | Integración bidireccional con chatbot externo "MARA" (ver sección 5) |
| `REPLIT_DEPLOYMENT_URL` / `SITE_BASE_URL` | `server/email-service.ts`, `server/routes/emails.ts` | Base URL usada para armar links e imágenes dentro de los emails salientes |

No se encontró ninguna variable existente equivalente a la `APP_ENV` propuesta.

### Build y despliegue actuales
Conviven **tres mecanismos de despliegue distintos** en el repo, lo cual es relevante para la Fase 9 (despliegue manual del piloto):

1. **Replit** (`.replit`): `deploymentTarget = "autoscale"`, build `npm run build`, run `node dist/index.cjs`. Define variables compartidas en `[userenv.shared]`, entre ellas `CHATBOT_WEBHOOK_SECRET` **en texto plano** y el Sentry DSN. *(Riesgo documentado en la sección 3; no se corrige en esta fase.)*
2. **Railway / Nixpacks** (`nixpacks.toml`): instala con `npm ci`, build `npm run build`, arranca con `npm run start`. El comentario en `server/migrate.ts` menciona explícitamente PgBouncer de Railway como la razón por la que en producción no se usa `drizzle-kit migrate()`.
3. **Docker** (`Dockerfile`): build multi-stage, imagen `node:20-slim`, fuerza `NODE_ENV=production`, expone el puerto 5000.

`npm run build` ejecuta `script/build.ts` (no leído en detalle en esta fase, fuera del foco pedido) y `npm start` corre `dist/index.cjs` con `NODE_ENV=production`.

### Comportamiento por hostname/URL
No se encontró lógica de negocio condicionada por hostname o dominio. La única URL configurable por entorno es la usada para armar links dentro de emails (`REPLIT_DEPLOYMENT_URL` / `SITE_BASE_URL`, con fallback hardcodeado a la URL de producción de Replit) y para servir el logo del hotel en los PDFs de facturación (`server/billing/routes.ts:57`).

---

## 3. Riesgos encontrados (consolidado)

| # | Riesgo | Severidad | Dónde |
|---|---|---|---|
| R1 | Emails reales se pueden disparar en piloto si la fila `email_config` queda con `global_enabled=true` y credenciales cargadas (por copia de datos, por error de un admin, o porque el backup automático por email **no** respeta ese flag) | Alta | `server/email-service.ts`, `server/backup.ts` |
| R2 | Ningún módulo de negocio (Reservas, Huéspedes, Planning, Check-in/out, Folios, Caja) tiene control de rol en el backend — solo exige "estar logueado" | Alta | `server/routes/reservations.ts`, `guests.ts`, `planning.ts`, `folios.ts`, `server/adminCash.ts` |
| R3 | ARCA puede pasar a modo real (`homologacion`/`produccion`) con solo cambiar una fila de configuración desde la UI de admin; nada a nivel servidor lo impide hoy fuera del ambiente | Media-Alta | `server/billing/arcaClient.ts`, `billing/routes.ts` |
| R4 | Migraciones y seed corren automáticamente contra cualquier `DATABASE_URL` sin verificar a qué base pertenecen | Media (mitigado por ser idempotentes, pero sin red de seguridad si la URL apunta mal) | `server/index.ts`, `server/migrate.ts` |
| R5 | `CHATBOT_WEBHOOK_SECRET` y el Sentry DSN están versionados en texto plano en `.replit` | Media (preexistente, no introducido por el piloto) | `.replit` |
| R6 | `/api/auth/setup` permite fijar la contraseña del usuario `admin` sin autenticación mientras no exista ningún usuario con password — solo se bloquea si `NODE_ENV==="production"` | Media (mitigada si el piloto corre con `NODE_ENV=production`, pero depende de esa variable y no de una prohibida-por-diseño) | `server/routes.ts:233-271` |
| R7 | La sesión de un usuario desactivado (`isActive=false`) no se invalida de inmediato — `deserializeUser` solo verifica `lockPermanent`, no `isActive` | Media | `server/auth.ts:219-241` |
| R8 | Backup automático diario envía un dump SQL completo de la base por email si está configurado — sin relación con `email_config.global_enabled` | Media | `server/backup.ts` |
| R9 | No existe ninguna identidad persistente de la base de datos; nada impide que el mismo proceso corra por error contra la base de producción | Alta (para la fase de identidad de base) | Transversal |

---

## 4. Inventario de integraciones externas

| Integración | Módulo/archivo | Qué la activa | Datos que envía | Config | ¿Sandbox/ficticio? | Riesgo en piloto | Cómo bloquear | Qué registrar | Cómo probar el bloqueo |
|---|---|---|---|---|---|---|---|---|---|
| **Email (Resend API o SMTP)** | `server/email-service.ts`, `server/routes/emails.ts`, `server/routes/{reservations,events,restaurant,spa}.ts` | Confirmación de reserva, recordatorio pre-checkin, email post-checkout, envío de comprobantes/recibos con PDF adjunto, test de configuración desde admin | Nombre y datos del huésped, fechas de estadía, PDFs de folio/factura/recibo | Fila única en tabla `email_config` (no env var): `global_enabled`, `provider` (`resend`/`smtp`), credenciales | No — hay un flag `global_enabled` (default `false` en el seed) pero no un modo sandbox real | **Alto** — es la prioridad #1 del piloto | Gate de servidor en `sendEmail()`/`sendEmailWithPdfAttachment()`/`sendViaSmtp`/`sendViaResend` que corte antes de llamar a la red si `APP_ENV !== "production"`, sin depender de `cfg.globalEnabled` | Registro `skipped` en `email_logs` con motivo explícito ("bloqueado por ambiente piloto"), sin exponer credenciales | Forzar una confirmación de reserva en piloto y verificar en `email_logs` que quedó `status=skipped` y que no hubo tráfico saliente |
| **Backup por email** | `server/backup.ts` (`sendBackupByEmail`, scheduler 03:00 ARG) | Botón manual admin o scheduler diario | Dump SQL completo de la base (todas las tablas) | `system_settings` (auto-enabled/target) + `email_config` (SMTP) | No | **Alto** — expone TODOS los datos de la base por email si se dispara, y hoy no respeta `global_enabled` | Mismo gate de ambiente, aplicado también en `sendBackupByEmail` (no solo en `email-service.ts`) | `backup_logs` ya registra destino/estado; agregar motivo "bloqueado por ambiente" | Intentar "Enviar backup ahora" en piloto y verificar `backup_logs.status=error/blocked` |
| **ARCA / AFIP (facturación electrónica)** | `server/billing/arcaClient.ts`, `wsaaClient.ts`, `wsfevClient.ts`, `billing/routes.ts` | Emisión de factura A/B/C, notas de crédito/débito | CUIT/DNI del cliente, importes, tipo de comprobante | Fila `billing_config`: `arcaAmbiente` (`ficticio`\|`homologacion`\|`produccion`), certificado y clave privada | **Sí** — ya existe modo `"ficticio"` (default) que corta antes de llamar a AFIP; `homologacion` es el sandbox real de AFIP | Media-Alta si alguien cambia el ambiente a `homologacion`/`produccion` en piloto | Confirmado hoy en código: solo llama a `wsaa.afip.gov.ar` / WSFEv1 si `ambiente !== "ficticio"`. Para piloto: forzar server-side que `arcaAmbiente` sea siempre `"ficticio"` cuando `APP_ENV=pilot`, ignorando el valor guardado en config | Log de intento bloqueado, sin CUIT ni certificado | Cambiar `arcaAmbiente` a `homologacion` en la config de piloto e intentar facturar; debe seguir usando modo ficticio igual |
| **Webhook chatbot "MARA" (entrante)** | `server/routes.ts` (`POST /api/webhook/chatbot`) | Mensajes entrantes del bot externo (housekeeping/mantenimiento/restaurant/spa/recepción) | `guestName`, `roomNumber`, `reservationId`, mensaje, `sessionId` | Ruta pública (fuera del middleware de auth), protegida por header `X-Chatbot-Secret` comparado contra `CHATBOT_WEBHOOK_SECRET` (env, con fallback autogenerado en `system_settings`) | No | Media — es una ruta pública sin autenticación de sesión; el secreto compartido está versionado en `.replit` (ver R5) | En piloto, requerir un secreto propio de piloto (no el de producción) — nunca el mismo valor | Ya hay log de intentos con secreto inválido (`console.warn`) | Enviar un POST sin secreto o con el secreto de prod y confirmar 401 |
| **Webhook chatbot "MARA" (saliente)** | `server/routes.ts:1151-1167` | Al cambiar estado de una notificación con `sessionId` | Nombre del huésped, mensaje de estado | `MARA_BASE_URL` + `CHATBOT_WEBHOOK_SECRET` (env) | No | Media — envía datos de huésped a un servicio externo (hoy es el mismo bot de producción) | En piloto: no configurar `MARA_BASE_URL`, o apuntarlo a un endpoint de pruebas; agregar gate por `APP_ENV` igualmente por defensa en profundidad | Ya loguea error de envío; agregar log explícito de "omitido por ambiente" | Actualizar estado de una notificación de prueba y confirmar que no sale el `fetch` |
| **OpenAI (chatbot de ayuda interno)** | `server/routes.ts` (`POST /api/help/chat`) | Consulta de un usuario de staff al asistente | Pregunta del staff (operativa, no debería incluir PII de huéspedes salvo que el usuario la escriba) | `AI_INTEGRATIONS_OPENAI_API_KEY` / `OPENAI_API_KEY` | No | Baja-Media | Usar una API key propia de piloto (o sin key, que ya cae a `"no-key"` y falla controladamente) | No hay logging de contenido hoy | Preguntar algo al asistente en piloto y confirmar que no usa la key de producción |
| **Sentry** | `server/sentry.ts`, cliente | Errores no controlados (5xx) | Stack trace, método/ruta/status, id/username/role del usuario logueado | `SENTRY_DSN` / `VITE_SENTRY_DSN` (versionado en `.replit`, ver R5) | No | Baja — es observabilidad, no comunicación con el huésped, pero mezclaría errores de piloto con los de producción si comparten DSN | Usar un proyecto/DSN de Sentry separado para piloto, o desactivarlo | Ya es un servicio externo de logging | Generar un error en piloto y confirmar que aparece en el proyecto de Sentry de piloto, no en el de producción |
| **Mercado Pago** | `server/payment-method.ts`, `db-storage.ts`, rutas de pagos | — | — | — | — | **No hay integración real.** Es solo una etiqueta que el personal tilda al registrar un cobro manual (efectivo/tarjeta/transferencia/Mercado Pago/cuenta corriente/voucher); no hay llamada a ninguna API de cobro | No requiere bloqueo técnico — no hay salida externa | — | — |
| **WhatsApp / SMS** | — | — | — | — | — | **No se encontró ninguna integración.** Solo se menciona como texto dentro de `server/help-manual.ts` (contenido de ayuda al usuario) | No aplica | — | — |
| **Chat / Imagen de Replit (`replit_integrations/`)** | `server/replit_integrations/chat/*`, `image/*` | — | — | — | — | **Código sin usar.** `registerChatRoutes` y las rutas de imagen no están importadas ni registradas en `server/routes.ts` — no forman parte de la superficie activa | No aplica hoy | — | — |

---

## 5. Análisis prioritario de emails y notificaciones (riesgo especial)

Todos los puntos de envío de email pasan, en algún momento, por dos funciones core: `sendEmail()` (confirmación/recordatorio/checkout, ligadas a una reserva) y `sendEmailWithPdfAttachment()` (comprobantes de eventos/restaurant/spa, backup), ambas en `server/email-service.ts`, más el envío de backup independiente en `server/backup.ts::sendBackupByEmail`.

**Puntos de disparo confirmados por código:**
1. `sendConfirmationEmail` — al crear una reserva y al confirmar una reserva existente (`server/routes/reservations.ts:312, 575`).
2. `sendCheckoutEmail` — al hacer check-out (`server/routes/reservations.ts:1525`).
3. Recordatorio pre-llegada — `runReminderScheduler` (`server/email-service.ts`, invocado desde `server/routes/emails.ts`).
4. Comprobantes con PDF adjunto — `events.ts:1133`, `restaurant.ts:2216`, `spa.ts:2072` (recibos/facturas enviados manualmente por el staff).
5. Test de configuración de email desde el panel de admin (`server/routes/emails.ts`).
6. Backup automático diario (03:00 ARG) y backup manual "enviar ahora" (`server/backup.ts`).

**No existe recuperación de contraseña por email** (no hay flujo de "olvidé mi contraseña" — los usuarios los gestiona un admin desde `/api/admin/users`), así que ese vector no aplica.

**Punto crítico:** el interruptor que hoy existe (`email_config.global_enabled`) es una fila de base de datos editable desde la UI de admin por cualquier usuario con rol `admin`. Si se clona/copia esa configuración al piloto, o si alguien la activa por error durante una demo, los emails saldrían con destinatarios reales tomados de los datos ficticios (o peor, si algún dato ficticio quedara con un email real por error de carga). Lo mismo aplica al backup por email, que ni siquiera respeta ese flag.

### Recomendación

Se evaluaron las dos opciones pedidas:

- **Opción 1 — bloqueo completo de todo email cuando `APP_ENV !== "production"`.**
- **Opción 2 — redirección controlada a una casilla de pruebas.**

**Se recomienda la Opción 1 (bloqueo completo) para la primera versión del piloto.** Redirigir a una casilla de pruebas sigue dependiendo de que el código de redirección esté bien puesto en *todos* los puntos de salida (son al menos 4 funciones distintas en 2 archivos), y un solo punto que se escape ya reintroduce el riesgo. Un bloqueo total, implementado como un único gate al principio de cada función de envío real (`sendViaSmtp`, `sendViaResend`, y el `transport.sendMail` de `sendBackupByEmail`) que corte con un log `skipped`/`blocked` antes de tocar la red, es más simple de auditar y de probar. La redirección a bandeja de pruebas puede evaluarse en una fase posterior si el piloto necesita ver el contenido real de los emails.

---

## 6. Matriz de rutas y autorización

**Alcance de la matriz** (según lo acordado): rutas que el Channel Manager necesitaría, rutas accesibles para el futuro usuario piloto visual, y operaciones sensibles que deben quedar prohibidas. No se listan endpoints internos sin relación con el piloto.

Contexto de lectura: **todo `/api/*` exige sesión autenticada por defecto** (middleware global en `server/routes.ts:273-300`), excepto `/api/auth/login`, `/api/auth/logout`, `/api/auth/me`, `/api/auth/setup`, `/api/health`, `/api/public/*`, `/api/webhook/chatbot` (POST) y `/api/survey/*`. Donde la tabla dice "Solo autenticación", significa que **cualquier rol** (incluso `housekeeping` o `spa`) pasa ese control.

| Grupo | Método/ruta (representativa) | Propósito | Autenticación | Rol requerido | ¿Solo controlado por UI? | Riesgo para usuario externo | Recomendación |
|---|---|---|---|---|---|---|---|
| **Disponibilidad / Planning** | `GET /api/planning` | Grilla de reservas por rango de fechas | Sí (global) | **Ninguno** | Sí — no hay `requireRole` en `planning.ts` | Un usuario piloto ve el planning completo, incluida cualquier reserva cargada, sin restricción de módulo | Cerrar con rol dedicado antes de dar acceso externo |
| **Disponibilidad** | `GET /api/rooms/available` | Disponibilidad por fechas/tipo | Sí (global) | Ninguno | — | Es la que necesitaría el Channel Manager (lectura) — bajo riesgo en lectura | Exponer vía API acotada, no vía sesión de usuario |
| **Habitaciones** | `GET /api/rooms`, `GET /api/rooms/:id` | Listado/detalle | Sí (global) | Ninguno | — | Bajo (lectura) | — |
| **Habitaciones (escritura)** | `POST/PATCH/DELETE /api/rooms` | Alta/baja/edición de habitación física | Sí | `ROOMS_WRITE_ROLES` (`server/routes/rooms.ts`) | No — sí tiene `requireRole` | Bajo si el usuario piloto no tiene ese rol | Ya está protegido |
| **Tipos de habitación** | `GET /api/room-types` | Listado | Sí (global) | Ninguno | — | Bajo | — |
| **Tipos de habitación (escritura/integridad)** | `POST/PATCH/DELETE /api/room-types`, `/integrity*` | Alta/baja/reparación | Sí | `ROOMS_WRITE_ROLES` / `ROOM_TYPE_ADMIN_ROLES` | No | Bajo | Ya está protegido |
| **Tarifas / planes tarifarios** | `GET /api/rate-plans*` | Consulta de tarifas | Sí (global) | Ninguno | — | Es lo que necesitaría el Channel Manager (lectura) | Exponer vía API acotada |
| **Tarifas (escritura)** | `POST/PATCH/DELETE /api/rate-plans` | Alta/edición de tarifas | Sí | `RATES_WRITE_ROLES` | No | Bajo si el rol piloto no lo incluye | Ya está protegido |
| **Reservas** | `GET/POST/PATCH /api/reservations*` (creación, modificación, cancelación) | CRUD completo de reservas | Sí (global) | **Ninguno propio del módulo** — `server/routes/reservations.ts` no usa `requireRole` en ninguna de sus 37 rutas autenticadas | Sí — solo la UI oculta acciones | **Alto** — cualquier usuario autenticado puede crear, modificar o cancelar cualquier reserva, incluidas las reales si compartiera base | Requiere trabajo de autorización (ver decisión pendiente, sección 18) antes de dar una cuenta a un tercero |
| **Check-in / Check-out** | rutas dentro de `reservations.ts` (p. ej. check-in, check-out, checkout múltiple) | Cambio de estado operativo de la estadía | Sí (global) | **Ninguno propio** | Sí | **Alto** — mismo problema que Reservas | Mismo tratamiento que Reservas |
| **Huéspedes** | `GET/POST/PATCH/DELETE /api/guests*` | CRM de huéspedes (datos personales, notas, alertas, deuda) | Sí (global) | **Ninguno propio** — `server/routes/guests.ts` no usa `requireRole` | Sí | **Alto** — expone datos personales de huéspedes reales a cualquier cuenta autenticada | Igual que Reservas |
| **Folios** | `GET/POST /api/*/folio*` | Movimientos financieros consolidados por reserva/grupo | Sí (global) | **Ninguno propio** — `server/routes/folios.ts` no usa `requireRole` | Sí | **Alto** — movimientos financieros sin control de rol | Igual que Reservas |
| **Caja** | rutas en `server/adminCash.ts` | Apertura/cierre de turno, movimientos, arqueo | Sí (global) | **Ninguno propio** — 0 usos de `requireRole` en todo el archivo | Sí | **Alto** — cualquier cuenta autenticada puede operar la caja | Igual que Reservas; particularmente sensible para un usuario piloto |
| **Facturación (ARCA)** | `POST /api/billing/invoices` (emisión) | Emitir comprobante fiscal | Sí (global) | **Ninguno propio** en la emisión estándar — solo un subconjunto (reconciliación de notas de crédito, borrado de no-fiscales) usa `requireRole(["admin","administracion", ...])` | Parcial | **Alto** si `arcaAmbiente` no está fijo en modo ficticio (ver R3) | Bloqueo de ambiente (sección 4) + revisar si el usuario piloto debería poder emitir algo |
| **Configuración** | `/api/system-settings/*` | Config general del sistema | Sí | `admin` (bloqueo a nivel de router: `app.use("/api/system-settings", requireRole(["admin"]))`) | No | Bajo si el usuario piloto no es admin | Ya está protegido |
| **Usuarios** | `/api/system-users/*`, `/api/admin/users*` | Gestión de cuentas | Sí | `admin` | No | Bajo | Ya está protegido |
| **Reportes financieros** | rutas bajo `server/reports/routes.ts` | Reportes ejecutivos/contables | Sí (global) | No se encontró `requireRole` específico | Sí | Medio-Alto — expone datos financieros agregados a cualquier autenticado | Evaluar si el usuario piloto necesita ver reportes; si no, no debería tener ni siquiera esta lectura |

**Conclusión de esta sección, tal como pidió el pedido original:** **hoy no puede crearse un usuario "realmente acotado" a Reservas/Disponibilidad/Habitaciones sin una modificación de autorización más amplia que agregar un rol nuevo a la tabla `requireRole`.** El motivo es que los módulos más sensibles (Reservas, Huéspedes, Check-in/out, Folios, Caja) directamente no tienen ningún punto de control de rol donde enganchar una restricción — habría que agregarlo. No es un cambio enorme en términos de líneas de código (agregar `requireRole([...])` a las rutas de escritura de esos módulos, siguiendo el mismo patrón ya usado en `rooms.ts`/`inventory.ts`), pero es un cambio transversal a varios archivos grandes (`reservations.ts` tiene 3664 líneas, `guests.ts` 941, `groups.ts` 3063) y **no se hizo ni se debe hacer en esta fase de solo análisis.**

---

## 7. Usuario visual frente a API de integración

### Acceso visual (para que la empresa de Channel Manager conozca la interfaz)
Dado el hallazgo de la sección 6, **una cuenta de sesión normal (login + contraseña) no es hoy un límite de seguridad real** para nadie fuera del rol `admin`: cualquier rol puede leer/escribir Reservas, Huéspedes, Folios y Caja vía API, no solo vía lo que la UI le muestra. Antes de entregar una cuenta de este tipo a un tercero externo hace falta, como mínimo, agregar `requireRole` a los módulos listados en la sección 6 (trabajo de una fase futura, ver sección 15).

### Acceso técnico (Channel Manager)
Se recomienda **una API acotada, separada del login del PMS**, no una cuenta completa. Motivos:
- Menor privilegio: el Channel Manager solo necesita disponibilidad, tarifas, restricciones, altas/bajas/modificaciones de reserva — nunca Caja, Folios, Huéspedes fuera de lo estrictamente necesario para la reserva, ni Configuración.
- Una cuenta de sesión hereda automáticamente todo lo que hoy no tiene rol propio (ver sección 6) — es decir, sería un acceso mucho más amplio que el que el proveedor necesita.
- Autenticación de servicio a servicio (API key o client credentials) es más fácil de rotar, loguear y revocar de forma independiente del sistema de usuarios humanos (`system_users`), que hoy está pensado para personas con contraseña, no para integraciones.

Arquitectura recomendada (sin diseñar todavía el detalle, tal como se pidió):
- Tabla propia de credenciales de integración (no reutilizar `system_users`), con: proveedor, ambiente (piloto/producción), estado (activa/revocada), fecha de expiración, alcance (qué operaciones puede hacer), y idealmente un secreto rotable (no una contraseña de usuario humano).
- Middleware propio (separado de `requireAuth`/`requireRole`) que valide esa credencial contra endpoints específicos, no contra todo `/api/*`.
- Idempotencia: cada operación de reserva/modificación/cancelación entrante debería aceptar (o requerir) un identificador de idempotencia del proveedor, para evitar duplicados en reintentos — esto **no existe hoy** en las rutas de reservas.
- Límite de solicitudes (rate limiting) específico por credencial, además del rate limiting global ya existente (`express-rate-limit`, 500 req/15min hoy es un límite compartido por toda la IP/app, no por integración).
- Separación estricta por proveedor (Siteminder, Channex, etc. cada uno con su propia credencial) y por ambiente (piloto ≠ producción, nunca la misma credencial en los dos).

**No se diseña ni implementa la API en esta fase.** Cuando se defina el proveedor concreto (el pedido menciona ya una cercanía con Siteminder y Channex), habrá que solicitar su documentación oficial de certificación antes de tocar código de integración — el pedido original ya lo marca como fuera de alcance sin esa documentación.

---

## 8. Estado de vencimiento y revocación de usuarios

Campos existentes hoy en `system_users` (`shared/schema.ts:1841-1857`): `isActive` (string "true"/"false"), `lockedAt`, `lockReason`, `lockPermanent`, `failedLoginCount`, `lastLogin`.

| Necesidad | ¿Existe hoy? | Detalle |
|---|---|---|
| Usuario activo/inactivo | Sí | `isActive`, chequeado en el login (`server/auth.ts:135`) |
| Bloqueo temporal por intentos fallidos | Sí | 5 intentos → bloqueo 1h; 8 intentos → bloqueo permanente (`server/auth.ts:13-16`) |
| Revocación inmediata (cerrar sesión activa ya abierta) | **Parcial** | `deserializeUser` (`server/auth.ts:219-241`) solo invalida la sesión si `lockPermanent==="true"`. Si un admin simplemente desactiva a un usuario (`isActive=false`), **la sesión ya abierta sigue funcionando** hasta que expire (TTL de 8h en el store, o hasta cerrar el navegador) — no se revisa `isActive` en cada request |
| Fecha de vencimiento (expiración automática) | **No existe** | No hay campo `expiresAt` ni verificación de fecha |
| Cierre de sesiones existentes on-demand | **No existe una función real.** Hay un endpoint `/api/admin/security/rotate-session` (`server/routes.ts:2944`) pero solo genera y guarda un valor nuevo en `system_settings`; no se aplica al middleware de sesión en caliente (el secreto de sesión se lee una sola vez al arrancar el proceso) — es engañoso, no cumple lo que su nombre sugiere |
| Identificación individual por proveedor (para credenciales de integración) | **No existe** — no hay concepto de "cuenta de servicio" separado de usuario humano |

**Esfuerzo estimado para lo que falta:**
- Corregir `deserializeUser` para que también invalide por `isActive=false`: **pequeño** (una condición adicional, ya existe el patrón).
- Agregar `expiresAt` a `system_users` y verificarlo en login + deserialize: **pequeño-mediano** (migración de columna + dos chequeos).
- Cierre de sesión real on-demand (borrar filas de la tabla `sessions` del usuario): **pequeño** (la tabla ya existe vía `connect-pg-simple`).
- Tabla de credenciales de integración por proveedor con expiración/revocación propia: **mediano-grande**, es la base de la Fase 6/7 futura (sección 15).

No se creó ningún usuario ni contraseña en esta fase.

---

## 9. Propuesta de `APP_ENV`

No implementada todavía (según instrucción). Propuesta:

```
APP_ENV=development | test | pilot | production
```

- **Dónde validarla:** al inicio de `server/index.ts`, junto a la validación existente de `DATABASE_URL`/`SESSION_SECRET` (líneas 40-48), antes de abrir cualquier conexión real. Debe ser una función pura y testeable (para poder cubrirla con un test unitario en la fase de implementación), no código inline.
- **Valores aceptados:** los cuatro de arriba, sin distinción de mayúsculas/minúsculas para evitar errores de tipeo, pero normalizados a minúscula internamente.
- **Ante un valor desconocido:** fallar el arranque (`process.exit(1)`) con un mensaje claro — el mismo patrón que ya existe para variables faltantes. No usar un default silencioso a `production`, porque eso es exactamente el tipo de error que un piloto mal configurado no debe poder cometer en silencio.
- **Compatibilidad durante la transición:** mientras no todos los entornos tengan `APP_ENV` seteada, se recomienda:
  1. Si `APP_ENV` no está seteada, derivarla de `NODE_ENV` (`production`→`production`, cualquier otra cosa→`development`) y emitir un `console.warn` recomendando fijarla explícitamente — nunca fallar el arranque por su ausencia todavía.
  2. Una vez que producción y el futuro piloto tengan `APP_ENV` seteada explícitamente, recién ahí exigirla de forma obligatoria (igual que hoy es obligatoria `DATABASE_URL`).
- Los puntos de bloqueo de comunicaciones (sección 4/5) deben leer `APP_ENV`, no `NODE_ENV` — hoy varios chequeos (`/api/auth/setup`, `/api/source/files`) usan `NODE_ENV==="production"` directamente, lo cual significa que un piloto corrido con `NODE_ENV=development` (por ejemplo, para tener stack traces más verbosos) dejaría esos endpoints de diagnóstico/setup abiertos. Al introducir `APP_ENV`, conviene migrar esos chequeos puntuales a `APP_ENV !== "production"` también, sin tocarlos en esta fase.

---

## 10. Propuesta de identidad persistente de base de datos

Hoy: **no existe ningún mecanismo.** Nada en el esquema, en `system_settings`, ni en ninguna tabla identifica a qué ambiente pertenece una base.

### Mecanismo propuesto
Una tabla dedicada, no reutilizar `system_settings` (para que no se pueda editar por accidente desde una pantalla genérica de configuración):

```
database_identity
  id            (fijo, ej. 1 — fila única)
  environment   ('development' | 'test' | 'pilot' | 'production')
  created_at
  locked_by     (quién la marcó, auditoría)
```

No debe depender de: nombre de la base, URL de conexión, hostname, dominio, ni de la presencia de la palabra "pilot" en ningún string — tal como pidió el análisis, porque todos esos valores son fáciles de copiar por error junto con el resto de una configuración clonada.

### Etapa A (preparar, sin bloquear)
1. Crear la tabla `database_identity` (migración nueva, aditiva, no destructiva).
2. Endpoint/script manual de un solo uso para marcar una base existente (ninguna base existente hoy tiene esta marca — hay que decidir explícitamente qué es cada una la primera vez).
3. Mientras una base no tenga fila en `database_identity`, el sistema sigue funcionando igual que hoy (compatibilidad total) — solo se loguea un `warn` de "base sin identidad registrada".
4. Documentar el procedimiento manual: qué instrucción SQL/script correría, qué efecto tiene (una sola fila insertada, reversible con un `DELETE` mientras no esté activa la Etapa B), cómo verificarlo (`SELECT * FROM database_identity`).

**Ninguna instrucción de este tipo se ejecutó contra ninguna base real en esta fase.**

### Etapa B (activar validación obligatoria)
1. Al arrancar, leer `database_identity.environment` y compararlo contra `APP_ENV`.
2. Si `APP_ENV=production` y la base está marcada `pilot` (o viceversa) → **fallar el arranque antes de aceptar tráfico**, con un mensaje explícito.
3. Si la base no tiene fila (`database_identity` vacía) en este punto → también fallar, salvo un modo de "primera vez" explícito y deliberado (por ejemplo, una variable de entorno separada tipo `ALLOW_UNIDENTIFIED_DB=true`, pensada para usarse una sola vez al crear cada ambiente nuevo).

Esta migración a Etapa B **no debe activarse sobre producción sin revisión y autorización explícita** — es, en la práctica, la fase con más capacidad de "romper" el arranque de producción si se hace mal (por ejemplo, si producción nunca llegó a marcarse), así que se recomienda tratarla como su propia fase pequeña y cuidadosa, con la validación primero en modo "solo advertir" (`warn` sin bloquear) antes de pasar a "bloquear".

---

## 11. Plan de adopción en dos etapas (resumen transversal)

Tanto `APP_ENV` como la identidad de base siguen el mismo patrón general:
1. Agregar sin exigir (compatibilidad).
2. Advertir cuando falta.
3. Recién en una fase posterior separada, exigir y bloquear.

Esto evita que la introducción de estos controles sea, en sí misma, un riesgo de interrumpir producción.

---

## 12. Datos ficticios necesarios

Entidades mínimas para un piloto funcional (según lo pedido): tipos de habitación, habitaciones, tarifas, planes tarifarios, disponibilidad, huéspedes ficticios, reservas ficticias, usuarios de prueba.

**Hallazgo relevante:** ya existe `seedDatabase()` (`server/seed.ts:38`), que es **idempotente** (no hace nada si `room_types` ya tiene filas) y que hoy corre automáticamente en cada arranque del proceso, en cualquier ambiente. Sobre una base nueva y vacía, genera automáticamente tipos de habitación, y (a juzgar por el tamaño del archivo, 115KB) probablemente bed types, habitaciones, tarifas y datos de ejemplo adicionales — no se leyó el archivo completo en esta fase por no ser el foco pedido, pero es una base reutilizable, no algo para reconstruir desde cero.

Propuesta para el futuro `npm run seed:pilot` (sin implementar aún, según instrucción):
- No debe ser simplemente "correr `seedDatabase()` de nuevo" — debe ser un script propio y explícito, porque `seedDatabase()` actual corre implícitamente en cada boot y no tiene ninguna de las verificaciones de seguridad pedidas.
- Antes de insertar nada: verificar `APP_ENV==="pilot"` Y `database_identity.environment==="pilot"` (cuando exista la Etapa A/B de la sección 10) — doble verificación, no una sola.
- Requerir una confirmación explícita (flag `--yes` o variable de entorno dedicada), no correr automáticamente al bootear el proceso.
- Idempotente donde sea razonable (igual que el seed actual).
- No copiar nada de otra base — generar datos desde cero, con nombres/emails evidentemente ficticios (ej. dominio `@ejemplo-piloto.test`, nunca un dominio real).
- No crear contraseñas fijas en el repositorio — generarlas al vuelo y mostrarlas una sola vez por consola (nunca commitear un valor).
- No imprimir secretos de conexión ni tokens.

---

## 13. Auditoría y trazabilidad

Lo que ya existe:
- Tabla `audit_logs` (`shared/schema.ts:1892-1904`) con: `userId`, `userName`, `action` (create/update/delete/login/logout/export), `module`, `entityType`, `entityId`, `description`, `details` (JSON libre), `ipAddress`, `timestamp`. Se escribe vía el helper `audit()` (`server/audit.ts`), invocado hoy principalmente en login/logout y en un subconjunto de operaciones administrativas (no en todas las rutas de negocio).
- Tabla `failed_login_attempts` (`shared/schema.ts:1859-1868`): usuario, IP, user agent, sessionId, status, detalle — ya cubre buena parte de lo pedido para intentos de login.
- `email_logs` y `backup_logs`: ya registran envíos/omisiones con motivo, reutilizables tal cual para los bloqueos de piloto (secciones 4/5).

Lo que faltaría agregar para cubrir lo pedido sobre credenciales de Channel Manager/usuario piloto:
- `audit_logs.details` es JSON libre — puede usarse para guardar proveedor, correlación/idempotencia, origen de la solicitud, sin cambiar el esquema. Es el camino de menor esfuerzo.
- No hay hoy un campo dedicado para "proveedor" ni "resultado" tipado — se podría seguir usando `details` mientras el volumen de integraciones sea bajo (un solo Channel Manager en piloto), y evaluar columnas dedicadas si crece.
- `audit()` no se llama hoy desde `reservations.ts`, `guests.ts`, `folios.ts` para operaciones de negocio comunes (crear/modificar/cancelar reserva) — solo para un subconjunto administrativo. Si se quiere trazabilidad completa de lo que haga un usuario/credencial piloto, hay que agregar esas llamadas en los módulos sensibles — trabajo transversal, ligado a la misma fase de autorización (sección 6).

No se debe registrar (y hoy no se registra, según lo revisado): contraseñas, tokens, cookies, datos completos de tarjetas. `audit_logs.details` es JSON libre así que su uso correcto (no volcar el `req.body` completo sin filtrar) es una responsabilidad de implementación a cuidar en la fase correspondiente.

---

## 14. Indicadores visuales

No implementado en esta fase (según instrucción). Dónde correspondería:
- Pantalla de login: banner fijo, no solo color, con el texto `AMBIENTE PILOTO — DATOS DE PRUEBA`.
- Layout principal del panel (un componente de layout compartido en `client/src`, a identificar en la fase de implementación) — banda persistente, visible en todas las páginas, no un simple cambio de color de fondo.
- PDFs generados en piloto (folios, facturas, recibos — `server/billing/invoicePdf.ts`, `groupPaymentReceiptPdf.ts`, `eventPdfs.ts`, `spaPdfs.ts`, `restaurantPdfs.ts`): agregar una marca de agua o encabezado con el mismo texto, para que ningún PDF de prueba pueda confundirse con uno real si se comparte fuera del sistema.
- El indicador debería leer `APP_ENV` (no `NODE_ENV`) una vez que exista, para que un piloto corrido con `NODE_ENV=production` (probablemente el caso, para que se comporten igual en seguridad) igual muestre el aviso.

---

## 15. Procedimiento futuro de aislamiento

Diseño del procedimiento (no ejecutado en esta fase):

1. Verificar `database_identity` de ambas bases (piloto = `pilot`, producción = `production`).
2. Confirmar URLs de aplicación distintas (piloto no debe resolver al mismo dominio que producción).
3. Confirmar que `DATABASE_URL`, `SESSION_SECRET`, `CHATBOT_WEBHOOK_SECRET`, credenciales de email y de ARCA son todos distintos entre ambos ambientes (revisar valores solo por comparación de que existen y difieren, nunca imprimirlos).
4. Crear una reserva ficticia en piloto (usando `seed:pilot` o manualmente).
5. Confirmar en la base de producción (por acceso separado de un admin, no desde la app) que esa reserva no aparece.
6. Intentar una operación externa sensible desde piloto (ej. forzar un envío de email de confirmación).
7. Confirmar en `email_logs`/logs de aplicación que quedó bloqueada.
8. Revisar `audit_logs` de piloto y confirmar que la operación bloqueada quedó registrada.
9. Revocar el usuario o credencial piloto usada en la prueba.
10. Confirmar que ya no puede autenticarse ni operar (requiere primero resolver R7 — revocación inmediata de sesión, sección 8).

---

## 16. Procedimiento futuro de despliegue manual

Dado que hoy conviven tres mecanismos de despliegue (Replit, Railway/Nixpacks, Docker — sección 2), la propuesta paso a paso deberá decidir primero **cuál de los tres** aloja el piloto (probablemente el mismo que producción, para minimizar diferencias de comportamiento, pero como proyecto/servicio separado). Pasos generales, sin ejecutar nada en esta fase:

1. Nuevo servicio/deployment separado del de producción (no un segundo dominio del mismo servicio).
2. Nueva base PostgreSQL, provisionada independientemente.
3. Variables propias: `APP_ENV=pilot`, `DATABASE_URL` de la base nueva, `SESSION_SECRET` propio, `CHATBOT_WEBHOOK_SECRET` propio (o ausente), credenciales de email/ARCA ausentes o explícitamente en modo ficticio.
4. Migraciones: correrán automáticamente al primer arranque (comportamiento actual, sección 2) — verificar que terminan sin error contra una base vacía.
5. Marcar la identidad de la base como `pilot` (Etapa A de la sección 10) antes de dar por completado el paso anterior.
6. Ejecutar `seed:pilot` (una vez implementado, sección 12) de forma deliberada.
7. Crear el usuario/credencial temporal para el tercero (una vez resuelta la fase de autorización, sección 6/7).
8. Correr la prueba de aislamiento completa (sección 15).
9. Apertura del acceso externo (compartir URL/credenciales) recién después de que el paso anterior pase.
10. Cierre del acceso externo al finalizar la demo/certificación (revocación, sección 8).

---

## 17. Fases posteriores recomendadas, con esfuerzo y riesgo

| Fase | Objetivo | Alcance | Archivos/áreas probables | Riesgo | Esfuerzo aprox. | Dependencias | Pruebas necesarias | Criterio de aceptación |
|---|---|---|---|---|---|---|---|---|
| 2 | `APP_ENV` + validación al iniciar | Agregar variable, validarla, modo compatibilidad | `server/index.ts` | Bajo | Pequeño (0.5–1 jornada) | Ninguna | Unit test de la función de validación; arranque manual con valor inválido | Arranque falla con valor desconocido; sigue funcionando sin la variable (modo compatibilidad) |
| 3 | Bloqueo de comunicaciones reales (emails, backup por email, ARCA) | Gate por `APP_ENV` en los puntos exactos de la sección 4 | `server/email-service.ts`, `server/backup.ts`, `server/billing/arcaClient.ts` (y equivalentes en `billing/routes.ts`, `invoiceService.ts`) | Medio (tocar rutas de envío real) | Mediano (2–3 jornadas) | Fase 2 | Tests que simulen `APP_ENV=pilot` y verifiquen que no se llama a `fetch`/`sendMail`; verificar `email_logs`/`backup_logs` | Ningún email/backup/factura real sale estando en modo piloto, verificado por test automatizado, no solo manual |
| 4 | Identidad persistente de base (Etapa A) | Tabla + script de marcado manual, sin bloquear | Migración nueva, `server/db.ts` o módulo nuevo | Bajo (aditivo) | Pequeño (1 jornada) | Ninguna | Test de que el sistema arranca igual con y sin la fila | Tabla creada; procedimiento documentado y probado en una base de desarrollo |
| 5 | Identidad persistente de base (Etapa B) | Activar bloqueo obligatorio | Mismo módulo que Fase 4 + `server/index.ts` | **Alto** (puede impedir el arranque de producción si algo está mal marcado) | Pequeño en código, pero requiere ventana de verificación cuidadosa | Fase 4, todas las bases marcadas | Arranque contra base marcada mal → falla; contra base marcada bien → arranca | Producción marcada y verificada ANTES de activar el bloqueo; ensayo primero en modo "solo advertir" |
| 6 | Autorización por rol en módulos sensibles (Reservas, Huéspedes, Check-in/out, Folios, Caja) | Agregar `requireRole` siguiendo el patrón ya usado en `rooms.ts`/`inventory.ts` | `server/routes/reservations.ts`, `guests.ts`, `folios.ts`, `server/adminCash.ts`, posiblemente `groups.ts` | Medio-Alto (superficie grande, riesgo de romper flujos existentes del hotel real si se restringe mal) | Grande (posiblemente varias jornadas, requiere definir qué rol puede hacer qué) | Ninguna técnica, pero requiere una decisión de negocio (sección 18) | Tests de regresión por rol en cada endpoint tocado | El personal actual del hotel sigue operando sin fricción; un rol nuevo "piloto/lectura" no puede escribir en estos módulos |
| 7 | Indicadores visuales de piloto | Banner en login/panel/PDFs | Layout de `client/src`, generadores de PDF en `server/` | Bajo | Pequeño-mediano (1–2 jornadas) | Fase 2 | Verificación visual manual + snapshot si existe | Aparece en las 3 superficies pedidas, no depende solo de color |
| 8 | Script `seed:pilot` | Datos ficticios controlados | Nuevo script en `script/`, reutilizando partes de `server/seed.ts` | Medio (evitar que corra en producción) | Mediano (2 jornadas) | Fases 2 y 4 | Test que confirme que se niega a correr fuera de `APP_ENV=pilot` | Falla explícitamente si se corre contra producción; genera datos evidentemente ficticios |
| 9 | Credenciales de integración (API acotada) | Tabla + middleware propio, sin implementar el protocolo del Channel Manager todavía | Módulo nuevo `server/integrations/` (a definir) | Medio | Grande (varias jornadas, depende del alcance final) | Fases 2, 4, 6 | Tests de expiración/revocación | Una credencial revocada deja de funcionar de inmediato |
| 10 | Auditoría ampliada | Llamadas a `audit()` en módulos sensibles + campos de proveedor/correlación | `server/audit.ts` y los mismos módulos de la Fase 6 | Bajo | Pequeño-mediano | Fase 6 | Verificar que cada operación sensible deja rastro | Toda operación de un usuario/credencial piloto queda en `audit_logs` |
| 11 | Prueba de aislamiento end-to-end | Ejecutar el procedimiento de la sección 15 | — | Bajo (es verificación, no cambio de código) | Pequeño | Fases 2–10 completas | Es la prueba en sí | Los 10 puntos de la sección 15 pasan |
| 12 | Despliegue manual del piloto | Ejecutar sección 16 | Infraestructura, fuera del repo | Medio (operativo, no de código) | Depende del proveedor de hosting elegido | Todas las anteriores | Smoke test post-deploy | Piloto accesible, aislado, verificado |

Estas estimaciones son comparativas y pueden cambiar al revisar detalles específicos de cada fase.

---

## 18. Decisiones que requieren aprobación

1. **¿En qué orden priorizar la Fase 6 (autorización por rol) respecto de las demás?** Es la de mayor esfuerzo y mayor impacto en el uso diario del hotel real (aunque el cambio se probaría contra el ambiente de piloto/desarrollo, toca archivos que también sirven a producción). Recomendación: hacerla temprano (antes de dar cualquier acceso externo), pero después de tener el bloqueo de comunicaciones (Fase 3) funcionando, ya que ese es más urgente y más aislado.
2. **Qué infraestructura aloja el piloto** (Replit / Railway / Docker en otro proveedor) — condiciona el detalle de la Fase 12 y algunas variables de entorno.
3. **Alcance exacto del "usuario visual" para la empresa de Channel Manager**: ¿ve reportes financieros? ¿ve Huéspedes con datos completos (aunque sean ficticios)? Esto define cuánto hay que restringir en la Fase 6.
4. **Si Sentry de piloto debe ser un proyecto separado o simplemente desactivarse** — impacta si se puede diagnosticar errores del piloto o no.
5. **Umbral de "listo para dar acceso externo"**: ¿se exige que la Fase 6 (autorización) esté completa antes de la primera demo con Siteminder/Channex, o alcanza con la Fase 3 (bloqueo de comunicaciones) + una cuenta admin de piloto usada solo por personal interno para la demo (sin entregar credenciales al proveedor todavía)? Esto podría acelerar una primera demo visual sin esperar el trabajo más grande de autorización.

---

## 19. Riesgos pendientes (no resueltos por este análisis, para que quede explícito)

- R5 (secreto `.replit` versionado) y el Sentry DSN versionado: preexistentes, no introducidos por este trabajo, pero quedan documentados porque afectan a producción hoy y deberían tratarse en algún momento independientemente del piloto.
- R6 (`/api/auth/setup` gateado por `NODE_ENV` en vez de por autenticación real): funciona hoy porque producción corre con `NODE_ENV=production`, pero es un patrón fragil — cualquier ambiente nuevo que no fije esa variable correctamente queda expuesto.
- R7 (revocación de sesión no inmediata vía `isActive`): afecta también a producción hoy, no es exclusivo del piloto.
- No se auditó en esta fase el detalle completo de `server/routes/groups.ts` (3063 líneas) más allá de confirmar el patrón general de autorización — dado que Grupos comparte folios/pagos con Reservas, debería incluirse en el mismo trabajo de la Fase 6.
- No se leyó `script/build.ts` en detalle (fuera del foco pedido); si el piloto necesita un build distinto al de producción, revisarlo en la Fase 12.

---

## 20. Recomendación sobre si es seguro continuar

**Sí, es seguro continuar con las fases siguientes**, en este orden de prioridad según lo relevado:

1. Fase 2 (`APP_ENV`) — base para todo lo demás, bajo riesgo.
2. Fase 3 (bloqueo de comunicaciones reales) — la de mayor urgencia real, dado que hoy nada impide técnicamente que un piloto mal configurado envíe un email o intente facturar de verdad.
3. Fase 4 (identidad de base, Etapa A) — bajo riesgo, aditiva.
4. Fase 6 (autorización por rol) — antes de entregar cualquier acceso a un tercero externo, sin excepción. No es seguro dar una cuenta de "solo mirar" a nadie fuera del equipo hasta que esta fase exista, porque hoy esa cuenta tendría acceso de escritura real a Reservas, Huéspedes, Folios y Caja.
5. El resto de las fases (5, 7–12) pueden reordenarse según prioridad de negocio, ya que dependen de las anteriores pero no bloquean la seguridad básica entre sí.

No se encontró ningún hallazgo que sugiera que el piloto sea inviable o que el código no soporte esta separación — el sistema ya tiene varios de los mecanismos base necesarios (modo ficticio de ARCA, flag de email, tablas de auditoría, sesiones en base separable). El trabajo pendiente es de **conectar esos mecanismos a un ambiente explícito** y de **cerrar la autorización por rol donde hoy no existe**, no de construir desde cero.

---

## 21. Auditoría final (Fase 8)

Con las Fases 2 a 7 implementadas y fusionadas en `feature/pilot-environment`
(incluyendo dos fixes de producción traídos de `main` sin conflicto:
`82b5b7e` y `bcfc57a`), esta fase revisa el conjunto completo antes de
continuar. No se ejecutó ningún deployment ni se marcó ninguna base — es
una auditoría de código y de resultados de tests, exclusivamente.

### 21.1 Middleware `piloto_externo` (Fase 6)

- Se confirmó que ningún archivo de rutas (`reservations.ts`, `guests.ts`,
  `folios.ts`, `adminCash.ts`, `billing/routes.ts`, `routes.ts`) cambió
  desde el commit de la Fase 6 — el relevamiento de endpoints que sustenta
  las reglas de `server/pilot-external-role.ts` sigue siendo exacto.
- El middleware está registrado una única vez, en el punto correcto (después
  de `requireAuth`, antes de todas las rutas de negocio).
- Se repitió la batería exhaustiva: 118/118 tests (reglas puras + HTTP
  end-to-end contra `registerRoutes` real) siguen pasando sin cambios.
- **Hallazgo (preexistente, fuera del alcance de este trabajo):**
  `GET /api/debug/assets` y `GET /descargar-colobig-pdf`
  (`server/index.ts`) se registran directamente sobre `app` **antes** de
  que se invoque `registerRoutes()`. Como Express despacha en orden de
  registro, ambas rutas responden antes de llegar tanto a `requireAuth`
  como al middleware `piloto_externo` — quedan accesibles sin
  autenticación para cualquiera, independientemente del rol. Esto es
  anterior a todo el trabajo del piloto (ya vivía en `main`/producción) y
  no fue introducido por ninguna fase de este plan. `/api/debug/assets`
  solo expone booleanos de existencia de archivos y `cwd`/`NODE_ENV` (bajo
  riesgo); `/descargar-colobig-pdf` sirve un PDF real de
  `attached_assets/` sin autenticación. Se documenta para que el equipo
  decida si amerita corrección independiente — no se tocó en esta fase por
  ser código de producción ajeno al alcance del piloto.

### 21.2 Bloqueo de comunicaciones externas (Fase 3)

- Se confirmaron los 8 puntos de bloqueo (`email` ×2, `email-backup`,
  `arca` ×6 distribuidos en `wsaaClient`, `wsfevClient`, `invoiceService`,
  `wsaaDebug`, `billing/routes`, `mara-inbound`, `mara-outbound`) presentes
  y sin cambios desde su commit original.
- 46/46 tests de bloqueo (`external-comms-policy`, `arca-comms-block`,
  `email-service-comms-block`, `backup-comms-block`,
  `email-test-route-comms-block`, `mara-comms-block`,
  `wsaa-debug-comms-block`) siguen pasando.
- Las dos excepciones documentadas (OpenAI en `/api/help/chat`, descarga de
  `logoUrl` en `loadLogoBuffer()`) siguen intactas, tal como se decidieron
  explícitamente en la Fase 3 (Opción B). El riesgo de SSRF de `logoUrl`
  sigue documentado y sin corregir — es una decisión pendiente, no un
  olvido.

### 21.3 Separación piloto/producción

- `server/app-env.ts` y `server/database-identity.ts` sin cambios desde
  sus fases; 49/49 tests (`app-env.test.ts`, `database-identity.test.ts`)
  pasando.
- `isPilotEnv()`/`isProductionDataEnv()` son mutuamente excluyentes por
  construcción (comparan contra un único valor de `AppEnv`), sin
  superposición posible.
- Los indicadores visuales (banner + marca de agua en PDF, Fase 5) leen
  `APP_ENV` del servidor vía `/api/health`, nunca una variable de
  build-time del cliente — confirmado sin cambios.
- La cuenta de demo `piloto_externo` (Fase 7) solo se crea cuando
  `!isProductionDataEnv()`; confirmado con test que nunca se crea en
  producción aunque la base esté vacía.
- **Observación (comportamiento preexistente, no introducido por el
  piloto):** el resto de `seedDatabase()` (habitaciones, huéspedes,
  reservas, etc.) no está condicionado por `APP_ENV` — se ejecuta en
  cualquier ambiente si la tabla `room_types` está vacía. En la práctica,
  una base de producción real nunca debería estar vacía después del
  arranque inicial, pero queda documentado como una dependencia implícita
  de que nadie apunte `APP_ENV=production` a una base recién creada sin
  datos.
- La identidad de base sigue en Etapa A (advierte, no bloquea) — la Etapa
  B (bloqueo obligatorio) sigue explícitamente diferida a una fase futura,
  como se decidió en la Fase 4.

### 21.4 Credenciales

- La contraseña de demo de la cuenta `piloto_externo` (definida en
  `server/seed.ts`) solo aparece ahí y en su test unitario — no se filtró a
  documentación, mensajes de commit ni logs (`console.log` solo imprime
  que se está creando la cuenta, nunca el valor). **No se reproduce en
  este documento**, según lo pedido.
- Se revisó el diff completo de todos los commits del piloto
  (`c3832d6..HEAD`) buscando patrones de secretos/API keys/tokens: los
  únicos hallazgos son valores de prueba evidentemente ficticios ya
  existentes en los tests de la Fase 3 (`"test-secret"`, `"re_test_key"`,
  etc.), usados para mockear, no credenciales reales.
- `attached_assets/` no fue tocado por ningún commit de este trabajo
  (`git diff --stat` vacío entre el inicio del piloto y este punto).
- Se detectó una contraseña hardcodeada preexistente y ajena a este
  trabajo (`"maran2026"`, bootstrap del usuario admin en
  `POST /api/auth/setup`, deshabilitado fuera de `NODE_ENV=development`) —
  ya vivía en `main` antes de la Fase 1 y queda fuera de alcance.

### 21.5 Suites completas — comparación final contra el baseline

| Suite | Resultado | Comparación |
|---|---|---|
| `npm run check` (typecheck) | 0 errores | Igual que en cada fase anterior |
| Cliente (`vitest.config.ts`) | 43/43 archivos, 219/219 tests | Sin cambios desde la Fase 5 |
| Servidor (`vitest.server.config.ts`) | 53/61 archivos, 471/471 tests | Los 8 archivos que fallan son exactamente los mismos de siempre (`Error: DATABASE_URL must be set` — el sandbox no tiene esa variable configurada, no es una regresión de código) |
| PostgreSQL (`vitest.server.pg.config.ts`) | 14 failed / 5 skipped, 15 tests skipped | Idéntico al baseline conocido en todas las fases anteriores |
| `git diff --check` | limpio | — |

No se encontró ninguna regresión atribuible al trabajo del piloto en
ninguna de las 7 fases implementadas.

---

## 22. Procedimiento de despliegue inicial, marcado de identidad y verificación

Procedimiento concreto para cuando se decida desplegar el piloto (no
ejecutado en esta fase — sección puramente documental, según lo pedido).
Reemplaza en detalle a la sección 16 (que seguía siendo un diseño de la
Fase 1); la elección de infraestructura sigue pendiente (decisión 2 de la
sección 18).

### 22.1 Despliegue inicial

1. Nuevo servicio, separado del de producción, con su propia base
   PostgreSQL (nunca la de producción, nunca una copia de ella).
2. Variables de entorno propias del servicio piloto:
   - `APP_ENV=pilot` y `NODE_ENV=production` (la única combinación válida
     para `pilot` — ver Fase 2, `server/app-env.ts`).
   - `DATABASE_URL` de la base nueva del piloto.
   - `SESSION_SECRET` y `CHATBOT_WEBHOOK_SECRET` propios, distintos de los
     de producción.
   - Sin credenciales reales de email/ARCA configuradas (el bloqueo de la
     Fase 3 ya lo exige fail-closed fuera de `APP_ENV=production`, pero no
     configurarlas es una capa adicional).
3. Primer arranque: las migraciones corren automáticamente
   (`runMigrations()`, comportamiento existente) — verificar que terminan
   sin error contra la base vacía.
4. En el mismo primer arranque, `seedDatabase()` puebla la base con el
   dataset ficticio completo, incluida la cuenta `piloto_externo` (Fase 7,
   gateada por `!isProductionDataEnv()`).

### 22.2 Marcado de identidad de base (Fase 4, Etapa A)

5. Correr `script/mark-database-identity.ts` **en modo dry-run primero**
   (comportamiento por defecto, sin `--confirm`) contra la base del
   piloto, y revisar la salida.
6. Si es correcta, volver a correrlo con
   `--environment=pilot --confirm`. Nunca usar `--force` salvo que se
   quiera remarcar deliberadamente una base ya marcada.
7. Esto es aditivo y no bloqueante (Etapa A): el arranque del servidor
   seguirá funcionando igual con o sin esta fila — es una guarda manual,
   no automática, por lo que no debe omitirse aunque nada la exija
   técnicamente.

### 22.3 Verificación posterior

8. `GET /api/health` responde `appEnv: "pilot"` e `isPilot: true`.
9. La pantalla de login muestra el banner "Ambiente piloto — datos de
   prueba" (ícono + texto, no solo color).
10. Cualquier página autenticada muestra la misma banda persistente.
11. Un PDF generado (factura o folio) muestra la marca de agua diagonal.
12. Confirmar que una acción de comunicación externa real queda bloqueada
    (por ejemplo, un intento de envío de email de prueba) — sin enviar
    nada real.
13. Iniciar sesión con la cuenta `piloto_externo` (la contraseña se
    entrega por separado, no vive en este documento) y confirmar:
    - Acceso normal a Reservas, Huéspedes, Check-in/out, Folios (lectura)
      y Caja operativa.
    - Un 403 real del backend al intentar una acción bloqueada (por
      ejemplo, anular una reserva) — no alcanza con que la opción esté
      oculta en la interfaz.
14. Confirmar la fila de `database_identity` con el CLI del paso 5/6 (modo
    lectura) — nunca imprimir `DATABASE_URL`.
15. Recién después de que todo lo anterior pase, compartir la URL y las
    credenciales con el tercero externo (vendedor de Channel Manager).
16. Al finalizar la demo o certificación: revocar o desactivar la cuenta
    `piloto_externo` (cambiar su contraseña o marcar `isActive=false`).
    Tener en cuenta la limitación ya documentada (R7, sección 19): la
    revocación por `isActive` no invalida una sesión ya iniciada de forma
    inmediata.

Para la prueba de aislamiento completa entre piloto y producción (que no
depende de este procedimiento y puede repetirse independientemente), ver
sección 15.
