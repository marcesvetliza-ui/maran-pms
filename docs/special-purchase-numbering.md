# Numeración de comprobantes administrativos

Resumen Bancario, Liquidación de Tarjeta y Retenciones recibidas permiten cargar punto de venta y número en campos separados. Se guardan en las columnas existentes de Compras; el listado y el detalle usan la referencia completa, por ejemplo `00024-00000345`. El PV admite hasta cinco dígitos y puede quedar vacío si no figura en el documento. Los números y certificados alfanuméricos conservan su texto.

El servidor mantiene la compatibilidad con solicitudes anteriores sin PV y con números completos escritos en el campo original. El control de duplicados reconoce ceros iniciales y referencias compuestas. Dos series conocidas diferentes pueden reutilizar el número. Si el registro anterior no permite conocer la serie, requiere revisar ese registro antes de volver a cargar el mismo número para el mismo emisor, impuesto y jurisdicción. Las solicitudes concurrentes se verifican dentro de la transacción de creación.

No se migran ni renumeran comprobantes anteriores. El registro conserva su tratamiento informativo: no registra pagos, deuda, Caja, stock ni asientos. La numeración también se conserva desde el formulario compatible anterior de Compras.
