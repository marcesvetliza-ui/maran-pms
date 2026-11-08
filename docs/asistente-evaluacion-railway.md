Prueba aislada en Xenia
======================

El presupuesto inicial de USD 10 para tres casos está autorizado. Todavía no se ha ejecutado ninguna inferencia real. Este primer trabajo únicamente comprueba los modelos disponibles con GET /v1/models; no investiga casos ni modifica datos.

En Railway, proyecto `observant-possibility`, crear un servicio temporal desde este repositorio, con nombre `support-codex-evaluation` y rama `feature/xenia-support-approval-foundation`. No modificar `programming-assistant`.

Configurar estas variables sólo en el servicio temporal:

```
RAILWAY_DOCKERFILE_PATH=services/programming-assistant/Evaluation.Dockerfile
SUPPORT_EVALUATION_ISOLATED_JOB=true
SUPPORT_EVALUATION_ACTION=models
OPENAI_API_KEY=${{programming-assistant.OPENAI_API_KEY}}
```

La última variable es una referencia de Railway: no copiar la clave a conversaciones ni a archivos. No vincular bases de datos, volúmenes o credenciales operativas. Desactivar reinicios automáticos para que sea una ejecución única; no necesita dominio ni comprobación HTTP de salud.

El registro final muestra `models`, `providerTurns: 0` e `inferenceEnabled: false`. Compartir únicamente esa lista de modelos. El siguiente paso es seleccionar un modelo y verificar sus precios antes de ejecutar los tres casos aprobados. El transporte mediante Responses está pendiente de implementación y validación; este trabajo no ejecuta la CLI de Codex.

Sin `SUPPORT_EVALUATION_ACTION`, el contenedor usa `dry-run` y no consulta la API. Las acciones distintas de `dry-run` y `models` se rechazan. La clave sólo se entrega al cliente OpenAI; los errores del proveedor no se imprimen.
