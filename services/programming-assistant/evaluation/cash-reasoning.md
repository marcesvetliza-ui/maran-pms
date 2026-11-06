# Piloto: comprobantes, movimientos de caja y pruebas sin operaciones reales

## Caso recibido

La respuesta de la revisión 73a68f34 explicó la diferencia 0 - 440.000, pero atribuyó `informational` a los comprobantes no fiscales sin demostrar cómo se creaban los cobros de SPA. Además propuso cerrar turnos para comprobarlo. El texto recibido se conserva en `services/programming-assistant/evaluation/spa-cash-received.json`; las pruebas no reemplazan esa evidencia por un diagnóstico inventado.

## Corrección

- Orientación por código real: clasificación documental, conteo/diferencia del cliente, acumulación del cierre y creación de un cobro de SPA. Se preserva la prioridad de los recorridos específicos de NC, concurrencia fiscal, compras e inventario.
- Reglas compartidas para autor, revisión final y auditor: clase del comprobante, tipo de movimiento y medio de pago son independientes. Excluir informational de un bucle no demuestra que los no fiscales entren en esa rama. No inferir estado histórico no consultado ni inventar cantidades para que cuadre.
- Control determinista de generalizaciones explícitas en ambos sentidos: no fiscal no implica informativo, ni implica siempre dinero nuevo. También rechaza propuestas de prueba que ejecuten cierres, cobros u otros cambios de estado sin explicitar simulación/aislamiento.
- Un borrador incompatible debe corregirse y pasar la auditoría. Si insiste, se bloquea la entrega; no basta rebajar su etiqueta de certeza. Se conservan límites, modelo configurado y número máximo de correcciones.

## Pruebas y límites

Las pruebas son offline, con respuestas del proveedor simuladas, sin candidatos ni llamadas facturables. Comprueban rechazo del texto recibido, aceptación de negaciones y condiciones válidas, lecturas trazables del flujo, bloqueo incluso ante auditor simulado permisivo y corrección seguida de auditoría independiente. No prueban que el próximo diagnóstico del modelo real será correcto.

La suite completa del asistente tiene 11 fallos previos reproducidos en un checkout limpio de 73a68f34: cuatro archivos de navegación, referencias y auditoría apuntan a fragmentos anteriores de Prefactura/Compras y a números de línea antiguos de una prueba de concurrencia. Esos casos requieren una revisión separada; no se reescribieron fixtures para esconderlos. El error EPERM del gateway en la primera corrida se comprobó nuevamente con permisos para servidor HTTP local.

No se cambia el cálculo de caja, los movimientos del hotel, los informes, el modelo ni las autorizaciones de usuarios. El siguiente paso es repetir una sola vez el caso en una consulta nueva del piloto y revisar la respuesta completa, sus citas y sus propuestas. La respuesta anterior se conserva como fallo de referencia.

La respuesta recibida, las respuestas esperadas y este informe se guardan fuera de las raíces server/client/shared/docs del catálogo del investigador. El wrapper de Vitest no contiene diagnósticos. Así la siguiente prueba no recibe como contexto estos resultados de evaluación.
