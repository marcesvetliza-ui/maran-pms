# Prefactura: alojamiento por noche

La respuesta del folio incluye noches con fuentes estables `accommodation:AAAA-MM-DD`. La pantalla muestra fecha, importe neto guardado, cobertura documental y pendiente; cada noche se selecciona por separado y produce su propio ítem y fuente en el comprobante.

Reservas `nightly_v1`: se verifica la correspondencia exacta entre fechas, detalle y total. No se inventan importes ante un detalle inconsistente. Reservas anteriores: el total contratado se distribuye exactamente en centavos entre sus fechas y se identifica como reparto, no como tarifa histórica. Consultar el folio no escribe ni migra datos. Guardar explícitamente una edición legacy persiste el detalle nocturno.

El lápiz de una noche solicita nuevo importe y motivo. El servidor exige autenticación y el permiso existente de alojamiento, vuelve a leer estado/precio/revisión bajo el mismo bloqueo financiero que la facturación y guarda total, detalle, revisión e historial en transacción. No modifica pagos ni Caja ni emite documentos. Una noche con cobertura fiscal/documental o autorización pendiente no se puede editar. Se puede editar otra noche cuya cobertura esté libre; el bloqueo general de las ediciones de estadía y de tarifas en lote no se relaja. Los grupos con factura maestra y antecedentes ambiguos mantienen revisión por el circuito existente.

La validación de facturas reconoce fuentes por fecha y compara su saldo bajo el bloqueo de reserva. No admite mezclar la fuente agrupada con sus noches. Los clientes antiguos que envían `accommodation` se contrastan contra la suma ya consumida por todas las noches. NC/ND y descuentos conservan sus asignaciones por fuente existentes.

Una factura anterior agrupada no identifica fechas. Para evitar ofrecer dos veces su capacidad, se aplica cobertura exacta conocida primero y la agrupada al remanente por orden de fechas, sin perder centavos ni exceso. La UI lo indica y mantiene bloqueada la edición de importes cuando hay esa cobertura agrupada. Esto es una regla de capacidad disponible, no una atribución histórica a noches. Una factura activa sin ninguna composición verificable impide el nuevo envío por noche.

La transferencia a otra habitación conserva su circuito de alojamiento total. Las noches individuales no se envían como extras manuales. La selección parcial de noches no se transforma automáticamente en una transferencia del alojamiento completo.

## Uso

Check-out → Prefactura → Revisar cargos. Seleccionar las noches a incluir. Para cambiar una tarifa: lápiz de su noche, importe, motivo y Guardar noche. Si se emiten comprobantes en etapas, desmarcar Hacer check-out al confirmar hasta la última liquidación. Cobro y facturación siguen siendo conceptos separados: los anticipos existentes no se vuelven a cobrar por separar las noches.

## Validación

En cada rama: suites UI de Prefactura y alojamiento (101 pruebas), pruebas de selección/edición reales de UI, helpers de distribución y cobertura; suite de bloqueo de facturación (11 pruebas) con dos solicitudes sobre la misma noche y protección de clientes agrupados antiguos; PostgreSQL local (31 pruebas) de edición, permisos, revisión/concurrencia, legacy, protección fiscal por fecha, liquidación de dos noches con Cuenta Corriente y recibos no fiscales, descuentos, Factura T y cierre con vouchers. TypeScript y builds completos. Sin operaciones en bases reales ni emisión ARCA real durante estas pruebas.

No se agrega esquema ni se reescriben reservas históricas en el despliegue. Las comprobaciones manuales en las reservas reales quedan para el usuario después de actualizar la página.
