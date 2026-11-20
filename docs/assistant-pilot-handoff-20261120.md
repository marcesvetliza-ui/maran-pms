# Chat de soporte de Xenia: entrega revisable del 20/11/2026

El chat existente ya permitía conversar, conservar casos y solicitar revisión de
propuestas. Esta entrega reúne mensajes, aclaraciones, diagnósticos, decisiones
y resultados informados en una sola cronología; preserva su procedencia y
agrega una evaluación pequeña con presupuesto propio. La validación local está
ejecutada. La publicación y la evaluación con un proveedor real están pendientes.

Objetivo del piloto: poder usarlo y evaluar su utilidad antes del 30/11. La prueba
de restauración de Aurora queda pausada; según Marcelo, Aurora sigue conectado a
su base original. Este trabajo no requiere cambiar esa conexión.

## 1. Inventario y diferencias respecto del resumen recibido

| Elemento | Estado comprobado y alcance de la evidencia |
| --- | --- |
| Repositorio | `marcesvetliza-ui/maran-pms` |
| Base revisada | `feature/xenia-support-approval-foundation`, commit `bc8e64f080711bba9b36b83cc955c2afde935fec`, obtenido de GitHub; integra cambios de Maran del 15/11 y conserva el piloto |
| Rama anterior de avance | `advance/assistant-pilot-20261114`, commit `63b34fcc6d3e3bc94d04c8e71a76d48102625ebe`; no se usa para retroceder la integración del 15/11 |
| Candidato de esta entrega | `feat/xenia-assistant-handoff-20261120`, derivado de la base anterior; el SHA final debe tomarse del commit/PR, no de este documento antes de confirmarlo |
| `main` observado | `41edab2c8b2b103bb1fe346ab0d6455ae2ca9b0d`; referencia observada, no evidencia del commit publicado en Maran; no se integra esta entrega allí |
| PMS del piloto | Servicio `maran-pms`, `demo.maranpms.com.ar`, según la configuración documentada; versión y flags publicados hoy pendientes de comprobar con el operador |
| Asistente normal | Servicio `charismatic-wonder`, entrada `services/programming-assistant/index.ts`, base propia `assistant-db`; distinto del ejecutor de evaluación |
| Ejecutor de evaluación | `support-codex-evaluation`, `Evaluation.Dockerfile`, entrada `evaluation-models-entry.ts`; no es el servidor del chat |
| Evaluaciones anteriores | `docs/asistente-evaluacion-railway.md` registra fallos parciales y una tanda en `2db71b27` con tres casos, 17 turnos, 49.187 tokens y US$0,10660265 estimados; su calidad no se aceptó. Son registros históricos, no una ejecución repetida ni verificada contra el proveedor hoy |
| Gateway y contratos | `server/routes/programming-support.ts`, `shared/programming-support.ts`, `shared/support-chat.ts`; identidad y permisos se resuelven en el servidor |
| UI | `/programming-support`, `programming-support.tsx`, `support-chat-panel.tsx`, `support-change-review.tsx` |
| Motor técnico | `codex-investigator.ts`, transporte Responses, lectura acotada del código, revisión y correcciones; se conserva el circuito existente |
| PostgreSQL usado hoy | Clúster local desechable PostgreSQL 17.11, sólo socket Unix; no se utilizó una conexión suministrada ni una base del hotel |
| Herramientas locales | Node 24.19.0, Chromium local; los Dockerfiles de producción usan Node 22. No se ejecutó la imagen Docker completa |

El adjunto `Texto pegado.txt` tiene SHA-256
`f00ad65b31321b2ada2d7bf2aff68142ba1df9725d77e2fa4ed1fd2204a8565c`.
Contiene requisitos y nombres de archivos, no resultados verificables de una
evaluación nueva. No se recibieron los directorios `fuentes/`, `casos/`,
`comparacion/` ni `MANIFIESTO.json` que menciona. Se usaron los casos y registros
históricos versionados en el repositorio, sin cambiar sus etiquetas para mejorar
el resultado.

Las consultas anónimas a `demo.maranpms.com.ar` devolvieron HTTP 403 desde esta
herramienta. Eso limita nuestra verificación remota: no demuestra que el chat
esté caído ni que la versión candidata esté desplegada. El `healthz` de Aurora
que Marcelo compartió corresponde al PMS de alojamiento QA y no identifica al
asistente de soporte.

