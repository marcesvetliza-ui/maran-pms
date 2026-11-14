# Validación del chat de Soporte de Xenia — 14 de noviembre de 2026

Preparado en `advance/assistant-pilot-20261114`, para integrar únicamente a
`feature/xenia-support-approval-foundation` mediante la PR 99.

## Pruebas locales

| Grupo | Archivos | Pruebas correctas |
| --- | ---: | ---: |
| Suite completa del asistente | 27 | 298 |
| Investigador Codex, propuestas, transporte y pasarela del PMS | 4 | 56 |
| Pantallas y componentes de Soporte | 4 | 31 |
| Integración en esquemas propios de PostgreSQL local | 4 | 20 |
| Total sin duplicar pruebas | 39 | 405 |

Las pruebas incluyen conversación y seguimiento, capturas privadas, permisos,
solicitudes idempotentes, presupuesto compartido, concurrencia entre reservas de
consumo, arranque simultáneo de réplicas, cupos por colaborador y por hotel,
reinicios, consumo incierto y conciliación auditada. Comprueban avisos sin
inferencia, fallas de correo, reintentos con la misma clave, propuestas
desactualizadas y rechazo de acciones no permitidas devueltas por el modelo.

Una falla de autenticación del servicio de soporte devuelve HTTP 503 al PMS;
no se comunica como una sesión vencida del colaborador. La pasarela conserva
las verificaciones de autenticación y permisos del propio PMS.

También pasaron TypeScript del PMS y del servicio, compilación del PMS y bundle
del asistente. La compilación del PMS conserva las advertencias existentes de
`import.meta` en salida CJS. Las dependencias del servicio se instalaron desde
su lockfile para comprobar sus tipos con las mismas versiones declaradas.

## Comprobación visual

Se abrió el componente real con Chromium local y datos explícitamente simulados.
El envío mediante el botón nativo del formulario funcionó, la continuación se
mostró en el mismo caso, la vista de 390 píxeles no tuvo desborde horizontal y
no se registraron errores de página. Se revisaron las vistas de escritorio,
móvil y presupuesto agotado. Los archivos temporales del visor se retiraron.

## Alcance de la evidencia

Los proveedores de inferencia y correo de las pruebas son simulados. No se
llamó a OpenAI, no se enviaron correos reales ni se consultaron o modificaron
operaciones del hotel. PostgreSQL utiliza esquemas desechables de una base local
de pruebas, no la base de Xenia ni la de Maran.

Estas comprobaciones acreditan los controles técnicos y el recorrido de la
interfaz. No prueban la calidad del razonamiento del modelo real, la entrega de
correo al destinatario ni la activación de los servicios publicados. Eso debe
verificarse en Xenia con la configuración de la guía de despliegue, respetando
el presupuesto diario de US$1 y la revisión humana de conversaciones completas.

El primer commit de la PR pasó en GitHub el workflow específico del piloto y
los controles de fechas y workflows. El estado del commit final debe comprobarse
antes de integrar. No se requiere ni se autoriza integrar estos cambios a
`main` para realizar el piloto.
