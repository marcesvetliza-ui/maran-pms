# Registros administrativos especiales

Compras / Compra: Retenciones recibidas, Resumen Bancario y Liquidación Tarjeta.

Los formularios guardan documentos informativos con desglose. No generan Caja, deuda con proveedores, movimientos de cuenta corriente, stock ni asientos. Continúan excluidos del Libro IVA Compras. Los registros históricos conservan su tratamiento; no se reconstruyen impuestos a partir de sus totales.

- Retenciones: empresa o agencia, impuesto, certificado, fecha e importe final sin IVA adicional. Cuenta de activo sugerida por impuesto. Jurisdicción y cobro existente opcionales; vincular un certificado no altera el cobro ni aplica nuevamente una retención.
- Banco: neto al 21%, conceptos exentos opcionales, percepción IVA y Ley 25.413.
- Tarjetas: bases al 21% y 10,5%, conceptos exentos opcionales, percepción IVA y retención IIBB sufrida. No es el importe bruto de ventas ni el depósito recibido, sino el detalle de cargos de la liquidación.
- IVA calculado por base a centavos; corrección según documento exige motivo guardado.
- Duplicados por tipo, emisor, número, impuesto y jurisdicción: bloqueo transaccional; una carga simultánea gana y la otra devuelve conflicto.

Estado de Resultados: los documentos nuevos aportan únicamente neto y exento al gasto bancario/comercial. Impuestos y retenciones aparecen en un bloque separado. Ley 25.413 no se considera automáticamente recuperable ni gasto; requiere decisión fiscal. El período del documento se conserva como dato; el reporte se filtra por fecha de emisión como antes.

Despliegue: migración incremental aditiva e idempotente agrega purchase_invoices.special_details antes de verificar el esquema financiero. No requiere variables nuevas ni limpieza de datos.

Validación: cálculos y formularios; PostgreSQL real para cargas, duplicados concurrentes, certificado con cobro existente, validación de datos, desglose del reporte, ausencia de movimientos financieros y compatibilidad de documentos históricos.
