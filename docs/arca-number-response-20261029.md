# Validación de numeración ARCA y operaciones pendientes

## Evidencia de la consulta

Las capturas muestran una Prefactura de Recepción, Factura A, PV 0005 rotulado Homologación, con una operación pendiente. Una captura muestra la restricción única `sales_invoices_tipo_comprobante_punto_venta_numero_key`; otra muestra timeout.

La restricción demuestra una colisión local de tipo/PV/número. No demuestra qué número colisionó, si la fila previa era un borrador o si ARCA autorizó alguno de los intentos. El aviso amarillo corresponde al intento persistido del navegador; no demuestra por sí mismo autorización fiscal ni cobro confirmado.

## Defecto comprobado en código

`getNextInvoiceNumberFromAfip` buscaba CbteNro sin validar HTTP, SOAP ni la serie. Si no lo encontraba usaba cero y calculaba uno. Por tanto una respuesta SOAP de error o una respuesta incompleta podía derivar en numeración inventada y colisión con un número local existente. Es un mecanismo compatible con la captura, no una causa histórica confirmada sin logs/base.

## Corrección

- Exigir HTTP exitoso, un único resultado de FECompUltimoAutorizado sin errores SOAP y un único número entero no negativo válido.
- Verificar que el resultado corresponda al tipo de comprobante y punto de venta solicitados.
- Cero sólo se acepta explícito en una respuesta válida de esa misma serie.
- No actualizar el contador, insertar borrador ni autorizar después de una consulta de numeración fallida.
- Errores 502/504 con mensaje claro; el cliente conserva el intento original y no registra pagos posteriores a una emisión fallida.
- Fixtures SOAP completas para las pruebas existentes; no hay llamadas reales a ARCA.

No se modificó la restricción única, no se saltaron números fiscales, no se borraron comprobantes ni se cambiaron las políticas de recuperación/conciliación existentes.

## Recuperación operativa pendiente

Requiere lectura del registro que ocupa la identidad fiscal en conflicto y consulta de esa misma identidad en ARCA, con ambiente, CUIT y PV correctos. Hay que distinguir un documento propio autorizado pendiente de conciliación de un comprobante ajeno o de otro ambiente. No vincular por importe ni borrar el intento del navegador para forzar otro cobro.

El operador debe conservar ambas operaciones originales. El despliegue del parche por sí solo no acredita su recuperación. No se accedió a la base operativa, a Railway ni a ARCA y no se emitió ni concilió documentación real.

## Validación realizada

67 pruebas de servidor (lector de numeración, emisor, recuperación y contratos WSFE), ocho de persistencia/reintento del cliente y TypeScript aprobados. Proveedores y persistencia simulados. Las pruebas PostgreSQL cuyos fixtures se actualizaron no se ejecutaron en esta revisión.