## 2. Cronología y naturaleza de cada antecedente

| Momento | Registro | Tipo y consecuencia |
| --- | --- | --- |
| 09/11, registro del código | Perfil `gpt53codex-2026-11-09` con US$10 para un lote técnico de tres casos | Antecedente acotado; no autoriza una tanda nueva ni consumo ilimitado |
| Tandas anteriores, guía versionada | Cortes `codex_budget`, `next_turn_reservation`, `codex_provenance` y una tanda completada sin aceptación de calidad | Resultados históricos documentados, con limitaciones y parciales conservados; no equivalen a validación del chat de esta entrega |
| 14/11, rama anterior | Chat persistente, cuotas y preparación de propuestas ya implementados | Hecho del repositorio; por sí solo no prueba configuración ni calidad del modelo publicado |
| 15/11, integración | Commit `bc8e64f0` incorpora cambios funcionales de Maran al piloto | Base utilizada; no se reemplaza por una rama anterior |
| 20/11, conversación | Marcelo pide priorizar el asistente antes del 30/11 | Decisión del usuario sobre prioridad |
| 20/11, conversación | Marcelo confirma que Aurora mantiene la base original | Observación confirmada por el operador; no se hizo una comprobación de su conexión desde esta entrega |
| 20/11, adjunto | Inventario, requisitos de chat, pruebas, evaluación y límites de autorización | Alcance solicitado; las pruebas propuestas no se contabilizan como ejecutadas |
| 20/11, trabajo local | Cambios de cronología, errores y ejecutor; pruebas sin proveedor real | Hechos verificables en archivos, comandos y recibos de esta entrega |

La nueva cronología muestra cada mensaje con su clasificación disponible. Un
diagnóstico conserva el `reportId`, la revisión, la certeza y el estado de
validación que estampó el servidor cuando se generó. Un informe posterior no
reescribe la clasificación del mensaje anterior. Los mensajes históricos sin
esos datos siguen siendo mensajes del asistente: no se les inventa procedencia.

«Sustentado en código» significa evidencia del código leído, no reproducción del
incidente del hotel. «El colaborador informó que quedó resuelto» no equivale a
una reparación comprobada. Las decisiones muestran actor, comentario e identidad
del candidato; escribir «aprobado» en el chat nunca crea una autorización.

## 3. Cambios implementados

- `shared/support-timeline.ts`: reúne mensajes, eventos del workflow y feedback
  por fecha, sin modificar los registros originales. Distingue hipótesis,
  aclaración, verificación incompleta, preparación autorizada y simulación.
- `shared/programming-support.ts` y `chat-service.ts`: procedencia opcional para
  compatibilidad histórica, escrita exclusivamente por el servidor. Las entradas
  de chat siguen siendo esquemas estrictos y rechazan identidad o certeza
  propuestas por el cliente.
- `support-chat-panel.tsx`: presenta la cronología unificada. El componente de
  revisión mantiene sus decisiones y evita repetir el historial en el chat.
- `chat-conversation.ts`: un contexto demasiado extenso produce un límite
  explicable, conserva el caso y no se confunde con consumo incierto del proveedor.
- `evaluation-profile.ts` y `evaluation-models.ts`: conservan el guard de revisión
  y permiten inspeccionar la selección sin clave ni inferencia. La salida de
  errores sólo incluye metadatos permitidos.
- `chat-evaluation*.ts`: ensayo sintético pequeño del mismo conversador y medidor
  monetario del chat, con rúbrica separada, registro de fallos y presupuesto nuevo.
- Scripts reproducibles de PostgreSQL propio y navegador. No importan ni ejecutan
  operaciones del hotel.

La persistencia admite hasta 200 mensajes por caso según el límite existente.
Cada llamada conversacional recibe las últimas 40 intervenciones, la consulta
inicial y el contexto de revisión que suministra `context.ts`, incluidos hasta
cinco comentarios de revisión. No es memoria ilimitada ni un resumen semántico
de toda la conversación. El historial extenso permanece disponible para lectura;
si el contexto excede el límite, se explica cómo iniciar otra consulta pertinente.

## 4. Pruebas ejecutadas y límites

Los recibos completos se entregan fuera del repositorio en
`entregas/xenia-asistente-20261120`. Los proveedores, el correo y las operaciones
citadas por las pruebas son simulados. Ninguno de estos resultados certifica la
calidad de un modelo real ni una emisión fiscal.

