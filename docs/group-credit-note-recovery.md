# Recuperación de notas de crédito de grupos

El caso reportado muestra una NC pendiente de conciliación y una diferencia entre su detalle por cargo y el acumulado acreditado de la factura original. Un intento persistido sin autorización confirmada no es un crédito conciliado. La corrección conserva esa identidad y no borra documentos ni modifica importes acreditados para forzar coincidencias.

## Recorrido

- La cola de conciliaciones de Facturación incluye reservas individuales y grupos, fuera del filtro de fechas. Identifica Grupo o Reserva y muestra el error guardado.
- **Reintentar y conciliar** conserva ID, tipo, punto de venta, número, conceptos, receptor y fecha del intento guardado. El servicio fiscal consulta primero ese comprobante. Sólo una respuesta verificable de inexistencia permite solicitar autorización para ese mismo número. Una respuesta ambigua no se considera inexistencia.
- Si ya está autorizado localmente, no consulta de nuevo al proveedor. Si falta autorización confirmada o un CAE válido, no aplica el crédito.
- La conciliación verifica grupo, factura, tipo, conceptos, importes, capacidad restante e historial acreditado. Bajo bloqueo por grupo, guarda acumulado/estado de la factura, estado de conciliación, referencia de NC en el recibo y auditoría en una transacción. Si falla, conserva la NC autorizada pendiente para recuperar sin emitir otra.
- Un segundo intento de NC desde el grupo recibe una indicación de recuperar la pendiente. Los borradores no se suman como créditos ya aplicados al construir el detalle de factura y la disponibilidad grupal.
- El recorrido ordinario exitoso de una nueva NC de grupo también marca conciliación junto al acumulado, evitando dejarla pendiente después de aplicar el crédito.

No cancela cobros, modifica su medio o importe, devuelve dinero ni crea otra factura. La referencia fiscal del recibo es sólo metadata. Si se necesita únicamente corregir la forma de pago, corresponde la edición existente: no se debe reautorizar una NC por ese motivo. Cualquier descarte de un intento incierto requiere antes comprobar su estado fiscal; este parche no incorpora un borrado manual.

Los errores futuros de autorización incluyen los códigos y motivos ARCA disponibles en Errors/Observaciones. No se inventa el motivo del intento histórico. Las consultas y pruebas usan datos sintéticos y proveedor simulado: no prueban autorización ARCA real ni resuelven el registro de NUSEED del hotel.

## Verificación

PostgreSQL local desechable: recuperación del mismo intento, idempotencia/concurrencia, documentos ya autorizados, fallo o incertidumbre del proveedor, conceptos inválidos, rollback con recuperación posterior, invariancia monetaria de recibos y fecha persistida durante reintento. Interfaz: NC de grupo visible y actualización del error. Parser: rechazo fiscal con código y motivo. Regresión del cálculo por cargos y de reservas individuales.

Se ajustó el doble de consultas de las pruebas de conciliación individuales para responder explícitamente al SELECT de pertenencia a grupo del bloqueo financiero, sin consumir respuestas destinadas a la factura. Esas cinco pruebas ya fallaban antes del parche por el desfasaje del doble; no se cambió su expectativa ni se omitió el bloqueo real en las pruebas PostgreSQL.

Pendiente publicación y comprobación operativa. No se accedió a base, credenciales ni servicios fiscales del hotel.
