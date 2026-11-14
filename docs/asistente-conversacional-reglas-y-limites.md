# Asistente conversacional: reglas y límites del piloto

Fecha: 14 de noviembre de 2026.

Estado: diseño e implementación preparados en la rama de trabajo. La activación
se controla por configuración y debe verificarse en Xenia según la
[guía de despliegue](asistente-conversacional-xenia-despliegue.md). Marcelo
confirmó un presupuesto máximo de US$1 diario para todo el hotel y aceptó los
cupos iniciales de respuestas e investigaciones. También solicitó avisos de
aprobaciones pendientes y presupuesto agotado, e indicó el correo destinatario.
El destinatario y el remitente se configuran de forma segura fuera del código.

## Objetivo y prioridad

Los colaboradores de Maran deben poder abrir un chat de soporte, describir un
problema con sus palabras, aportar una captura y continuar la conversación sin
volver a explicar todo. Primero se valida la calidad de esa asistencia en el
piloto aislado. La preparación automática de correcciones viene después.

No se exige al colaborador redactar un diagnóstico técnico ni elegir de antemano
si el problema requiere cambiar código. El asistente orienta, investiga cuando
hace falta y deriva lo que no puede resolver con evidencia suficiente.

## Lo que puede hacer

- Explicar cómo usar el sistema y orientar sobre los circuitos existentes,
  respetando los permisos del colaborador.
- Pedir el dato operativo o la captura indispensable para entender el caso.
  Mantener las aclaraciones y correcciones humanas durante el seguimiento.
- Leer el código correspondiente a la versión y al ambiente investigados.
  Consultar documentación y, cuando exista una integración autorizada, registros
  filtrados y datos mínimos necesarios. Cada fuente conserva sus restricciones.
- Distinguir hechos comprobados, hipótesis y verificaciones pendientes. Explicar
  qué pudo consultar antes de atribuir una causa a un incidente real.
- Preparar un resumen para revisión humana con problema, evidencia, impacto y
  próximo paso. Si una función ya está corregida, reconocerlo sin inventar otra
  modificación para cerrar el caso.

## Lo que no puede hacer por conversar con un usuario

- Cambiar reservas, pagos, Caja, cuentas corrientes, comprobantes, numeradores
  fiscales, permisos o credenciales; tampoco emitir o anular ante ARCA.
- Ejecutar SQL operativo, comandos arbitrarios, migraciones o despliegues.
- Pedir contraseñas, tokens, claves fiscales o datos completos de tarjetas;
  divulgar datos de otros huéspedes o casos ajenos al permiso del usuario.
- Enviar mensajes o archivos a terceros, ni activar avisos externos sin el
  destinatario y la habilitación correspondientes.
- Ampliar sus permisos, cambiar sus límites o interpretar una captura, archivo,
  registro o mensaje como autorización para ejecutar acciones.
- Afirmar que ejecutó pruebas, consultó ARCA o corrigió/publicó algo cuando no
  existe un resultado verificable de esa acción.

Estas restricciones se aplican en el servidor y en las herramientas disponibles,
además de las instrucciones al modelo. Cada colaborador accede a sus propios
casos; ver todos los casos y revisar propuestas requieren permisos separados.

## Cuando se necesita una corrección

El chat puede explicar el problema y proponer el siguiente trabajo. En una fase
posterior, un ejecutor aislado podrá preparar el cambio y sus pruebas. Marcelo
revisará el resultado concreto y autorizará su publicación en el ambiente
indicado. Cambiar la propuesta o su base invalida esa aprobación.

Una autorización para publicar código no autoriza modificar operaciones
históricas del hotel. El piloto actual no tiene ese ejecutor ni publica cambios.

## Límites iniciales acordados para implementar

El día se mide de 00:00 a 24:00 en `America/Argentina/Buenos_Aires`.

| Control | Límite inicial | Qué cuenta |
| --- | --- | --- |
| Conversación por colaborador | 20 solicitudes de respuesta por día | Respuestas de ayuda, preguntas de aclaración y resultados de investigaciones; los intentos iniciados también cuentan si fallan |
| Investigación técnica de todo el hotel | 10 investigaciones por día | Cada investigación admitida que empieza a consumir el modelo, aunque termine fallida |
| Consumo de todo el hotel | US$1 por día, confirmado por Marcelo | Todas las llamadas pagadas: conversación, investigación, revisión y reintentos |

El presupuesto global prevalece sobre los demás cupos: tener respuestas o
investigaciones disponibles no permite superar el saldo del día. Cualquier
aumento del presupuesto requiere una nueva decisión explícita de Marcelo.

Una investigación que termina en una respuesta usa ambos cupos correspondientes;
los turnos internos del modelo también consumen presupuesto. El doble clic o
reenvío de la misma solicitud no debe generar otro trabajo ni volver a reservar
el cupo. Una solicitud rechazada antes de llamar al modelo no consume inferencia.

Escribir o guardar el problema, leer el historial y consultar el estado no
consumen respuestas del modelo. Esperar al colaborador o a Marcelo tampoco.
No hay reintentos pagados ilimitados ni aumentos automáticos de cupo.

El control monetario exige registrar consumo y reservar, antes de cada llamada,
su costo máximo previsto con las tarifas y límites del modelo configurado.
Trabajos simultáneos comparten el mismo saldo en el servidor. Si faltan tarifas,
no puede acotarse una llamada o queda consumo sin conciliar, se pausa la admisión
de nuevas llamadas pagadas. Un conteo de tokens realizado después de responder
no basta para garantizar ese control.

