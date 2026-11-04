# Envío en facturas de compras

En Emitir Comprobante, Factura A/B/C ofrece secciones desplegables de Descuento y Envío. Se conserva el descuento anterior. El envío se carga separado de la mercadería y se agrega después de descontarla.

- A: importe neto y tratamiento IVA del envío según la factura del proveedor (porcentaje, exento o no gravado).
- B/C: importe final, sin sumar IVA adicional.
- El resumen cerrado muestra el importe; el total y el pago completo sugerido incluyen el cargo.
- No se crean artículos, movimientos de stock ni cambios en costos unitarios.
- La clasificación contable es la de la factura. Las bases exentas/no gravadas también integran el gasto del asiento, sin crédito fiscal de IVA.

Persistencia: columna aditiva `purchase_invoices.envio` JSONB, con neto, alícuota, IVA, total y originales de captura. Las bases e IVA guardadas ya incluyen el envío y alimentan total, saldo, Orden de Pago, asiento y exportaciones fiscales. La vista indica que el desglose de envío está incluido en bases/IVA; no se vuelve a sumar.

Al editar se restauran las bases anteriores a descuento/envío y se recalculan una vez. Un cliente anterior que no envía los campos de envío no puede quitar un cargo existente por accidente (409). No se recalculan comprobantes históricos durante la migración. La conversión de remito a factura también guarda el desglose.

Validación: pruebas de cálculo (IVA, B/C, descuento combinado, edición repetida, retiro e importes inválidos), interfaz desplegable, persistencia/OP/asiento PostgreSQL, regresiones de pagos parciales y edición con retenciones; TypeScript y build.