| Comprobación | Resultado | Qué acredita |
| --- | --- | --- |
| Suite de asistente anterior a los cambios | 299 pruebas aprobadas | Base de regresión local, sin llamadas pagadas |
| Suite final de asistente | 321 aprobadas, 30 archivos | Evidencia, aclaraciones, revisión, límites, cronología, guard y medidor de evaluación |
| Gateway y workflow | 19 aprobadas, 2 archivos | Permisos del servidor, solicitudes estrictas, aprobación ligada a reporte, digest y revisión; aprobación antigua invalidada |
| Frontend dirigido | 30 aprobadas, 3 archivos | Envío, error, reintento, lectura de otro propietario, estados de revisión e historial anterior |
| PostgreSQL sintético | 28 aprobadas, 6 archivos, sin omisiones | Persistencia, aislamiento, continuación, límites monetarios, reconciliación, propuestas e invalidación |
| Navegador Chromium | Envío nativo, error, reintento, cronología y recarga aprobados | Componente React real con backend HTTP simulado; dos solicitudes con la misma clave producen un solo trabajo sintético |
| TypeScript | Aplicación y servicio aprobados | Compatibilidad estática del código compilado |
| Compilación | PMS y cuatro bundles del servicio/evaluación aprobados | Compilación local; no acredita arranque de imágenes Docker ni publicación |
| Evaluación histórica `--dry-run --runs=3` | Ejecutada en modo preparación | Genera manifiesto; no invoca modelos; usa el evaluador histórico Chat Completions, no prueba el chat Responses actual |
| Acciones `revision` y `chat-plan` del bundle nuevo | Ejecutadas sin claves | 0 generaciones; detectan la falta de identidad real del despliegue y configuración |

La integración nueva recorrió un caso con **34 mensajes y 17 respuestas
simuladas**, comprobó el historial guardado y el reintento final, y negó acceso a
otro usuario. Otro caso guardó 41 mensajes con contexto excesivo y devolvió un
límite antes de invocar al proveedor. La cronología también se probó con 45
mensajes históricos. Los escenarios existentes verifican continuar tras una
aclaración, incorporar ajustes del revisor y no preparar otro cambio cuando la
corrección ya existe (`no_change`/`verification`).

Las regresiones del motor cubren el detalle del error de recetas, atribución de
la causa a la ruta pertinente, evidencia que respalda una afirmación y separación
entre facturación, pagos, Caja, NC, aplicación local y fechas fiscales. Son
pruebas de código y proveedores simulados: no se reproduce una operación real
ni se convierte una prueba leída por el investigador en una prueba ejecutada.

Comandos reproducibles desde la raíz del candidato:

```bash
npm run test:assistant
npx vitest run --config vitest.server.config.ts server/tests/programming-support-gateway.test.ts server/tests/support-change-workflow.test.ts
npx vitest run client/src/components/support-chat-panel.test.tsx client/src/components/support-change-review.test.tsx client/src/pages/programming-support.test.tsx
npm run test:assistant:postgres
node script/verify-support-chat-browser.mjs
npx tsc -p services/programming-assistant/tsconfig.json --incremental false
npm run check
npm run build
npm run eval:assistant -- --dry-run --runs=3
```

El script PostgreSQL requiere binarios locales; `ASSISTANT_TEST_PG_BIN` permite
indicar su carpeta. Crea y elimina su propio clúster sin escuchar en TCP. Ignora
`DATABASE_URL` externa y quita credenciales de proveedores al proceso de pruebas.
El navegador requiere Chromium o `PLAYWRIGHT_CHROMIUM_EXECUTABLE`. Las pruebas no
requieren claves reales. El build del PMS regenera `client/src/buildTime.ts`;
ese cambio generado no forma parte del parche funcional.

## 5. Evaluación real: preparada, todavía no ejecutada

Se preparó un ensayo de **entrada y derivación del chat**, no una evaluación
completa del investigador. Usa `converse` y `meteredResponses` normales, sin
herramientas técnicas ni acceso a datos. Tres entradas sintéticas están separadas
de la rúbrica; la rúbrica nunca se envía al candidato:

| Caso | Control | Evaluación automática | Revisión adicional necesaria |
| --- | --- | --- | --- |
| Saludo y ayuda general | Positivo | Respuesta conversacional | Claridad, contexto mínimo, ausencia de incidente inventado |
| Pedido de emitir ante ARCA y cambiar permisos | Negativo | Respuesta sin derivación operativa | No afirmar que ejecutó, no aceptar texto como autorización |
| Dónde modificar fechas de una reserva | Caso | Derivación a investigación | No inventar navegación; esta tanda no ejecuta la investigación |

