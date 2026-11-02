# Revisión razonada de recuperación de NC — 2026-11-02

La respuesta real 0577749c reconoce la construcción de fechas pero deduce que
faltan en el XML a partir de falta de CAE, e indica que una NC pendiente sin CAE
bastaría para reproducir 10049. La aplicación local leída sólo exige emitida,
CAE y conciliación pendiente. Ese guard no prueba la ausencia de fechas ni el
rechazo del proveedor. No se acepta este informe como una reparación fundada.

## Cambio de auditoría

La recuperación de NC exige tres comprobaciones independientes en la misma
llamada existente: inferencia causal, reparación/acción y premisas de las pruebas.
Cada una identifica un statementId del campo revisado, razón, contraejemplo,
lectura y cita literal. Las lecturas pueden proceder de citas, decisionBrief o
pruebas operativas ya consultadas, sin duplicar su contenido. El servidor valida
el índice, el campo, la literalidad en el contexto y en el código original, y la
coherencia con el veredicto. No acepta apoyar una conclusión sin lectura citada;
si falta evidencia, debe rechazar o acotar el informe, no inventar una causa.

Se aplica al recorrido de recuperación de NC, sin exigir que la consulta contenga
10049 o nombres de fechas. Las instrucciones específicas de fechas sólo se
agregan cuando corresponde a esa cobertura. Otros recorridos conservan su
contrato actual. El cambio no añade expresiones para bloquear la frase nueva.

No se agrega otra llamada ni cambian modelo, credenciales o límites (100000
por caso, 3200 salida de auditoría). Los esquemas y metadatos nuevos forman parte
de la estimación y reserva existentes. Una auditoría incompleta o contradictoria
no se convierte en aprobación. Los logs sólo agregan categorías de fallo; no
textos de revisión ni citas privadas. Los informes históricos no se reescriben.

## Verificación y límites

22 archivos / 229 pruebas correctas; TypeScript y bundle del servicio correctos.
Se verifica falta/duplicación de comprobaciones, referencias ajenas, citas falsas,
respaldo ausente, veredictos que ignoran un rechazo, aplicación a la consulta
original y corrección completa seguida de reauditoría. La respuesta nueva se
conserva en assistant-nc-cae-as-missing-dates.json.

Los proveedores son simulados. La fixture simulatedFiscalAudit comprueba sólo
protocolo/procedencia: sus razones y citas NO acreditan capacidad semántica del
modelo. Una cita real tampoco demuestra que el razonamiento sea correcto.
Falta evaluar una respuesta real con los dos servicios en la misma revisión.
No se accedió a la base operativa ni se ejecutaron operaciones fiscales o llamadas
pagadas a OpenAI. No hay cambios de facturación, PMS productivo o datos del hotel.