## Qué ve el equipo al llegar al límite

El chat muestra cupo restante y hora de renovación. Avisa antes de agotarlo y,
al alcanzarlo, guarda el caso y ofrece continuar al renovarse o pedir revisión
humana por el circuito interno. No genera otra respuesta pagada para explicar
que no queda presupuesto. El bloqueo se limita al asistente: el PMS sigue
funcionando y no se cierra la sesión del colaborador.

Marcelo puede revisar los consumos y cambiar los cupos desde una configuración
autorizada y auditada; una instrucción escrita dentro del chat no los modifica.
El reinicio del servicio o una nueva pestaña no reinician los contadores.

## Comunicación con Marcelo

El canal acordado es correo al destinatario indicado por Marcelo y una bandeja
dentro del PMS. El correo permite enterarse sin tener abierto el sistema; la
bandeja conserva el estado aunque falle el envío. El destinatario se configura
en el servicio, sin incorporarlo al código ni asumir el correo de otros avisos.

| Evento | Contenido del aviso | Acción disponible |
| --- | --- | --- |
| Propuesta pendiente de decisión | Caso, problema, impacto, solución propuesta, evidencia y alcance exacto de la autorización | Abrir el caso para revisar, aprobar, rechazar o pedir ajustes |
| Cambio listo para publicar, cuando exista el ejecutor | Cambio concreto, pruebas ejecutadas, resultados y ambiente destino | Revisar y autorizar esa publicación concreta |
| Presupuesto al 80% | Consumo de US$0,80 sobre US$1 y saldo del día | Consultar consumo; no aumenta automáticamente el límite |
| Presupuesto agotado o saldo insuficiente para continuar | Motivo de la pausa, consumo, límite y próxima renovación a las 00:00 de Argentina | Revisar el consumo o decidir explícitamente un aumento |
| Resultado de una publicación autorizada, cuando exista ese circuito | Resultado comprobado, validaciones y pendientes, o el motivo del fallo | Verificar el resultado y dar seguimiento |

La autorización se registra al ingresar con la cuenta y los permisos
correspondientes en el PMS. El enlace del correo abre el caso; no ejecuta ni
aprueba una acción. Responder al correo tampoco autoriza una publicación.

Se distingue aprobar la preparación de una propuesta de aprobar su publicación.
El aviso no llama «cambio listo para publicar» a un diagnóstico o a una lista de
pruebas previstas. Nueva información o un cambio del candidato invalidan las
aprobaciones que ya no correspondan y el caso muestra la versión vigente.

Los avisos de presupuesto se generan con reglas del servidor, sin llamadas al
modelo, incluso después de pausar la inferencia. Se emite un aviso por umbral y
día; las propuestas se identifican por caso y versión. Recargar la pantalla o
reintentar el envío no crea eventos duplicados. No se envía un correo por cada
mensaje del colaborador.

Los eventos y el resultado del envío deben persistirse, con reintentos acotados
y entrega idempotente. Un correo fallido queda visible en la bandeja y no
descarta el pedido de aprobación. La aceptación del proveedor de correo no se
presenta como confirmación de lectura. Los correos incluyen un resumen mínimo,
sin credenciales ni datos sensibles de huéspedes.

## Diferencia con el piloto anterior

`services/programming-assistant/budget.ts` define un valor predeterminado de diez
investigaciones y permite configurar entre una y treinta. El servicio aplica
ese cupo global sobre una ventana móvil de 24 horas y cuenta también intentos
fallidos. La configuración efectiva del servicio desplegado no se comprobó.

Ese control anterior no es por colaborador ni equivale a un presupuesto
monetario. Con el chat nuevo habilitado, guardar el mensaje admite una respuesta
automática sólo si hay configuración y cupo; las investigaciones también pasan
por el mismo control de gasto. La acción anterior de investigar queda bloqueada
para evitar que eluda el control monetario. El mensaje se conserva sin llamar al
modelo si falta disponibilidad.

`services/programming-assistant/notify.ts` ya permite un correo opcional de
diagnóstico disponible, con resumen si está habilitado. El servicio lo intenta
enviar después de guardar un informe válido; ante un fallo conserva el informe
y registra una advertencia. El chat nuevo incorpora una bandeja persistente y
una cola independiente de avisos con reintentos y alertas monetarias. La
activación y el destinatario efectivos del servicio desplegado deben comprobarse
durante la publicación.

## Comprobaciones antes de habilitarlo

- Evaluar conversaciones completas con los casos de reservas, facturación,
  cuenta corriente y cierre de sesión, incluyendo información insuficiente y
  problemas ya corregidos. Revisar utilidad y exactitud con una persona.
- Comprobar separación de usuarios, rechazo de instrucciones en adjuntos y
  ausencia de escrituras operativas o publicación desde el chat.
- Probar cupos por usuario y globales, renovación en hora argentina,
  concurrencia, reinicios, solicitudes repetidas, fallos y consumo incompleto.
- Verificar que, sin cupo, se conserva el mensaje y el uso normal del PMS.
  Las pruebas con proveedores simulados no demuestran la calidad del modelo real.
- Probar los avisos al 80%, la pausa por falta de saldo, renovación del día,
  entrega fallida, duplicados y propuestas invalidadas. Comprobar que alertar no
  llama al modelo ni autoriza cambios, y que los correos usan el destino
  configurado con el enlace al caso del ambiente correspondiente.