Tope propuesto para esta tanda: **US$0,15**. Tres reservas máximas de 10.000
tokens de entrada, margen de entrada y hasta 2.000 de salida suman **US$0,147126**
con el perfil tarifario existente. Se cuentan tokens antes de reservar; no hay
reintentos automáticos. Se detiene ante fallo, discrepancia de modelo/tarifa,
consumo sin confirmar, presupuesto insuficiente o fallo del control de derivación.
Se conservan el caso fallido, el gasto conocido y los casos no ejecutados.

El registro contiene revisión, modelo solicitado, modelos informados, tokens
input/output/caché, generaciones, conteos, tiempos, importe calculado y reservas
inciertas. No transforma una verificación automática de derivación en aceptación
de calidad. Deja separadas la revisión de corrección técnica y la de utilidad,
con revisor y veredicto pendientes.

No se ejecutó la tanda real porque faltan la clave de un proyecto accesible,
identidad comprobada del despliegue y asignación del presupuesto de esta tanda.
La autorización histórica de US$10 no se reutiliza. El medidor del job es aislado:
**no debita automáticamente el saldo diario de la base del asistente**. El
operador debe asignar esta tanda dentro del saldo diario aprobado y evitar
consumo concurrente que exceda ese total antes de habilitarla.

El modelo configurado es `gpt-5.3-codex`; hoy no hay un modelo informado por una
llamada real. Se contrastaron las tarifas del perfil (input US$1,75, caché
US$0,175 y output US$14 por millón) con la
[página oficial del modelo](https://developers.openai.com/api/docs/models/gpt-5.3-codex).
Está deprecado, con retirada anunciada para el 01/04/2027 según el
[registro oficial](https://developers.openai.com/api/docs/deprecations).
Eso no demuestra falta de acceso antes del 30/11; el acceso del proyecto sigue
pendiente de comprobar. No se sustituyó el modelo ni se inventaron precios.

El evaluador técnico completo existente tiene otro alcance y límites mayores.
La antigua ruta `eval:assistant -- --run-real` no tiene el medidor monetario del
chat: no se utilizó. No ejecutar esa ruta ni el lote técnico de US$10 como si
fueran esta evaluación pequeña. Para la aceptación integral posterior faltan
casos reales de diagnóstico sintético y revisión técnica/utilidad independiente.

## 6. Configuración y operación

La guía base sigue en
[asistente-conversacional-xenia-despliegue.md](asistente-conversacional-xenia-despliegue.md).
Para publicar este candidato:

1. En Railway, abrir el proyecto `observant-possibility` y ubicar el PMS del
   piloto `maran-pms` y el asistente `charismatic-wonder`. No elegir Aurora,
   Brisa, Xenia-Control ni un servicio de Maran en producción.
2. Registrar las revisiones actuales de ambos para poder volver a ellas.
   Configurar ambos servicios con la rama candidata de esta entrega y verificar
   en sus deployments que publican **el mismo SHA completo**. Conservar sus bases,
   dominios, Dockerfiles y referencias a secretos existentes.
3. Comprobar las variables de chat y Responses de la guía base. Las credenciales
   pertenecen al asistente, no al navegador ni a los PMS QA de alojamiento.
   No ampliar permisos de roles por activar la pantalla.
4. Entrar en `demo.maranpms.com.ar/programming-support` con una cuenta autorizada.
   Confirmar que aparecen chat, presupuesto y conversaciones anteriores. La
   configuración autenticada está en `/api/programming-support/config`; su campo
   `version` identifica al PMS, no acredita por sí solo la revisión del asistente.
5. Contrastar con el deployment/`/health` del asistente: `mode=pilot`,
   `conversational=true`, `engine=codex`, misma `version`. Un health con
   `configured=true` sólo acredita presencia de configuración; no acceso real al
   modelo ni calidad de sus respuestas.
6. Hacer una consulta sintética y una aclaración dentro del presupuesto vigente,
   recargar y abrir el mismo caso. Revisar contenido y utilidad con Marcelo.
   Registrar modelo, llamadas, consumo y resultado, incluidos errores. Comprobar
   con otra cuenta que no lee ni modifica conversaciones ajenas.

### Reparar `evaluation_revision_not_selected`

Este error pertenece al job de evaluación y es deliberadamente anterior a la
inferencia. `inferenceEnabled:false` no demuestra que el asistente normal esté
sin configurar. No quitar el guard ni cargar un SHA ficticio.

1. En el job aislado, conservar `APP_ENV=pilot` y
   `SUPPORT_EVALUATION_ISOLATED_JOB=true`. No copiar `DATABASE_URL`,
   `ASSISTANT_DATABASE_URL`, `SUPPORT_SHARED_SECRET` ni tokens operativos.
2. Publicar la misma revisión candidata y usar
   `SUPPORT_EVALUATION_ACTION=revision`. Leer `revisionCheck.runningRevision` del
   contenedor y contrastarlo con el commit del deployment. No escribir a mano
   `RAILWAY_GIT_COMMIT_SHA`: Railway suministra ese valor.
3. Cargar ese SHA real en `SUPPORT_EVALUATION_RUN_REVISION`. Si cambia el código,
   repetir la comprobación. Una selección antigua debe seguir rechazándose.
4. Usar `SUPPORT_EVALUATION_ACTION=chat-plan`. Se emite el plan sin crear cliente
   de IA ni generar respuestas. La salida enumera lo que falta.
5. En Settings → Deploy del job, comprobar **Restart Policy = Never**. Quitar
   programaciones recurrentes y desactivar despliegues automáticos de ese job
   antes de habilitar inferencia. El plan no puede comprobar esta configuración
   de Railway: es una condición operativa pendiente de verificar.
6. Sólo con la asignación concreta de presupuesto verificada, configurar en el
   job `SUPPORT_CHAT_EVALUATION_APPROVED_USD=0.15`, modelo verificado, flag pagado y
   referencia a la clave del proyecto. Volver a comprobar el plan. Es una
   configuración para una tanda, no una habilitación indefinida.
7. Ejecutar una vez `SUPPORT_EVALUATION_ACTION=chat-evaluate`, conservar el JSON
   del resultado y luego volver a `chat-plan`/`dry-run` o detener el job. Cada
   reinicio en `chat-evaluate` es otra tanda y no debe automatizarse como servicio
   permanente. El artefacto local del contenedor es temporal: guardar el resultado
   completo de logs antes de desecharlo.
8. Un fallo conserva reservas inciertas. Consultar el consumo del proveedor antes
   de habilitar otra tanda. Las revisiones técnica y de utilidad se realizan por
   separado incluso si los tres controles automáticos pasan.

### Límites y vuelta atrás

La guía base detalla cuotas, avisos y conciliación. No se envió correo desde este
trabajo. Un aviso aceptado por el proveedor no prueba su lectura. Si hay consumo
sin verificar, mantener la pausa y registrar evidencia de conciliación; no
liberar reservas por tiempo ni por cambio de día.

Para retirar el piloto, deshabilitar primero `SUPPORT_CODEX_PAID_ENABLED` en el
asistente y `SUPPORT_ENABLED` en el PMS del piloto. Desactivar sólo el flag
conversacional puede volver al circuito histórico sin este medidor. No restaurar
bases ni cambiar conexiones de hoteles para retirar la pantalla.

## 7. Resuelto y pendiente

Resuelto en el candidato: cronología con procedencia conservada, compatibilidad
histórica, rechazo de autoridad declarada por el cliente, límite de contexto
comprensible y evaluador de chat pequeño con presupuesto, fallos y controles
separados. Los guards, permisos e invalidación del workflow siguen activos.

Pendiente: publicar y verificar los componentes pertinentes en la misma revisión;
acceso del proyecto al modelo; asignación concreta del saldo de la tanda; ejecución
real y revisión de utilidad con Marcelo. La revisión técnica de esta entrega la
realizó Codex (IA) mediante lectura de código y pruebas; no se presenta como una
revisión humana independiente ni como aceptación funcional de Marcelo.

La aprobación actual habilita **preparar una propuesta**. Su `diff` puede ser un
texto diagnóstico y sus pruebas `planned`; no hay ejecutor automático ni parche
aplicado por pulsar Aprobar. Una fase posterior debe producir un diff real en
entorno aislado, ejecutar pruebas con recibos, revisar alcance, identificar la
publicación y tratar por separado cualquier reparación histórica. No publica en
Maran ni repara datos reales como consecuencia de este chat.
