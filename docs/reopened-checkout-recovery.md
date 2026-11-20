# Recuperación de Prefactura después de reabrir una estadía

Una factura y un traslado a cuenta corriente ya completados no vuelven a quedar pendientes porque se revierta el check-out. El descubrimiento de operaciones comprueba el traslado original mediante su clave de pago, reserva, cuenta destinataria, importe, referencia, movimiento de cuenta corriente y auditoría del cierre atómico.

La factura, sus cobros y sus conciliaciones deben seguir completos. Sin esa evidencia, el intento permanece recuperable. Una anulación posterior del traslado puede cambiar el saldo actual, pero no borra el hecho de que el cierre original se completó.

Si la pantalla conserva el intento anterior en la sesión del navegador, lo libera únicamente cuando el servidor confirma que se completó y la estadía fue reabierta. Vuelve a seleccionar los cargos pendientes de facturación y genera una clave nueva para la próxima operación. No factura, cobra, traslada deuda ni realiza el check-out al abrir la pantalla.

El nuevo cierre exige una confirmación de Recepción y utiliza el saldo vigente. Los importes y la identidad del intento original permanecen inmutables. La modificación del programa no regulariza movimientos históricos ni cambia titulares.

Validación con datos sintéticos: recuperación con y sin evidencia; conciliación fiscal todavía pendiente; cuenta destinataria diferente; traslado anterior conservado o anulado; nuevo saldo después de reabrir; reintentos de cierre. La prueba de escritorio verifica también que abrir Prefactura no produce escrituras y que aparecen seleccionados los extras aún sin facturar.
