# Límites de inferencia causal del piloto — 2026-10-28

El informe recibido contra 869daf79 reconoce el constructor de fechas, pero usa esa lectura para descartar un fallo del envío histórico y sustituye la causa por una supuesta pérdida de datos. Luego propone cambios de persistencia mientras admite no haber inspeccionado su código. La etiqueta hipotesis no subsana esas contradicciones.

Se incorpora inferenceLimitIssues al control previo a la auditoría. Son controles lingüísticos acotados de contradicciones explícitas, no un verificador semántico universal:
- detectar la exclusión de un fallo del incidente por la generación de XML/código actual;
- detectar una reparación incondicional de persistencia que el propio informe admite no haber inspeccionado.

Se conservan negaciones, explicaciones acotadas al código actual, comprobaciones futuras y reparaciones explícitamente condicionadas a un hallazgo. No se equipara falta de acceso a datos operativos con falta de inspección del código de persistencia. El control no interpreta la certeza como una autorización para reparar datos.

La orientación y auditoría fiscal incluyen además la aplicación local posterior a confirmar estado emitida/CAE, para no atribuir requisitos del XML a la fase equivocada. Una respuesta puede concluir honestamente que no se identificó la causa histórica, sin inventar otra ni recomendar cambios.

La fixture guarda las afirmaciones del último informe en formato SupportDiagnosis. La regresión lo rechaza pese a citas válidas y a un auditor simulado permisivo; otro caso verifica corrección + auditoría independiente de una conclusión que declara causa no determinada. Hay controles positivos y negativos y un ejemplo de persistencia de stock para no limitar la regla a fechas fiscales.

Validación: 21 archivos / 206 pruebas del asistente correctas; TypeScript y bundle del servicio correctos. Proveedores simulados; no se llamó al modelo ni se consultó la base operativa. No se cambia Facturación ni se ejecutan operaciones fiscales. Falta evaluar una respuesta real tras desplegar ambos servicios desde la misma revisión.

## Seguimiento de la respuesta real e4eac61f — 2026-11-02

La nueva investigación ya usa la revisión actual y recupera correctamente la
identidad de la NC, pero presenta como sustentada en código una posible fecha
mal asignada que admite no conocer. Además dice que esto queda evidenciado por
el rechazo del proveedor y su catch. El catch acredita el transporte/guardado del
error, no el valor enviado ni el defecto concreto de la entrada.

Se conserva el texto recibido en assistant-nc-unobserved-date.json. Se agregan dos
controles acotados: contradicción entre entrada del intento explícitamente
desconocida y causa sólo posible etiquetada sustentado_en_codigo, y atribución de
esa entrada como evidenciada por el error. Se amplían las instrucciones del autor
y del auditor: localizar una expresión defectuosa o declarar causa histórica no
determinada, sin exigir una reparación ni logs genéricos. Una hipótesis
condicional o un defecto estático localizado siguen siendo admisibles.

Estos controles lingüísticos no garantizan toda la calidad semántica ni prueban
la causa del incidente. No hay cambios de Facturación, datos operativos, modelo,
credenciales ni límites. No se reescribe el informe histórico.

Verificación: 21 archivos / 215 pruebas del asistente; TypeScript del servicio y
bundle correctos. Se prueba rechazo del texto nuevo incluso ante auditor simulado
permisivo, y corrección completa seguida de auditoría independiente. Sin llamadas
pagadas al modelo ni acceso a la base operativa. La nueva evaluación real queda
pendiente después de desplegar PMS y asistente con la misma revisión.
