# Configurar el primer asistente en Railway

## Situación inicial

Proyecto de pruebas: `observant-possibility`. URL: `https://demo.maranpms.com.ar`. La rama existente de la demo es `feature/pilot-environment`; el trabajo integrado del asistente está en `codex/programming-assistant-pilot`. `APP_ENV=pilot` se conserva en el PMS. El entorno de Railway puede llamarse `production` dentro de este proyecto; el propósito de la aplicación se determina por `APP_ENV`.

No modificar el proyecto real `adventurous-amazement` ni conectar la base del asistente a su Postgres. Los pasos se hacen únicamente en el proyecto de pruebas. Las claves se cargan en Variables de Railway, nunca en el chat, capturas, archivos o GitHub.

## Paso 1: base propia

En `observant-possibility`, usar New → Database → PostgreSQL. Nombrar el servicio `assistant-db`. No reemplazar el Postgres existente del PMS ni restaurar datos del hotel en la base nueva. Este servicio aumenta el uso y la facturación de Railway; revisar el consumo del proyecto.

## Paso 2: servicio del asistente

Usar New → GitHub Repo → `marcesvetliza-ui/maran-pms`. Nombrarlo `programming-assistant`. En Settings → Source seleccionar la rama `codex/programming-assistant-pilot`, dejando Root Directory vacío (raíz del repositorio).

Configurar estas variables exclusivamente en el nuevo servicio:

| Variable | Valor |
| --- | --- |
| `APP_ENV` | `pilot` |
| `NODE_ENV` | `production` |
| `PORT` | `3000` |
| `RAILWAY_DOCKERFILE_PATH` | `services/programming-assistant/Dockerfile` |
| `ASSISTANT_DATABASE_URL` | Referencia a `assistant-db.DATABASE_URL`, elegida con el selector de referencias de Railway |
| `SUPPORT_SHARED_SECRET` | Secreto aleatorio nuevo de al menos 32 caracteres; generar de forma segura y conservarlo para el PMS |
| `OPENAI_API_KEY` | Clave de un proyecto de OpenAI elegido para el piloto |
| `OPENAI_MODEL` | `gpt-4.1-mini`, o un modelo compatible con Chat Completions, herramientas y JSON disponible en ese proyecto |
| `SUPPORT_NOTIFY_ENABLED` | `false` al comenzar |

Fijamos `PORT=3000` para que coincida con la conexión privada del PMS. Railway proporciona `RAILWAY_GIT_COMMIT_SHA`. No inventar ni fijar el commit manualmente para ocultar una diferencia entre servicios. En Settings → Deploy establecer Healthcheck Path `/health` y una sola réplica para este piloto. No configurar un Start Command del PMS (`npm start`) en este servicio: el Dockerfile ya define el arranque. No hace falta un dominio público; usar su dominio privado de Railway para el PMS.

El asistente no utiliza la variable `DATABASE_URL` del PMS. Su contenedor contiene código pero no incluye certificados fiscales, archivos de entorno ni la carpeta `.git`.

## Paso 3: conectar el PMS de la demo

En el servicio existente `maran-pms` de `observant-possibility`:

| Variable | Valor |
| --- | --- |
| `APP_ENV` | Conservar `pilot` |
| `SUPPORT_SERVICE_URL` | `http://programming-assistant.railway.internal:3000` si el asistente usa el puerto 3000; si Railway fija otro `PORT`, usar ese puerto real |
| `SUPPORT_SHARED_SECRET` | Exactamente el mismo secreto nuevo del asistente |
| `SUPPORT_ENABLED` | `true` |

Conservar la conexión del PMS a su Postgres y las demás variables. Mantener su forma de build/arranque actual. No agregarle `RAILWAY_DOCKERFILE_PATH` del asistente.

Tras revisar y aprobar el trabajo concreto, actualizar la rama de prueba o conectar ambos servicios a la rama revisada. Ambos deben desplegar exactamente el mismo commit. No cambiar la rama de producción. Un redeploy no incorpora cambios de otra rama.

## Paso 4: probar el circuito completo

1. Verificar que los dos servicios estén activos y que la revisión Git coincida.
2. Entrar como administrador a la demo y abrir Soporte del sistema.
3. Crear una consulta ficticia, por ejemplo sobre la disposición de un filtro. No utilizar datos personales.
4. Guardar y comprobar que el caso aparece como Recibido, sin consumo del modelo todavía.
5. Pulsar Solicitar diagnóstico. Comprobar En cola → Investigando → Propuesta lista o Falta información.
6. Revisar las citas, la revisión de código y la aclaración de que no se ejecutaron pruebas.
7. Agregar información y solicitar otra investigación. Comprobar que conserva el mismo caso y el seguimiento.
8. Recargar la pantalla y comprobar persistencia. Un usuario diferente no debe ver ese caso; `piloto_externo` no debe acceder.
9. Detener únicamente el asistente y verificar que el PMS sigue funcionando. El panel debe informar que soporte no está disponible.

Las verificaciones locales con un modelo simulado no sustituyen esta prueba con la API y la red privadas de Railway. No declarar el asistente operativo hasta completar estos pasos.

## Correo opcional, después de probar el panel

Elegir una dirección destino y un remitente verificado de Resend. Cargar solo en el asistente `RESEND_API_KEY`, `SUPPORT_NOTIFY_FROM`, `SUPPORT_NOTIFY_EMAIL` y luego `SUPPORT_NOTIFY_ENABLED=true`. El aviso contiene un enlace a la demo, sin detalles del caso. Verificar entrega con una consulta de prueba. No activar hasta que Marcelo haya elegido el destinatario y solicitado los avisos.

## Verificación de desarrollo

```sh
npm run check
npx tsc --project services/programming-assistant/tsconfig.json
npx vitest run --config vitest.server.config.ts server/tests/programming-assistant-source.test.ts
# Usar exclusivamente una base local sintética para el siguiente comando:
npx vitest run --config vitest.server.pg.config.ts server/tests/programming-assistant-service.pg.test.ts
npm run build
docker build -f services/programming-assistant/Dockerfile -t maran-assistant-pilot .
```

Para ejecutar el servicio local se requiere una base sintética independiente, `APP_ENV=pilot`, `ASSISTANT_DATABASE_URL`, `SUPPORT_SHARED_SECRET` y `ASSISTANT_SOURCE_VERSION` con una revisión Git completa. Ejecutar `npx tsx services/programming-assistant/index.ts`; su healthcheck es `/health`. No configurar una clave real del modelo para las pruebas automatizadas: usan un investigador simulado.
