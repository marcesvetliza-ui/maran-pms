# Continuidad de ajustes y conclusiones del piloto — 2026-11-12

El informe recibido sobre Consumo Interno reconocía que el catch ya mostraba el
error del servidor, pero proponía modificar otro fallback sin demostrar una
falla pendiente. El comentario humano había pedido expresamente retirar esa
propuesta. No se cambió Inventario para resolver este caso.

La causa comprobada en la orquestación era que `investigationCase` omitía los
comentarios de aprobación, rechazo y solicitud de ajustes: estaban guardados en
`workflowEvents`, fuera de `messages`. Ahora el autor, sus correcciones, el cierre
y los revisores reciben los últimos cinco comentarios humanos (hasta 2000
caracteres cada uno), sin reutilizar diagnósticos como evidencia ni aceptar
permisos o instrucciones de herramientas desde el contenido del caso.

El informe distingue `code_change`, `verification` y `no_change`. Los esquemas
nuevos del proveedor exigen elegir; los informes históricos siguen siendo
legibles. Sólo `code_change` con evidencia, causa, propuesta y certeza sustentada
puede generar una propuesta para aprobar. La pantalla presenta “Comprobación
pendiente” o “Sin cambios necesarios” y no ofrece una aprobación de código para
esos resultados. Las validaciones comprueban estructura y procedencia; no pueden
demostrar mecánicamente que una afirmación semántica sea correcta.

La revisión independiente contrasta el ajuste humano con la causa, la reparación
y las pruebas propuestas. Cuando hay ajustes previos, ambos motores exigen tres
comprobaciones justificadas, contraejemplo y citas literales verificables. No se
acepta aprobar con una comprobación no sustentada o una cita inventada. El motor
Codex conserva una sola corrección y una revisión nueva e independiente. No se
agregan llamadas recursivas, no se aumenta el presupuesto ni el cupo diario.

Se actualizan localizadores del circuito de facturación: el descarte fiscal
actual se comprueba en el servidor, no en el helper eliminado del cliente; se
ubica `run` por su definición para incluir el recorrido completo de pagos; y el
circuito de descuentos de compras sigue `applyPurchaseAdjustments`. El paquete
mantiene sus límites de contexto y señala lecturas incompletas. Los fixtures
históricos conservan sus informes; sus proveedores simulados prueban transporte,
no afirman que una conclusión antigua siga siendo válida sobre código nuevo.

La regresión recibida queda en `evaluation/already-implemented-received.json`,
fuera del catálogo de código del investigador. Las pruebas comprueban que el
comentario llega al autor y a ambos revisores, que una reparación especulativa
rechazada puede terminar como `no_change`, y que PostgreSQL conserva el ajuste
sin crear otra propuesta ni ejecutar otra investigación al consultar el caso.

Validación local: 291 pruebas de la suite completa del asistente, 45 del
investigador Codex y workflow, 21 de pantalla y revisión de propuestas y siete
del servicio con PostgreSQL desechable: 364 correctas. También pasan TypeScript
del servicio y la compilación de Xenia. Los proveedores de estas pruebas
son simulados. No se presenta esta batería como una medición del razonamiento
del modelo real: la próxima investigación del piloto debe evaluarse sobre el
nuevo despliegue, conservando los límites oficiales y sin reescribir informes
anteriores. No se modificaron reservas, facturación, stock, credenciales ni la
configuración del servicio del hotel.
