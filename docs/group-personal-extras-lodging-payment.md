# Cobro de extras personales con alojamiento pagado

El rechazo `GROUP_PERSONAL_EXTRAS_CAP` descontaba todo pago general de la habitación del saldo de consumos, aunque ese pago correspondiera al alojamiento. La pantalla descontaba solo los cobros marcados como extras, por lo que podía ofrecer un importe que el servidor rechazaba.

Pantalla y servidor comparten ahora el cálculo en centavos:

- Los pagos generales cubren primero el alojamiento de esa reserva. Su excedente puede cancelar extras.
- Los pagos identificados con `[personal_extras]` cancelan extras directamente, aunque el alojamiento no esté pagado.
- El importe permitido nunca supera los extras pendientes. Se conservan el bloqueo de extras incluidos en Folio Maestro, la revisión de excedentes del maestro, los pagos anulados excluidos, los locks y la idempotencia del cobro.
- Los pagos del maestro y sus filas de distribución no se cuentan dos veces. La consulta se limita a la habitación y al grupo correspondiente.

No se modifican pagos, asignaciones, facturas ni saldos históricos almacenados, y no se registra ningún cobro automáticamente. La operación real la confirma recepción. El error de límite muestra el saldo verificado sin exponer un JSON sin formato en la pantalla.

Verificado con pruebas del endpoint, interfaz y PostgreSQL descartable: alojamiento de 181.500 pagado y extras de 77.000 pendientes; cobro único de 77.000; rechazo del segundo cobro; cobro parcial; reversión de un pago anulado; límite por excedente de pagos generales; exclusión de otras habitaciones y asignaciones del maestro. La captura del caso fue de DON OSVALDO; las pruebas no consultaron ni alteraron la base operativa de ese grupo.
