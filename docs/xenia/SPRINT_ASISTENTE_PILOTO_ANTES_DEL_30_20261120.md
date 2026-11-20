# Asistente piloto de Xenia: objetivo 29 de noviembre de 2026

Actualización: 20 de noviembre de 2026. Responsable del producto y aceptación: Marcelo. Prioridad: **piloto usable en Xenia antes del 30/11**, con objetivo de entrega el **29/11**. Es una meta de trabajo con criterios de aceptación, no una publicación ya realizada.

## Decisión y punto de partida

Marcelo pidió pausar los ensayos adicionales del multihotel para avanzar con el asistente piloto. Confirmó que **xenia-aurora-pms sigue conectado a su base original**; no se aplicó la conexión temporal a la copia PITR. Se conservan las cinco copias reportadas y la muestra de recuperación de Aurora aceptada. El paso 3.1 queda pausado.

El asistente se prioriza como un piloto de soporte en el Xenia de pruebas, empezando por Marcelo y un grupo pequeño de usuarios autorizados. La publicación en Maran es una etapa separada, condicionada al resultado del piloto y a la conservación de su operación. El trabajo del asistente puede continuar en la instalación aislada existente mientras se retoman después los ensayos pendientes del multihotel.

## Qué debe estar usable para el 29/11

- Chat dentro de **Soporte del sistema**, con texto, captura y seguimiento del mismo caso.
- Ayuda práctica sobre el sistema, leyendo documentación y código de la versión que corresponde al ambiente investigado.
- Diagnóstico que muestre lo observado, las dudas, la evidencia y un siguiente paso útil. Si falta información, pide sólo lo necesario.
- Historial persistente y acceso limitado por usuario; la revisión administrativa tiene permisos propios.
- Escalamiento a Marcelo con el caso y la propuesta, mediante la bandeja y los avisos configurados.
- Presupuesto compartido de **US$1 por día para el piloto**, cupos acordados y pausa de inferencia sin interrumpir el PMS.

La lectura inicial es de documentación, código y contexto aportado por el usuario. El código revisado no ofrece acceso a reservas reales, Caja, ARCA, logs operativos o bases del hotel. La integración de lecturas operativas requiere otro desarrollo con permisos y fuentes verificables.

El asistente puede preparar una propuesta revisable; el ejecutor que modifica código y publica automáticamente no forma parte de esta entrega. Los controles contables continuos y la vigilancia de novedades fiscales conservan sus tareas I08 e I09 para una etapa posterior.

## Revisión inicial realizada el 20/11

| Elemento | Evidencia y límite |
| --- | --- |
| Piloto conversacional | Rama **advance/assistant-pilot-20261114**, revisión **63b34fcc6d3e3bc94d04c8e71a76d48102625ebe**. Se revisaron reglas, configuración, servicio de chat y documentación de activación. |
| Rama de integración de Xenia | **feature/xenia-support-approval-foundation**, revisión **bc8e64f080711bba9b36b83cc955c2afde935fec**, fechada 15/11. Su mensaje indica sincronización con Maran conservando el asistente. Hay que contrastar la revisión efectivamente publicada antes de elegir candidato. |
| Maran principal | Se observó main en **41edab2c8b2b103bb1fe346ab0d6455ae2ca9b0d**. No se reemplaza por la rama vieja del piloto ni se fusionan ramas completas para activar el chat. |
| Chat y presupuesto | Hay implementación de conversación, imágenes, reserva y conciliación de gasto, historial, avisos y revisión. Los valores predeterminados no prueban la configuración guardada en el servicio real. |
| Lectura de código | Las reglas distinguen Xenia de Maran y rechazan presentar una investigación de la demo como prueba de una incidencia en producción. |
| Estado publicado | Pendiente de confirmar: chat visible y respuesta real, revisión del PMS/asistente, flags efectivos, permisos, presupuesto persistido y entrega de avisos. |
| Pruebas | Se reutiliza la evidencia previa del plan, incluidas las 18 pruebas simuladas del chat, límites y avisos. Esta revisión no ejecutó una nueva batería ni llamadas pagadas; la aceptación con modelo real sigue pendiente. |

La guía del chat ubica los servicios existentes en **observant-possibility**: PMS **maran-pms** de **demo.maranpms.com.ar**, asistente **charismatic-wonder** y base propia **assistant-db**. Se comprueban los nombres y revisiones actuales antes de configurar; no se recrean servicios que ya funcionan. Los PMS Aurora/Brisa tienen otro modo QA que actualmente excluye IA y no deben recibir a ciegas las variables de este piloto.

## Calendario de trabajo

| Fecha objetivo | Entrega | Cierre comprobable |
| --- | --- | --- |
| **20–21/11** | Revisar lo publicado y fijar candidato | Identificar qué chat funciona, revisiones de PMS/asistente, permisos y configuración pendiente; conservar funcionamiento actual. |
| **22–24/11** | Completar conversación, permisos y límites necesarios | Un caso con captura y seguimiento funciona; historial y separación de usuarios se conservan; presupuesto y corte se aplican en el servidor. |
| **25–27/11** | Evaluar utilidad con casos concretos | Cinco casos anonimizados revisados con Marcelo; corregir problemas encontrados y comprobar los avisos. Las llamadas reales comparten el presupuesto acordado. |
| **28–29/11** | Habilitar y observar el piloto acotado de Xenia | Usuario autorizado puede usarlo; queda registro de versión, respuestas, consumo, incidencias y forma de desactivar sólo la inferencia. |

