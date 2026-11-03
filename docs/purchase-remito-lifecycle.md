# Remitos de compras

El remito distingue **Entrega pendiente de factura** y **Compra no fiscal**.
El valor de los artículos aparece en la lista para ambos usos. En el primer
caso es informativo: no genera deuda ni asiento. En el segundo, el total de
los renglones genera deuda al proveedor, sin agregar impuestos.

## Pagos

Las compras no fiscales se cancelan desde cuenta corriente mediante una OP
en efectivo. Una OP no mezcla compras fiscales y no fiscales. El servidor
valida método, efectivo exacto y ausencia de banco, cheques, retenciones y
compensaciones. Para una compra no fiscal se puede indicar un pago parcial;
el resto permanece pendiente. La OP lleva la observación «Pago de compra no
fiscal». La registración en Caja conserva el circuito existente de OPs.

## Cambiar de uso

Desde Editar se puede cambiar el uso sin modificar cantidades, costos ni
depósitos. El importe sale de los renglones persistidos, no del cliente.
Si hay pagos aplicados no se permite volver a entrega pendiente de factura.
Los remitos históricos no se convierten automáticamente en deuda.

## Cuando llega la factura

En la fila del remito, **Cargar factura** permite registrar la factura completa
de ese remito. El mismo ID conserva los renglones, los movimientos de stock y
los ítems de las OPs. No se vuelve a recibir mercadería ni se cobra/paga desde
ese formulario. El saldo de la factura descuenta los pagos aplicados; un
total menor a lo pagado se rechaza. El proveedor debe coincidir.

El historial de detalle conserva los datos originales y los cambios de uso;
se puede buscar por el número original del remito. Sus números también
siguen protegidos contra cargas duplicadas. El asiento anterior se revierte
con un nuevo asiento, sin borrarlo. La conversión es completa, de un remito
a una factura; no consolida varios remitos ni divide una entrega entre facturas.

Un bloqueo de la fila serializa pagos, cambios de uso, factura y reversión
de stock. Si el stock fue revertido, no se permite la conversión. Todas las
escrituras de la conversión comparten transacción. No requiere una migración:
usa `special_details` para el historial y conserva las relaciones existentes.
