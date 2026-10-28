# Seguimiento de fechas fiscales del asistente — 2026-10-28

El segundo informe recibido contra ab572c1e afirmó que las fechas fiscales no se completaban por no verlas en recoverGroupCreditNote, admitió no inspeccionar su asignación y trasladó preguntas de implementación al usuario. En esa misma revisión, authorize usa emitirFactura, que pasa la fecha persistida a feCAESolicitar; buildServiceDates construye los tres campos y el cliente los inserta en el XML. Existen aserciones del XML con proveedor simulado, incluidas NC. Esa evidencia contradice la ausencia afirmada, pero no acredita la causa ni la resolución del incidente histórico.

Para casos de recuperación de NC de grupo/reserva que preguntan por fechas fiscales se agrega un recorrido acotado de llamadas: alias de autorización, fecha del intento, cliente fiscal, constructor, serialización y pruebas existentes. Autor, corrección y auditor reciben las mismas preguntas y evidencia. No se incorpora una causa prefijada ni se ejecuta el circuito fiscal.

El control de cobertura requiere citas del llamador, constructor y serialización. La auditoría independiente contrasta esas lecturas con la afirmación; agregar citas sin corregir una causa contradictoria no elimina una auditoría rechazada. La fixture conserva el informe recibido estructurado como SupportDiagnosis. Una nueva prueba verifica rechazo del informe original con sus citas leídas y otra conserva dos rechazos semánticos aun con citas completas. También se comprueba el camino corregido con auditor simulado y el alcance de la orientación.

Validación: 20 archivos / 188 pruebas correctas; TypeScript y bundle del servicio correctos. No se hicieron llamadas reales al modelo, no se consultó la base operativa ni se modificó facturación. Pasar pruebas con proveedor simulado no demuestra calidad de una nueva respuesta real ni aceptación de ARCA.

Destino: exclusivamente Xenia, rama fix/assistant-diagnostic-format. PMS y asistente deben desplegar la misma revisión antes de la siguiente evaluación real. No fijar manualmente una versión ficticia para evitar el control.
