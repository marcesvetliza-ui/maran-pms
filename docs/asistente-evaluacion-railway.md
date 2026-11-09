Prueba aislada en Xenia
======================

El presupuesto inicial de USD 10 para tres casos está autorizado. La consulta del catálogo ya funcionó en Railway. Todavía no se ha ejecutado ninguna inferencia real ni se ha validado la calidad de los diagnósticos.

En Railway, proyecto `observant-possibility`, usar el servicio temporal `support-codex-evaluation` y rama `feature/xenia-support-approval-foundation`. El servicio existente del asistente se llama actualmente `charismatic-wonder`; no modificar su despliegue.

Configurar estas variables sólo en el servicio temporal:

```
RAILWAY_DOCKERFILE_PATH=services/programming-assistant/Evaluation.Dockerfile
SUPPORT_EVALUATION_ISOLATED_JOB=true
SUPPORT_EVALUATION_ACTION=models
OPENAI_API_KEY=${{charismatic-wonder.OPENAI_API_KEY}}
```

La última variable es una referencia de Railway: no copiar la clave a conversaciones ni a archivos. No vincular bases de datos, volúmenes o credenciales operativas. Desactivar reinicios automáticos para que sea una ejecución única; no necesita dominio ni comprobación HTTP de salud.

El registro del catálogo muestra `models`, `providerTurns: 0` e `inferenceEnabled: false`. El ejecutor de evaluación ahora usa Responses con respuestas JSON estructuradas y lecturas de código controladas. No usa la CLI, terminal, herramientas nativas, bases de datos ni autenticación del host. Las conversaciones se conservan únicamente en memoria del proceso, con `store: false`. La integración de Responses se usa en esta evaluación; el servicio existente conserva su configuración anterior.

Sin `SUPPORT_EVALUATION_ACTION`, el contenedor usa `dry-run` y no consulta la API. Los errores del proveedor no se imprimen; los fallos conocidos muestran códigos seguros.

Evaluación de tres casos
-----------------------

El usuario copió de la ficha oficial de `gpt-5.3-codex` el 2026-11-09 los precios por millón: entrada USD 1,75, caché USD 0,175, salida USD 14. El catálogo ya lo incluye y la ficha indica Responses y salidas estructuradas. La compatibilidad real y la calidad deben comprobarse con la tanda.

Para esta tanda, agregar sólo en el servicio temporal (el perfil fija el modelo, los precios verificados, su fuente y el máximo autorizado de USD 10):

```
SUPPORT_EVALUATION_PROFILE=gpt53codex-2026-11-09
SUPPORT_CODEX_PAID_ENABLED=true
SUPPORT_EVALUATION_ACTION=evaluate
```

`SUPPORT_EVALUATION_ACTION` reemplaza el valor `models` existente. El perfil rechaza valores de modelo o precios que contradigan los fijados; no habilita pagos por sí solo. Desplegar una sola vez, con reinicios en `Never`. Railway proporciona `RAILWAY_GIT_COMMIT_SHA`; el ejecutor exige una revisión completa. No agregar start command, healthcheck ni cron.

Los únicos casos admitidos en esta tanda son cierre de caja con conteo cero, detalle de receta/equivalencia y solicitud sin información suficiente. Se usan casos sintéticos, revisión independiente y citas de lecturas reales; no hay operaciones ni modificaciones de datos. El proceso se detiene ante el primer fallo, sin reintentar casos pagados. Cada caso admite hasta 16 turnos y 60.000 tokens registrados, incluyendo revisión, con hasta 120.000 caracteres de contexto del autor. Se solicita cerrar el informe antes de consumir la reserva de revisión. Los límites internos se informan mediante `budgetReason`. El presupuesto se controla mediante reservas estimadas y uso reportado: no es un límite de facturación garantizado por el proveedor. Si una respuesta falla sin uso completo, queda marcado y no se continúa.

La salida JSON incluye informes, preguntas, revisión humana pendiente, modelo solicitado, modelos informados por Responses, tokens y costo estimado con fuente de precios. Los metadatos internos del investigador mantienen `effectiveModel: null` por compatibilidad; el manifiesto superior registra el modelo real informado por la API. No afirmar que todos los casos usaron un mismo modelo si la lista contiene varios.

La imagen no contiene `.git`: verifica el hash del contenido antes y después y registra la revisión suministrada por Railway. El modo local conserva la comprobación de Git limpio. El archivo de salida en `/tmp` es efímero; para Railway también se imprime el manifiesto sintético en los logs. Después de la tanda, volver a `SUPPORT_EVALUATION_ACTION=models` y `SUPPORT_CODEX_PAID_ENABLED=false` para evitar una nueva evaluación por un despliegue posterior.

Validación previa: pruebas simuladas del transporte (historial separado, ausencia de herramientas, uso, respuestas incompletas y errores), pruebas del investigador, comprobación de tipos y construcción de ambos bundles. Se verificó el modo contenedor sin inferencia y el rechazo de configuración incompleta. Esto no sustituye una ejecución real del modelo ni la construcción de la imagen en Railway.

La primera ejecución real del 2026-11-09 se detuvo en el primer caso con `codex_budget`, tras 7 turnos, 23.474 tokens y USD 0,0256333 estimados, con uso completo reportado y código sin cambios. No publicó un diagnóstico ni ejecutó los otros dos casos. El código previo no distinguía el límite exacto. La corrección amplía el contexto y la reserva de tokens, anticipa el cierre y agrega motivos específicos de corte; la nueva tanda aún debe verificarse.
