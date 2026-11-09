Integración del investigador al chat de Xenia
============================================

Entrega preparada en `feature/xenia-support-approval-foundation`, sin desplegar el PMS ni el servicio existente, sin inferencia pagada nueva y sin enviar correos. El evaluador temporal conserva su selección de revisión; subir este cambio no autoriza otra tanda.

El usuario informa el problema y responde preguntas dentro de Soporte. El administrador ve todos los casos y puede filtrar las propuestas pendientes. La generación de propuestas revisables se habilita por configuración y exige diagnóstico sustentado, validación completa y solución propuesta. Las hipótesis siguen visibles como hipótesis y no generan una autorización de preparación.

Se incorpora el transporte Responses probado en las evaluaciones al servicio, con orientación por la URL real, hasta 16 turnos, 100.000 tokens registrados, 120.000 caracteres de contexto y diez consultas de investigación. Conserva cierre obligatorio, evidencia verificada y revisión independiente. El modelo efectivo informado por Responses se guarda y muestra. Los trabajos encolados vinculan modo, modelo y transporte; un cambio posterior bloquea el trabajo antes de llamar al proveedor.

La interfaz presenta Problema, Causa y Solución, oculta marcadores `null` y el prefijo editorial Corrección. Mantiene intacto el informe original para evidencia y revisión. Las preguntas nuevas se solicitan en lenguaje cotidiano.

La decisión permite aprobar la preparación, rechazar o pedir ajustes. Está ligada al informe completo, la revisión del código y la propuesta mediante huellas. La huella del informe usa orden canónico para persistir correctamente en JSONB. Los cambios de informe, revisión o datos del caso invalidan la aprobación. La repetición de una misma decisión es idempotente; sólo un revisor autorizado puede decidir. El historial conserva el tipo de propuesta para distinguir demostraciones de decisiones reales.

Al aprobar se registra `approved_for_preparation`. NO existe aún ejecutor de cambios ni parche generado por esta entrega: no modifica archivos, datos o despliegues, no ejecuta pruebas propuestas y no marca el problema resuelto. La siguiente fase debe preparar un diff concreto y sus pruebas y vincular una aprobación de publicación a ese contenido. Esta decisión inicial no sustituye esa revisión.

Configuración para el piloto
---------------------------

Aplicar después de revisar esta entrega. Ambos servicios deben usar la misma revisión de esta rama: PMS de Xenia (`maran-pms`, dominio demo) y asistente existente (`charismatic-wonder`). No cambiar Maran producción ni sustituir el servicio por el evaluador temporal. Mantener bases, secretos, permisos y claves existentes y aislados.

En el asistente, conservar Dockerfile `services/programming-assistant/Dockerfile`, `APP_ENV=pilot`, su `ASSISTANT_DATABASE_URL` propia y `SUPPORT_SHARED_SECRET`. Configurar:

```
SUPPORT_INVESTIGATOR=codex
SUPPORT_CODEX_TRANSPORT=responses
SUPPORT_CODEX_MODEL=gpt-5.3-codex
SUPPORT_WORKFLOW_SIMULATION_ENABLED=false
SUPPORT_PROPOSAL_REVIEW_ENABLED=true
ASSISTANT_DAILY_LIMIT=1
SUPPORT_CODEX_PAID_ENABLED=false
```

El valor `false` mantiene la inferencia bloqueada durante la preparación del despliegue. Cambiar a `true` sólo al habilitar el primer caso manual del piloto. El límite diario cuenta investigaciones, incluso las fallidas; no es un límite monetario y no garantiza un importe de facturación. No reutilizar aquí las variables `SUPPORT_EVALUATION_*` del servicio temporal.

En el PMS piloto, conservar `SUPPORT_ENABLED=true`, la dirección del asistente y el secreto compartido; configurar:

```
SUPPORT_INVESTIGATOR=codex
SUPPORT_WORKFLOW_SIMULATION_ENABLED=false
SUPPORT_PROPOSAL_REVIEW_ENABLED=true
```

El permiso `sidebar:/programming-support` da acceso a casos propios. `api:support:view-all` permite bandeja completa y `api:support:review` permite decidir; administradores mantienen todos. Se conservan las verificaciones del servidor y no se confían capacidades enviadas por el navegador.

Correo opcional
---------------

El envío existente continúa siendo opt-in mediante `SUPPORT_NOTIFY_ENABLED`. Por defecto el aviso sigue siendo genérico. Para incluir el informe, configurar `SUPPORT_NOTIFY_INCLUDE_SUMMARY=true`, manteniendo el destinatario autorizado en `SUPPORT_NOTIFY_EMAIL`, remitente en `SUPPORT_NOTIFY_FROM` y la clave del proveedor en el servicio. El nuevo correo incluye problema, causa (indicada como posible cuando corresponda), propuesta y enlace a Soporte. Explica que no se aplicaron cambios. No permite aprobar por respuesta de correo; la decisión exige iniciar sesión y el permiso de revisión. No se activó ni envió ningún correo durante esta entrega.

Validación
----------

74 comprobaciones dirigidas: 48 de investigador/transporte/propuesta/correo simulado, 2 del gateway HTTP y sus permisos, 21 de interfaz/presentación y 3 de integración PostgreSQL en esquemas propios de una base local de pruebas. Todas sin proveedor real de inferencia ni correo. La prueba nueva integra el investigador simulado con el chat, persistencia JSONB, decisión del revisor, repetición idempotente, invalidación ante información nueva y rechazo de un cambio de transporte en un trabajo encolado. Pasaron comprobaciones de tipos del PMS/servicio, compilación del PMS y bundle del servicio. La compilación conserva los avisos existentes sobre import.meta en salida CJS. No se afirma que toda la suite del repositorio haya sido ejecutada.

Revisión de la evaluación anterior
---------------------------------

El JSON exportado por el usuario corresponde a `83257d3d`: tres casos completos, 17 turnos, 93.624 tokens, uso completo reportado y costo estimado USD 0,1405418 (corrige la lectura inicial de la captura). Caja explica contado menos neto esperado, conserva las limitaciones de no acceder a movimientos reales y corrigió dos observaciones del revisor. Recetas sigue Inventario hasta conversión de unidades, endpoint y cliente HTTP, y encuentra el catch genérico; su propuesta coincide con el código revisado. El tercer caso pide pantalla o mensaje sin inventar una causa. Esta tanda sustenta avanzar a un piloto controlado, no aprobar automáticamente todos los casos futuros. El acumulado observado es aproximadamente USD 0,369. Las pruebas propuestas por el modelo no fueron ejecutadas; las comprobaciones técnicas de esta entrega son independientes.
