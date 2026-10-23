# Recuperar registros informativos de grupos

Facturación muestra hasta 100 documentos autorizados de grupos que carecen de un movimiento informativo activo en Caja. La lista no depende del período filtrado. Incluye facturas y NC ya conciliadas; no incluye autorizaciones o NC fiscales pendientes. Los documentos históricos elegibles también aparecen. Al completar uno se consulta nuevamente la lista.

Consultar y completar requieren `api:cash:area-admin`, el permiso existente de administración de Caja. El botón **Completar registro en Caja** trabaja con el identificador del comprobante y sus datos guardados, sin aceptar importes ni referencias enviados por el navegador.

La recuperación crea exclusivamente el registro informativo en el turno activo de Recepción. Conserva documentos, cobros, saldos y cierres anteriores. No llama a ARCA ni modifica la conciliación fiscal. Un bloqueo y la búsqueda del registro activo impiden duplicados al reintentar; la auditoría se guarda en la misma transacción. Si falla la transacción, el documento sigue apareciendo en la lista.

Las pruebas locales cubren permisos, autorización, NC pendientes y conciliadas, concurrencia, fallo de escritura y reintento, datos fiscales intactos y ausencia de nuevos cobros. Se ejecutan con datos sintéticos y proveedor simulado, sin acceder a operaciones del hotel.
