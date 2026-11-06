# Veredicto de auditoría y detalle del fallo

La ejecución real del caso 665e5496-f898-47a5-9f8e-6a1f68dea508 en 7b60239d terminó con diagnosis_audit e inconsistent_verdict. El log identifica el modelo efectivo gpt-4.1-mini, 56.841 tokens, cuatro rondas y seis consultas de código. No fue un corte por presupuesto: el auditor devolvió un booleano incompatible con su lista de observaciones. No se conserva el JSON privado y no se infiere cuál de las dos contradicciones ocurrió.

El nuevo esquema solicitado al proveedor sólo contiene issues y, donde corresponde, checks. La aprobación es un resultado del servidor tras validar las observaciones, referencias y comprobaciones obligatorias. No se pide un booleano redundante. Por compatibilidad, los sobres antiguos coherentes se admiten; un booleano antiguo contradictorio o mal formado se sigue rechazando, sin elegir el lado favorable ni convertir un rechazo sin fundamento en aprobación. Una comprobación negativa sin observación continúa invalidando la revisión.

Se persisten las categorías de auditoría y las rutas/códigos de validación ya permitidos en los logs, incluidos los campos de checks. No se persisten mensajes privados del proveedor, prompts ni valores rechazados. Se conserva semanticAudits también cuando diagnose lanza una excepción; dos eventos del mismo fallo no se cuentan como dos revisiones. El panel no inventa estos datos para intentos anteriores.

No se cambia el modelo, los topes, las reglas de negocio ni la exigencia de revisión independiente. No se agregan reintentos automáticos. Las pruebas usan clientes simulados y PostgreSQL local aislado; no se invoca al proveedor real. Queda pendiente evaluar una respuesta nueva del modelo, no eludir el rechazo de la ejecución anterior.
