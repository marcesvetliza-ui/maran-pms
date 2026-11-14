# Activación del chat de Soporte en Xenia

Destino autorizado: proyecto Railway `observant-possibility`, PMS de Xenia en
`https://demo.maranpms.com.ar`. La rama del piloto es
`feature/xenia-support-approval-foundation`. Esta entrega no se integra a `main`
ni activa el asistente en Maran.

## Antes de activar

PMS (`maran-pms`) y asistente (`charismatic-wonder`) deben publicar el mismo commit
de la rama del piloto. Conservar sus bases, secretos compartidos y credenciales
existentes. El asistente utiliza exclusivamente su PostgreSQL propio y rechaza
una base con tablas operativas del PMS.

El permiso `sidebar:/programming-support` permite usar el módulo existente.
Los permisos `api:support:view-all` y `api:support:review` habilitan la bandeja y
las decisiones de administración. No se conceden permisos nuevos a roles por
activar esta entrega ni se habilita el acceso de usuarios externos.

## Variables del PMS de Xenia

```dotenv
SUPPORT_ENABLED=true
SUPPORT_CONVERSATIONAL_ENABLED=true
SUPPORT_INVESTIGATOR=codex
SUPPORT_WORKFLOW_SIMULATION_ENABLED=false
SUPPORT_PROPOSAL_REVIEW_ENABLED=true
```

Mantener `SUPPORT_SERVICE_URL` y `SUPPORT_SHARED_SECRET` existentes y comprobar
que correspondan al asistente de Xenia.

## Variables del asistente de Xenia

```dotenv
APP_ENV=pilot
SUPPORT_CONVERSATIONAL_ENABLED=true
SUPPORT_INVESTIGATOR=codex
SUPPORT_CODEX_TRANSPORT=responses
SUPPORT_CODEX_MODEL=gpt-5.3-codex
SUPPORT_WORKFLOW_SIMULATION_ENABLED=false
SUPPORT_PROPOSAL_REVIEW_ENABLED=true
ASSISTANT_DAILY_LIMIT=10
SUPPORT_CODEX_PAID_ENABLED=true
```

Mantener `OPENAI_API_KEY`, `ASSISTANT_DATABASE_URL`, `SUPPORT_SHARED_SECRET` y el
Dockerfile existentes. El límite inicial guardado en la base del asistente es
US$1 por día para todo el hotel. Cada colaborador dispone de hasta veinte
solicitudes de respuesta y el hotel, de hasta diez investigaciones diarias.
Los intentos iniciados también cuentan; guardar un mensaje bloqueado no consume
una respuesta. El día se renueva a las 00:00 de Argentina.

Cada generación usa primero el conteo de entrada del proveedor, reserva input
sin descuento de caché y output máximo, y después registra el uso informado.
El perfil admite `gpt-5.3-codex` con tarifas verificadas para la evaluación del
9 de noviembre: input US$1,75, caché US$0,175 y output US$14 por millón de tokens.
Los modelos sin ese perfil no generan inferencia. No se usan herramientas
nativas, sesiones remotas persistentes ni reintentos automáticos del proveedor.
Las generaciones fijan `service_tier=default` para utilizar la tarifa estándar;
un nivel de facturación distinto informado por el proveedor requiere revisión.
Si el conteo no está disponible, no se genera una respuesta sin reserva.

## Correo y bandeja

```dotenv
SUPPORT_NOTIFY_ENABLED=true
SUPPORT_NOTIFY_INCLUDE_SUMMARY=true
```

Configurar `SUPPORT_NOTIFY_EMAIL` con el destinatario indicado explícitamente por
Marcelo. Conservar un remitente verificado en `SUPPORT_NOTIFY_FROM` y la clave de
Resend en `RESEND_API_KEY`. Esos valores se cargan en Railway; no se copian al
repositorio ni al chat. No se reutiliza implícitamente el destinatario de backups.

El administrador puede pulsar «Enviar aviso de prueba» en Soporte. Esa acción no
llama al modelo. La bandeja distingue pendiente, aceptado por el proveedor,
envío fallido y configuración incompleta. La aceptación no demuestra lectura.
Los avisos se conservan en la base con hasta tres intentos de envío idempotentes.
Una propuesta desactualizada o un caso cerrado no genera un pedido de aprobación
nuevo por correo.

Un correo incompleto no detiene el chat nuevo: los avisos quedan en la bandeja.
Una falla de autenticación entre PMS y asistente devuelve un error de servicio,
sin cerrar la sesión del colaborador en el PMS.

## Comprobación de la entrega

1. Comparar el commit del PMS y del asistente. El indicador `conversational`
   del asistente debe estar activo; PMS y servicio deben usar Responses/Codex.
2. Entrar con una cuenta autorizada a `/programming-support`. Confirmar que
   aparecen el chat, el límite de US$1, los cupos y la hora de renovación.
3. Crear una consulta manual y continuarla en el mismo caso con una captura.
   Verificar contenido, comprensión y utilidad de las respuestas con Marcelo.
   La primera consulta real consume el presupuesto acordado; no es una tanda
   pagada adicional autorizada fuera de ese límite.
4. Confirmar el uso registrado y el envío del correo de prueba al destinatario
   configurado. Comprobar el aislamiento con una segunda cuenta autorizada.
5. Revisar un diagnóstico que requiere un cambio. La decisión actual habilita
   preparar una corrección; no ejecuta ni publica código. El ejecutor y la
   aprobación de una publicación concreta siguen siendo una etapa posterior,
   después de validar la asistencia conversacional.

Una llamada cuyo consumo no se pudo confirmar conserva su reserva y pausa
nuevas generaciones, incluso después de reiniciar el servicio o cambiar el día.
Un administrador debe comprobar el consumo en el proveedor y registrarlo en
«Consumo pendiente de verificar», con referencia y responsable. No se libera una
reserva incierta por vencer un temporizador.

Para retirar la activación, deshabilitar primero las llamadas pagadas y el acceso
al asistente (`SUPPORT_CODEX_PAID_ENABLED=false`, `SUPPORT_ENABLED=false` en sus
servicios correspondientes). Desactivar sólo el chat conversacional restituye
la interfaz anterior, cuyo circuito no incluye el nuevo control monetario.

## Validación y estado

Las pruebas automatizadas usan proveedores y correo simulados, esquemas propios
de PostgreSQL local y un navegador local. Las capturas de interfaz se identifican
como datos simulados. La publicación y configuración efectiva se comprueban
por separado; las pruebas locales no acreditan entrega de correo ni calidad del
modelo real. No se ejecutan SQL, reservas, cobros o comprobantes del hotel.
