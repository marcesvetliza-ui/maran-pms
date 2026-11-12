# Anular la imputación de Restaurante en una habitación de grupo

La pertenencia a un grupo ya no bloquea por sí sola la anulación. Recepción y los perfiles ya autorizados pueden anular una imputación de Restaurante desde el folio abierto de una reserva activa cuando se verifica un único grupo no finalizado, sin cobros de la habitación ni fondos del Maestro o distribuidos a esa reserva, y sin cobertura fiscal del cargo. Los pagos y comprobantes identificados exclusivamente con otras habitaciones no bloquean esta operación.

Si el comprobante grupal carece de conceptos verificables, o el cargo está facturado, cobrado, transferido o tiene movimientos ambiguos, la acción se detiene con un motivo. La edición de importe de cargos de Restaurante de grupos conserva su revisión específica; esta habilitación corresponde sólo a anular la imputación.

La anulación conserva el cargo visible como ANULADO, agrega el contraasiento en su folio y deja auditoría con usuario y motivo. No cambia el pedido de Restaurante, sus ítems, inventario, pagos ni Caja. Se serializa con la facturación del grupo y del folio y con el registro de cobros; los reintentos no duplican el contraasiento.