Las fases pueden adelantarse. Una función que ya esté publicada y aceptada no se reconstruye ni se somete a recorridos manuales repetidos sin una razón concreta. Los fallos, cambios de código o configuración y dudas sin resolver determinan qué verificaciones hay que completar.

## Primeras acciones técnicas

1. Confirmar si **demo.maranpms.com.ar → Soporte del sistema** ya muestra el chat y responde. Se pidió este estado a Marcelo.
2. Registrar las revisiones efectivas de **maran-pms** y **charismatic-wonder**, la conexión entre ambos y los flags de activación, sin copiar secretos al chat o al repositorio.
3. Contrastar el código publicado con las dos referencias del piloto. Elegir una revisión compatible para ambos servicios y conservar los arreglos que ya tenga Xenia.
4. Revisar permisos de chat, revisión y acceso a casos, y el presupuesto realmente guardado en assistant-db. El límite acordado no se aumenta.
5. Verificar el perfil de modelo y las tarifas vigentes antes de admitir gasto. La documentación tiene una referencia de precios del 9/11; no se toma como verificación vigente ni como garantía de configuración real.
6. Preparar sólo las correcciones faltantes en una rama aislada. Reutilizar pruebas pertinentes ya aprobadas y completar las que correspondan a cambios o fallos; no realizar llamadas pagadas desde pruebas automáticas.
7. Obtener la primera conversación completa aceptada en Xenia y continuar con el catálogo de cinco casos.

No hace falta terminar la continuidad del acceso central de Aurora/Brisa, la recuperación de todas las bases o el aprovisionamiento multihotel para comprobar este chat aislado. Esos hitos conservan su importancia para incorporar hoteles en uso y no se declaran completados.

## Cinco casos para aceptar el piloto

| Caso | Resultado esperado |
| --- | --- |
| Ayuda para editar fechas o tarifas | Orientación sustentada en la versión investigada; nombres de acciones reales y seguimiento si falta contexto. |
| Error de una pantalla con captura | Aprovecha lo que ya se ve, pide el dato indispensable y evita inventar una causa o una corrección. |
| Incidencia de comprobante o cuenta corriente | Explica qué puede verificar del código; no afirma consultar movimientos ni ARCA y no recomienda repetir operaciones ante estados inciertos. |
| Sesión vencida o acceso denegado | Identifica el ambiente y ofrece el recorrido correcto sin pedir credenciales ni ampliar permisos. |
| Problema ya corregido o evidencia insuficiente | Puede concluir sin cambio necesario o verificación pendiente, conservando las correcciones humanas del caso. |

Estos casos usan datos ficticios o anonimizados. La calidad de respuestas reales se registra aparte de los resultados de proveedores simulados.

## Controles mínimos de salida

- PMS y asistente identifican la revisión compatible y el contexto Xenia; un incidente de Maran no se atribuye a la demo sin evidencia.
- Dos usuarios autorizados conservan sus casos separados; los permisos de revisión no se obtienen por conversar.
- La conversación, sus capturas admitidas y los avisos persisten después de recargar y reiniciar el asistente.
- La base y credenciales del asistente son propias. El servicio no obtiene acceso operativo general ni permiso para publicar.
- Se comprueban presupuesto persistido, solicitudes simultáneas, duplicados, consumo incierto y renovación a las 00:00 de Argentina. Las nuevas llamadas se pausan si el saldo no es verificable.
- La bandeja conserva las alertas; el correo se prueba únicamente con el destinatario y remitente ya configurados para el piloto. Un envío fallido no pierde el caso.
- Al agotarse el presupuesto o caer el asistente, el PMS sigue funcionando y permite conservar el reporte.
- Existe una forma comprobada de desactivar las llamadas pagadas y el acceso al asistente. Desactivar sólo la conversación no debe habilitar un circuito antiguo que eluda el presupuesto.

## Después de este piloto

I06 conserva la eventual incorporación de Soporte a Maran mediante una entrega revisada y con sus permisos. I07 amplía herramientas de lectura operativa. I08 incorpora controles contables deterministas con evidencia. I09 incorpora vigilancia normativa con fuentes oficiales, fechas y revisión. El ejecutor de correcciones y la publicación aprobada tienen su propio circuito.

El objetivo del 29/11 es un piloto de soporte utilizable y medido en Xenia, no cerrar todas esas capacidades.

## Fuentes consultadas

- [Reglas conversacionales del piloto](https://github.com/marcesvetliza-ui/maran-pms/blob/63b34fcc6d3e3bc94d04c8e71a76d48102625ebe/docs/asistente-conversacional-reglas-y-limites.md).
- [Guía de activación de Xenia](https://github.com/marcesvetliza-ui/maran-pms/blob/63b34fcc6d3e3bc94d04c8e71a76d48102625ebe/docs/asistente-conversacional-xenia-despliegue.md).
- Código revisado: services/programming-assistant/chat-rules.ts, chat-service.ts, budget.ts e index.ts.
- [Plan maestro](PLAN_MAESTRO_XENIA_MARAN.md) y [tablero de tareas](TABLERO_TAREAS.csv).
