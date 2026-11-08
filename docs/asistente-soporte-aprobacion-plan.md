# Plan de asistente de soporte con aprobación de Marcelo

Fecha: 8 de noviembre de 2026. Primera implementación: Xenia, ambiente piloto.

## Objetivo acordado

Un usuario del PMS describe un problema, responde las aclaraciones necesarias y puede seguir el caso. El agente investiga, prepara una corrección revisable y notifica a Marcelo con el problema, la causa y la solución propuesta. Marcelo aprueba la versión concreta; el sistema ejecuta la publicación autorizada, verifica el resultado e informa a ambos. Una hipótesis, un email enviado o una evaluación favorable del usuario no significan que el error esté corregido.

No es una copia de una conversación de ChatGPT ni una garantía de acierto. Se busca reproducir el método de investigación con código, herramientas, contexto mantenido y comprobaciones, midiendo los resultados.

## Base que se conserva y límites comprobados

- `client/src/pages/programming-support.tsx`: pantalla y seguimiento de consultas.
- `server/routes/programming-support.ts`: pasarela autenticada al servicio; hoy depende de `sidebar:/seguridad`, restringe las acciones y solo permite el piloto.
- `services/programming-assistant/service.ts`: casos persistentes, mensajes, cola de investigación y aclaraciones.
- `services/programming-assistant/source.ts`: lectura de código y evidencia vinculada a la revisión.
- `services/programming-assistant/notify.ts`: notificación por correo existente, opcional; aún no equivale al informe y aprobación solicitados.
- El piloto actual no prepara ni publica correcciones: ese es un servicio nuevo, no una opción escondida del modelo.
- Los intentos aportados por Marcelo muestran respuestas equivocadas o inconclusas, rechazo de revisión y consumo alto. No existe evidencia para declarar al piloto listo ni para afirmar que cambiar solamente el modelo lo resolverá.
- La documentación antigua de Railway tiene nombres de ramas históricos; no se utilizará como configuración efectiva sin contrastarla con el despliegue vigente.

## Experiencia del usuario y de Marcelo

1. El usuario abre Soporte del sistema, indica pantalla, qué pasó y qué esperaba; puede adjuntar evidencia sin claves ni tarjetas. Se registran versión desplegada, ambiente y referencia de la pantalla.
2. La consulta inicia una investigación en cola. Una espera o respuesta pendiente no mantiene consumiendo al modelo. Se reutiliza el mismo caso y se evita duplicar ejecuciones por reintentos.
3. Si falta un dato operativo indispensable, el agente hace una pregunta concreta. El usuario recibe un aviso y responde en el caso. El agente consulta por sí mismo el código y las fuentes técnicas disponibles.
4. El agente produce un informe breve con problema, impacto, causa comprobada o hipótesis explícita, evidencia, solución y límites de lo verificado. Si la causa no se puede determinar, el caso pasa a revisión humana; no se fuerza una solución.
5. Para un cambio de software, el ejecutor prepara una rama aislada, un diff y pruebas pertinentes en un entorno desechable. No toca la aplicación en servicio ni sus bases operativas.
6. Marcelo ve una bandeja de todos los casos y recibe un aviso por correo con un resumen y enlace al expediente. Puede aprobar, rechazar o pedir ajustes. El correo no contiene claves, datos sensibles ni una autorización ejecutable mediante una simple respuesta.
7. La aprobación autenticada identifica el caso, ambiente destino, revisión base, hash del cambio, pruebas y alcance del despliegue. Una modificación del candidato o de su base invalida la aprobación y exige una revisión actualizada.
8. El ejecutor publica exactamente el candidato aprobado, realiza las verificaciones pactadas y deja enlaces a commit, PR, despliegue y resultados. Los fallos detienen el avance; solo se revierte automáticamente cuando existe un procedimiento de reversión comprobado y autorizado.
9. El usuario recibe la actualización y verifica el comportamiento. Se distingue cambio publicado de solución verificada. No se cierra el caso solo porque se desplegó o porque el correo fue entregado.

## Componentes

- PMS: formulario, conversación, permisos, bandeja de Marcelo y acciones de aprobación.
- Servicio de casos: estados persistentes, eventos, cola, trazabilidad, reintentos e idempotencia. Se conserva su base propia.
- Investigador: adaptador sustituible para un agente de programación (evaluar Codex SDK/CLI como primera opción). Confirmar en una prueba técnica su forma de autenticación, modelo efectivo, herramientas y facturación antes de adoptarlo. La suscripción de ChatGPT no se presupone como crédito de API.
- Fuentes de lectura: checkout del commit desplegado, documentación mantenida, logs filtrados de servicios autorizados y diagnósticos técnicos específicos. No se entrega al agente acceso de administrador a todas las cuentas ni una conexión general a producción.
- Ejecutor: checkout/worktree aislado y base sintética; capacidad de preparar cambios. La identidad que publica y despliega queda separada y exige aprobación válida.
- Notificaciones: primero bandeja en el PMS y correo. WhatsApp puede ser una ampliación, sin bloquear la primera versión.

El contexto del proyecto mantiene reglas de caja, grupos, comprobantes fiscales y no fiscales, inventario, permisos y separación Maran/Xenia. Las conclusiones previas se conservan con su evidencia y revisión; no se tratan como verdad para una versión nueva. Los mensajes, adjuntos, logs y archivos del repositorio son datos a investigar, no autorizaciones para ejecutar acciones.

## Permisos

Permisos independientes: crear consultas, ver las propias, responderlas, investigar, ver todos los casos, aprobar correcciones y publicar en cada ambiente. Crear consultas no concede acceso a Seguridad de claves ni a casos de otros usuarios.

