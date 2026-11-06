# Alícuota IIBB a partir del importe de la OP

Al editar Ret. IIBB en pesos, la OP calcula la alícuota efectiva: importe retenido / base × 100. Se redondea a cuatro decimales, precisión existente en payment_orders.alicuota_iibb_op e iibb_retentions.alicuota. El importe manual no cambia. Si la selección de facturas cambia mientras se trabaja por importe, se recalcula solo la alícuota. Al vaciar el importe, se vacía la alícuota calculada. Se conserva el modo previo de recalcular desde las alícuotas del proveedor.

El servidor vuelve a calcular el porcentaje usando las facturas bloqueadas dentro de la transacción de OP. Conserva la base existente: suma de netos de facturas positivas, sin NC, o total de la OP si no hay base neta positiva. La misma base se guarda en la constancia. No modifica el maestro de proveedores, los importes de retenciones ingresados ni la lógica de pagos/asientos.

El TXT SIRCAR deja de forzar 0.00 en la columna alícuota y utiliza el dato guardado, conservando el formato vigente de dos decimales del TXT, separadores y demás columnas. Para registros históricos con alícuota cero o ausente y base/retención positivas, la exportación calcula el porcentaje desde esos datos; no actualiza los registros históricos. El Excel de origen usa el mismo criterio. Una base nula/cero no permite deducir una tasa y no se inventa un porcentaje.

Pruebas: edición real del importe en la pantalla de OP, cambio de selección, envío y limpieza; cálculo con redondeo; persistencia de la alícuota en las sentencias de OP/retención y exclusión de NC; línea TXT con alícuota real y casos históricos; regresión de pagos no fiscales.
