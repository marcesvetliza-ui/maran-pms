# Revisión del diagnóstico de NC pendiente — 2026-10-27

El informe recibido contra 1b85b81b confundió recuperación de una NC pendiente con reemplazar una factura y eliminar un pago. La cita server/routes.ts:215–235 pertenece a referencias de documentos de Restaurant, no a la conciliación descrita. No se considera un diagnóstico válido de la causa operativa.

Cambios exclusivos del asistente piloto:
- Orientación acotada para casos que informan NC pendiente de grupos/reservas: handler real de recuperación, identidad guardada, error persistido, acción de Facturación, petición/catch del cliente y pruebas con su alcance simulado.
- Las preguntas y lecturas pertinentes se comparten entre investigación y auditoría. No se precarga una conclusión ni se presupone autorización, rechazo o aplicación local.
- El diagnóstico debe citar la recuperación y su pantalla; el control de procedencia por sí solo era insuficiente. Cambiar certeza no permite publicar el mismo informe sin respaldo del circuito.
- Auditoría contextual independiente después de corregir las citas. No se eleva presupuesto ni se omite auditoría.
- No se aplica esta orientación a SPA, Restaurant, emisión inicial, eliminación corriente de pagos ni casos cuyo origen no identifica grupo/reserva.

La fixture conserva las afirmaciones del informe recibido, estructuradas como SupportDiagnosis. La regresión verifica su rechazo aunque todos sus rangos hayan sido leídos; verifica también corrección + auditoría, alcance entre módulos y ausencia de bypass bajando certeza.

Validación: 19 archivos / 183 pruebas correctas; TypeScript y bundle del servicio correctos. Las respuestas del proveedor son simuladas: no se llamó al modelo ni se ejecutaron operaciones del hotel. No se afirma calidad semántica universal; queda pendiente evaluar otra respuesta real después del despliegue.
