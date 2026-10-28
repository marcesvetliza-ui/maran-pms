# Límites de inferencia causal del piloto — 2026-10-28

El informe recibido contra 869daf79 reconoce el constructor de fechas, pero usa esa lectura para descartar un fallo del envío histórico y sustituye la causa por una supuesta pérdida de datos. Luego propone cambios de persistencia mientras admite no haber inspeccionado su código. La etiqueta hipotesis no subsana esas contradicciones.

Se incorpora inferenceLimitIssues al control previo a la auditoría. Son controles lingüísticos acotados de contradicciones explícitas, no un verificador semántico universal:
- detectar la exclusión de un fallo del incidente por la generación de XML/código actual;
- detectar una reparación incondicional de persistencia que el propio informe admite no haber inspeccionado.

Se conservan negaciones, explicaciones acotadas al código actual, comprobaciones futuras y reparaciones explícitamente condicionadas a un hallazgo. No se equipara falta de acceso a datos operativos con falta de inspección del código de persistencia. El control no interpreta la certeza como una autorización para reparar datos.

La orientación y auditoría fiscal incluyen además la aplicación local posterior a confirmar estado emitida/CAE, para no atribuir requisitos del XML a la fase equivocada. Una respuesta puede concluir honestamente que no se identificó la causa histórica, sin inventar otra ni recomendar cambios.

La fixture guarda las afirmaciones del último informe en formato SupportDiagnosis. La regresión lo rechaza pese a citas válidas y a un auditor simulado permisivo; otro caso verifica corrección + auditoría independiente de una conclusión que declara causa no determinada. Hay controles positivos y negativos y un ejemplo de persistencia de stock para no limitar la regla a fechas fiscales.

Validación: 21 archivos / 206 pruebas del asistente correctas; TypeScript y bundle del servicio correctos. Proveedores simulados; no se llamó al modelo ni se consultó la base operativa. No se cambia Facturación ni se ejecutan operaciones fiscales. Falta evaluar una respuesta real tras desplegar ambos servicios desde la misma revisión.
