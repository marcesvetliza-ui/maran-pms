# Primera entrega: consultas y revisión simulada en Xenia

## Incluido

- Permiso independiente `sidebar:/programming-support`: crear y seguir consultas propias sin conceder Seguridad de claves.
- Permisos `api:support:view-all` y `api:support:review`: bandeja de administración y revisión. Se siembran para admin una sola vez con el mecanismo existente; los demás roles requieren concesión explícita. Las exclusiones del piloto externo se conservan.
- El PMS construye identidad, visibilidad, capacidad de revisión y modo de ejecución al reenviar cada solicitud. No acepta esos privilegios del navegador.
- Investigador simulado opcional: solicita una respuesta, luego crea un informe y un cambio ficticios. Cero invocaciones al proveedor; tampoco se envía el correo existente en ese modo.
- Bandeja de todos los casos para administración. Cada operador sigue viendo solo los suyos. Ver todos no permite enviar mensajes o evaluaciones en nombre de otro operador.
- Propuesta vinculada al informe y revisión del código, con hash del contenido, destino y comprobaciones. Aprobar, rechazar y pedir ajustes queda registrado con actor y fecha.
- La aprobación simulada no publica archivos, no modifica datos y no marca el caso resuelto. Información nueva o una nueva investigación invalida el candidato; se conserva el historial.
- Decisiones idempotentes y serializadas en la base propia del asistente. No se aprueba dos veces por doble clic o por pérdida de respuesta.

## No incluido en esta entrega

El agente real de Codex, preparación de parches reales, ejecutor, publicación automática, avisos nuevos por correo y uso general en Maran corresponden a las siguientes etapas del plan. El notificador anterior no se considera la implementación del informe por correo solicitado. El circuito simulado no autoriza despliegues posteriores.

## Activación del ensayo, después de revisar el cambio

El código se prepara en una rama nueva, distinta de la rama desplegada de Xenia. No se ha cambiado Railway.

1. Publicar PMS de Xenia y servicio del asistente desde la misma revisión completa. Mantener `APP_ENV=pilot`, el secreto compartido existente y la base propia del asistente. No utilizar la base del hotel para el servicio.
2. Configurar `SUPPORT_WORKFLOW_SIMULATION_ENABLED=true` en ambos servicios. El servicio usa el simulador incluso si ya existe una API key. Una diferencia entre el modo esperado por el PMS y el del asistente bloquea el inicio de la investigación, antes de llamar al modelo.
3. Mantener los avisos por correo desactivados. No activar el modo legado por accidente para "probar" la pantalla.
4. Conceder solo el permiso de soporte a un rol piloto seleccionado. Mantener revisión y visibilidad global en admin. No añadir usuarios externos hasta indicación de Marcelo.
5. Un usuario crea un caso sintético y solicita el diagnóstico. Recibe una pregunta, responde y continúa. La pantalla muestra explícitamente que es una demostración.
6. Admin abre su bandeja, revisa el informe y el cambio ficticio, registra una aprobación simulada. El operador la ve; no se despliega nada.
7. Agregar información, intentar aprobar la versión anterior, repetir la decisión y reiniciar el servicio. Verificar invalidación, idempotencia y persistencia.

No solicitar ni copiar claves al chat. El destinatario y el resumen por correo se configurarán en una entrega posterior; no se reutiliza el correo de backups de forma implícita.

## Validación

Pruebas de dominio sobre hashes y decisiones; pruebas de pantalla; pasarela HTTP con intento de falsificar capacidades; PostgreSQL local con esquema desechable para conversación, aislamiento entre usuarios, bandeja administrativa, reinicio, decisiones repetidas y concurrencia entre respuesta y aprobación. Regresiones del servicio anterior y de sus aclaraciones. Comprobación de tipos del PMS y del servicio; compilación del PMS.

Los tests usan un proveedor que falla si se lo invoca: un éxito no depende de una llamada pagada. No equivalen a una evaluación de calidad del futuro agente real.

Resultado local de esta entrega: 31 pruebas aprobadas (8 de decisiones, 15 de pantalla, 2 de pasarela, 5 de persistencia/servicio y 1 de aclaraciones). Compilación del PMS y comprobación de tipos del servicio aprobadas. Sin llamadas pagadas, correo ni despliegues.
