# Edición y anulación de Notas de Débito

Facturación ofrece lápiz y anulación para las ND vigentes de clases A, B, C, T y MiPyme A/B. La vista previa consulta el documento y sus comprobantes asociados; las correcciones requieren motivo y detectan cambios desde que se abrió el diálogo.

El lápiz corrige **la forma de pago informativa de la ND**. No reclasifica un cobro real. El diálogo explica la diferencia y remite al cobro original para esa corrección. No permite sobrescribir importe, receptor, conceptos, CAE o numeración de un documento emitido.

Anular una ND emite su NC fiscal asociada por el total, conserva ambos documentos y concilia los efectos locales. [ARCA indica que un comprobante autorizado se corrige mediante una nota de signo contrario asociada al documento que se ajusta](https://www.afip.gob.ar/genericos/guiavirtual/consultas_detalle.aspx?id=6490326).

La conciliación distingue dos casos:

- Si la ND había revertido una NC, actualiza con signos alternados los saldos de las notas y de la factura original. La NC anterior vuelve a tener efecto y el crédito de los cobros se libera por sus IDs, sin registrar otra entrada o devolución de dinero. Los vínculos originales se conservan.
- Si la ND agregaba un cargo, registra la contrapartida del movimiento de folio verificado. La factura base y los cobros se conservan.

Se graba un movimiento informativo de Caja y auditoría dentro de la misma transacción local. Si la NC ya fue autorizada pero falla esa transacción, queda pendiente de conciliación. Reintentar recupera el mismo documento; el identificador de operación se conserva en el navegador frente a una respuesta perdida. Facturación permite recuperar también las conciliaciones pendientes de NC sobre ND.

Una NC creada por esta acción puede revertirse por su total desde la opción de Nota de Débito de la reserva. Se recorre la cadena original y se recupera sólo crédito todavía libre. Cada acción conserva una identidad independiente para distinguir un reintento de una corrección posterior legítima.

Alcance: notas con saldo íntegro y conceptos originales verificables. Las notas parcialmente acreditadas, autorizaciones pendientes, originales archivados o cadenas inconsistentes muestran el motivo que impide confirmar. Los folios adoptados por financiación explícita mantienen su protección, incluyendo propietarios heredados desde los comprobantes asociados.

La implementación no cambia documentos ni movimientos existentes automáticamente. Las pruebas utilizan comprobantes ficticios y bases locales descartables; no llaman a ARCA real.
