# Primera revisión del piloto de soporte y control asistido por IA

Fecha: 16 de noviembre de 2026. Responsable actual del producto y de las decisiones: Marcelo. Alcance: código y configuración visible del entorno de trabajo; no se consultaron movimientos del hotel ni se ejecutaron emisiones, envíos de correo o llamadas pagas al modelo.

## Referencias

- Piloto revisado: `advance/assistant-pilot-20261114`, `63b34fcc6d3e3bc94d04c8e71a76d48102625ebe`.
- Rama de Xenia consultada: `feature/xenia-channex-staging`, `0bf36df28b1f77e28e247cb44581da6775a5e713`.
- `main` consultada en esta continuación: `1aa45fb9c301448017841dcc53973d1208175af8`, con PR 113 y PR 114. Sus cambios deben conservarse al integrar mejoras.

## Qué encontramos

| Capacidad | Evidencia en el código del piloto | Qué falta comprobar o desarrollar |
|---|---|---|
| Chat natural y capturas | `shared/support-chat.ts`, `chat-service.ts` y componentes del chat. | Conversación real y permisos en la versión publicada de Xenia. |
| Límite monetario | `chat-store.ts`: reserva antes del proveedor, consumo e incertidumbre, configuración persistida. | Confirmar que el presupuesto efectivo de la instalación es US$1. El valor inicial no reemplaza una configuración anterior. |
| Presupuesto inicial | Inserción inicial de 1.000.000 microdólares, equivalente a US$1, con `ON CONFLICT DO NOTHING`. | Consultar el estado efectivo mediante el circuito administrativo; no inferirlo del valor predeterminado. |
| Avisos de consumo | Advertencia al 80%, pausa y alertas deduplicadas. | Ver bandeja y entrega real con una prueba coordinada. |
| Correo y propuestas | `chat-notifications.ts`: cola persistente, máximo de tres intentos, claves de idempotencia y descarte de propuestas obsoletas. | Remitente verificado, destinatario y enlace correctos, sin llamadas pagas para probar correo. No se enviaron correos durante esta revisión. |
| Identidad de versión y modelo | `chat-service.ts`: comprueba modo, transporte, modelo y revisión coincidente entre PMS y servicio. | Configuración y versión efectivamente servidas; una incompatibilidad deja el mensaje guardado sin procesarlo. |
| Alcance de datos reales | `chat-rules.ts` declara que no hay acceso a reservas reales, Caja, ARCA, logs ni bases del hotel. | Desarrollar herramientas específicas de lectura autorizada antes de ofrecer auditoría operativa. |
| Base del asistente | `index.ts` requiere `ASSISTANT_DATABASE_URL` propio y `APP_ENV=pilot`. | Confirmar separación real de servicio, datos y credenciales en Railway. |
| Dominio en avisos | El enlace de soporte usa `demo.maranpms.com.ar`. | Parametrizarlo y validar el destino antes de usar otro hotel o el dominio nuevo. |
| Seguimiento normativo | No se encontró un recolector de ARCA o Boletín Oficial en las rutas de servicios, servidor, cliente y código compartido revisadas. | Catálogo de fuentes, recolector programado, registro de consultas, clasificación de impacto y aprobación. |

La presencia de estas capacidades en una rama no demuestra que estén habilitadas en Xenia. Tampoco acredita la calidad global de las respuestas ni la corrección contable de los datos del hotel.

## Verificaciones locales realizadas

Se ejecutaron tres archivos de pruebas existentes del piloto: `programming-assistant-chat.test.ts`, `programming-assistant-budget.test.ts` y `programming-assistant-notify.test.ts`. Resultado: **18 pruebas aprobadas**. Usan proveedores simulados; cubren límites de entrada, capturas, día de corte, cálculo y validación del consumo y contenido de avisos, entre otros casos. No llamaron a un modelo pago, no enviaron correos ni usaron la base del hotel.

No son una prueba de entrega de correo real, presupuesto persistido de la instalación, concurrencia en PostgreSQL ni calidad de conversaciones reales. Esas comprobaciones siguen dentro del primer hito.

## Acceso y disponibilidad

El estado del entorno Cloud muestra un secreto listo para el proyecto Maran, destinado a `RAILWAY_TOKEN` y restringido a `backboard.railway.com`. No muestra un secreto de Xenia. La variable `RAILWAY_XENIA_TOKEN` tampoco está presente. El acceso configurado en otra tarea no aparece automáticamente en esta.

Las consultas públicas de esta continuación volvieron a registrar un error local de resolución DNS. No permiten confirmar una caída de los dominios ni la revisión que sirven. Se conserva la evidencia en `evidencia/inventario-arranque-ia-2026-11-16.json`.

## Primer hito del soporte

Validar cinco casos anonimizados, empezando en Xenia con datos ficticios:

1. Una reserva que necesita extenderse después de facturar: identificar el circuito y conservar los comprobantes y cobros existentes.
2. Un checkout con saldo residual: distinguir saldo pendiente, cuenta corriente y nuevo cobro sin inventar una operación.
3. Una serie fiscal con borrador pendiente: distinguir rechazo, autorización incierta y comprobante emitido; pedir evidencia o escalar sin adelantar numeración.
4. Un anticipo de grupo que no se encuentra: rastrear entidades y vínculos disponibles; sin lectura operativa, declarar qué comprobación falta.
5. Una captura incompleta: utilizar lo visible, pedir sólo el dato necesario y evitar atribuir una causa sin prueba.

Por caso registrar conversación, versión, fuentes, resolución o escalamiento, decisiones necesarias y consumo medido. Verificar aparte presupuesto efectivo, agotamiento, consumo incierto, bandeja y correo. Los casos deben poder quedar bien escalados: no se fuerza una respuesta concluyente cuando faltan datos.

## Consultas de lectura que siguen

Preparar herramientas concretas para un caso de soporte: resumen de folio, estado de un intento fiscal, relaciones de un cobro e imputaciones de cuenta corriente. El servidor valida usuario, hotel y permiso; limita campos y volumen; registra quién consultó y para qué caso. No acepta SQL libre, URLs arbitrarias ni una base elegida por el navegador.

La primera conciliación se prueba con un conjunto ficticio pequeño que incluya anticipo, pago parcial, cuenta corriente, nota de crédito, transferencia y cargo anulado. Los totales pueden diferir válidamente; la regla debe conocer el estado y el vínculo antes de señalar un error. Los resultados serán hallazgos, sin cambios automáticos sobre operaciones.

## Vigilancia normativa inicial

El catálogo `FUENTES_FISCALES_ARCA.json` es preparación; no configura todavía una tarea programada. Antes de activarla se confirma el perfil fiscal, la lectura fiable de cada fuente y el mecanismo de reserva del presupuesto compartido. Una fuente inaccesible debe quedar como no revisada, sin informar que no hubo novedades.

Los avisos registrarán fuente, número o versión, publicación, vigencia, posibles sujetos alcanzados, relación con el PMS, pruebas sugeridas y decisión pendiente. Las novedades no cambian reglas fiscales automáticamente. Chat, investigación y resúmenes pagados comparten el techo de US$1 diario del piloto.
