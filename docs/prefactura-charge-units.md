# Selección de extras por unidad en prefactura

Los cargos con cantidad entera persistida mediante el sufijo `(xN)` se presentan como filas independientes, con identidad estable `charge-unit:<cargo>:<índice>`. Ejemplo: Cochera (x2), total $15.000, produce dos unidades de $7.500. Los centavos indivisibles se asignan a las primeras unidades y se conserva exactamente el total.

La proyección es compartida por cliente y servidor. No crea cargos nuevos ni movimientos de stock, folio o caja al abrir la pantalla. No supone cantidades para cargos sin detalle de cantidad, ni desarma cargos agregados de restaurante en platos que no estén identificados en el cargo. Transferencias, pagos y ajustes financieros no se expanden. Las acciones operativas sobre el cargo de origen siguen realizándose en su editor de origen; las filas virtuales sirven para seleccionar conceptos a facturar, no para anular o transferir falsos UUID.

El comprobante conserva importe e identidad de cada unidad. La validación bajo el bloqueo financiero existente protege el saldo por unidad y la compatibilidad con pestañas antiguas que todavía envían el cargo agrupado. Se rechaza mezclar ambas representaciones en una misma solicitud. La cobertura fiscal anterior agrupada se distribuye conservadoramente sobre unidades aún disponibles; un aviso explica que esta asignación no reconstruye qué unidad física se facturó históricamente.

Los controles de edición y anulación del cargo de origen reconocen las fuentes por unidad. Una vez documentadas unidades de un cargo recurrente, el recálculo automático de la cantidad al modificar la estadía no altera ese cargo documentado; cualquier diferencia requiere un cargo adicional o la corrección fiscal correspondiente. Se conserva la recuperación idempotente de emisiones y el detalle genérico de NC/ND.

Para cobrar una parte y continuar con otra, desmarcar «Hacer check-out al confirmar» hasta la última liquidación.

Validación: selección real de checkboxes en Prefactura, importes y redondeos, capacidad fiscal histórica agrupada, dos comprobantes CC independientes con PostgreSQL real, rechazo de duplicados y solicitudes agrupadas obsoletas, protección fiscal del cargo de origen y regresiones existentes de prefactura/tarifas/descuentos.
