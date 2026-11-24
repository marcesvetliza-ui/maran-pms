# Conciliación automática de Restaurant

Después del cierre, el pago y la emisión, Restaurant solicita una verificación
en segundo plano. La respuesta del cierre y el PDF conservan su factura aunque
la verificación demore o encuentre diferencias. El estado pendiente constituye
una revisión administrativa de Caja: no es una condición para emitir por otra
mesa, registrar otros cobros ni realizar salidas de Recepción.

El verificador también recorre los pendientes históricos al arrancar y cada
minuto, en lotes acotados. Cada operación se verifica por su propio pedido. No
consulta ARCA ni autoriza comprobantes, crea cobros, reabre turnos o cambia el
folio. Si se reinicia el proceso, el pendiente persistido permite reintentarlo.

Para completar automáticamente se exige un cierre completo y sin ambigüedad:

- Factura emitida con CAE y ambiente fiscal conservado; el diario fiscal debe
  probar su identidad, pedido, número e ítems autorizados.
- Un solo documento de venta del pedido, sin notas o correcciones fiscales.
- Pedido cerrado, importe coincidente y un folio con cargo y pagos completos.
- Cobros activos de Restaurant con los mismos importes y medios que el folio.
  Se comprueban sus identidades de origen; el importe solo no vincula registros.
- Sin mezcla con cuentas de habitaciones, grupos, SPA, Cuenta Corriente,
  anticipos, prestaciones compensadas o ventas parciales no individualizadas.

La actualización cambia solamente el estado/fecha de conciliación y agrega
una auditoría con las identidades de la evidencia. Ambas escrituras son
atómicas e idempotentes. Los faltantes, duplicados o diferencias conservan el
pendiente para Administración; no se inventan movimientos para cuadrar totales.
Las anulaciones de medios de pago solo se admiten como evidencia cuando su
contraasiento negativo corresponde exactamente al pago sustituido.

Facturación obtiene el área de estos comprobantes del pedido, incluso si el
punto de venta se comparte en homologación. Un pendiente de Restaurant se
identifica como **Revisión administrativa de Caja**.
