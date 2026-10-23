# Aclaraciones operativas antes del diagnóstico

Rama de revisión desde 55f05371. Este cambio no acredita resuelta la calidad semántica del auditor ni sus falsas aceptaciones conocidas.

El autor puede solicitar, antes de redactar, hasta dos datos operativos indispensables: mensaje exacto, pantalla/acción o resultado visible posterior. Las preguntas las redacta el servidor mediante plantillas; la herramienta no acepta preguntas libres ni instrucciones técnicas. No corresponde preguntar por datos ya presentes en el caso o resolubles leyendo el repositorio.

La solicitud se guarda como `clarification`, sin informe ni notificación de diagnóstico. La interfaz pide guardar una respuesta y luego continuar explícitamente. El servidor también bloquea continuar sin un nuevo mensaje guardado. No hay llamada automática al proveedor al guardar el mensaje.

Una aclaración no puede sustituir un borrador ni eludir un rechazo del auditor. Se conservan esquema, controles, presupuesto, corrección y segunda auditoría. Los registros de fallo incorporan revisión de código e identificadores/campos cuestionados; no guardan el texto privado rechazado. Los registros antiguos no permiten reconstruir la frase que causó el rechazo.

## Verificación

- Suite del asistente: 171 pruebas.
- Interfaz de soporte: 7 pruebas.
- Servicio PostgreSQL aislado y aclaraciones: 4 pruebas, usando únicamente una base local desechable y esquemas temporales.
- TypeScript global y del servicio; compilación de aplicación y bundle del servicio.

Las pruebas usan proveedor simulado. No hubo llamadas pagadas, acceso a datos operativos ni evaluación del modelo real. Debe comprobarse por separado que el modelo elige bien cuándo preguntar y que el auditor discrimina errores materiales. Este parche no modifica facturación ni despliega el demo.