El rol admin que usa Marcelo conserva todos los permisos. Para el piloto, los demás usuarios reciben explícitamente crear/ver/responder sus casos; solo la cuenta o rol autorizado por Marcelo puede aprobar. El servidor verifica esos permisos en cada operación: no depende de ocultar botones. La identidad de cada usuario y del aprobador queda registrada incluso si tienen el mismo rol. Mantener las exclusiones de usuarios externos del piloto hasta que Marcelo indique su inclusión.

## Estados

Recibido → investigando → esperando respuesta → investigando → propuesta preparada → esperando aprobación → aprobado → publicando → publicado → verificación pendiente → resuelto.

También: rechazado, requiere revisión humana y falló. Diagnóstico y candidato tienen versiones independientes. La continuación por nueva información invalida propuestas y aprobaciones que ya no correspondan.

Las tareas con credenciales o acciones irreversibles, como modificar movimientos históricos, emitir comprobantes ARCA, enviar dinero o ejecutar una migración destructiva, necesitan un alcance específico y revisable; aprobar una corrección de código no autoriza esas operaciones.

## Calidad y costo

- Un único investigador con herramientas y una respuesta estructurada; conservar la validación verificable de citas y separar hechos, hipótesis y pruebas ejecutadas.
- Evitar ciclos de múltiples redactores y auditores que reenvían todo el contexto. Permitir como máximo una reparación automática del diagnóstico; si falla, derivar con el motivo y la evidencia conservada.
- Límites por caso y por día: llamadas, tokens, tiempo y costo estimado con tarifas configuradas. Medir consumo real reportado y reconciliar con el proveedor cuando exista información de facturación. Un límite de tokens posterior a una llamada no garantiza un tope monetario exacto.
- Pausar el modelo cuando espera al usuario o a Marcelo. No reinvestigar con cada recarga, email o actualización de estado. Cancelación y reintentos idempotentes.
- No ejecutar lotes pagados ni habilitar nuevos servicios con costo hasta acordar modelo, configuración efectiva y presupuesto. El plan no autoriza el presupuesto anterior de US$50.

## Entregas y orden de implementación

### 1. Contratos y circuito, con investigador simulado

Definir esquemas de caso, preguntas, informe, candidato, aprobación y publicación; permisos propios de soporte, bandeja del administrador y registro de eventos. Pruebas de propiedad de casos, respuestas, concurrencia, doble clic y reinicio. Preparar notificaciones desactivadas con estado de entrega independiente.

Salida comprobable: usuario A crea y responde; usuario B no ve su caso; Marcelo ve todos y recibe un informe simulado; una aprobación queda ligada a un candidato inmutable. No hay llamadas pagadas ni publicación real.

### 2. Prueba técnica del agente y comparación

Confirmar la integración real de Codex, sus capacidades y costos; conectar adaptador sin reemplazar todavía el piloto. Mantener una alternativa compatible si la integración concreta no permite la operación requerida.

Evaluar los mismos casos contra revisiones congeladas: diferencia de caja con conteo cero; error de equivalencias de inventario; pago de extras de un grupo con alojamiento cobrado; nota de crédito sobre voucher no fiscal; mapeos Channex y un problema deliberadamente insuficiente que exige una pregunta. Incluir una versión donde el supuesto error ya está corregido.

Salida comprobable: evaluación humana de exactitud, completitud útil, evidencia, calidad de preguntas, tiempo y costo. Ninguna recomendación operativa equivocada en el conjunto crítico; los casos sin evidencia se declaran pendientes. Un fallo material impide habilitar la ejecución. La tanda real depende del presupuesto acordado.

### 3. Ejecutor aislado y candidato revisable

Generar rama/diff, pruebas y propuesta concreta. Las herramientas de lectura no reciben por eso permisos de publicación. Registrar base y hash, y bloquear publicación sin aprobación, con aprobación antigua o con pruebas fallidas. Probar fallos y reinicios sin duplicar cambios.

Salida comprobable: corrección sintética preparada en rama, sin modificar datos ni despliegues del hotel.

### 4. Aprobación y publicación en Xenia

Activar el recorrido completo para un grupo de usuarios piloto. Marcelo aprueba el candidato; se despliega solo en Xenia, se verifica y se informa. Probar rechazos, solicitudes de cambios, errores de despliegue, notificación fallida e intento de aplicar la aprobación dos veces.

Salida comprobable: una consulta real termina en un cambio aprobado, publicado y verificado, con historial completo.

### 5. Uso general y Maran

Habilitar usuarios mediante los permisos definidos. Tras la evaluación del piloto, añadir Maran como destino independiente con su propia autorización, credenciales y verificación. Espejar el código compartido sin copiar datos, secretos, activaciones ni permisos operativos entre hoteles y ambientes. No habilitar el asistente en Maran solo porque su código esté espejado.

## Configuración que falta acordar para activar, no para preparar el código

- Destinatario del correo de Marcelo y remitente verificado; se configurarán de forma segura. No asumir que el destinatario de backups también recibe soporte.
- Identidad de aprobación si otros administradores empiezan a usar cuentas separadas; inicialmente admin conserva sus capacidades conforme a lo pedido.
- Integración/modelo efectivos y presupuesto inicial de evaluación.
- Accesos mínimos para logs y despliegue de Xenia; no reutilizar credenciales de Maran.

## Estado de esta entrega

Plan basado en inspección del repositorio local de Xenia. No se invocó un candidato ni un proveedor pago, no se envió correo y no se modificaron servicios, permisos, bases ni despliegues. El primer incremento acordado es el circuito con investigador simulado; el ejecutor y la publicación requieren las entregas posteriores de este plan.
