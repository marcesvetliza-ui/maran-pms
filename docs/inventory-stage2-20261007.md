# Inventario: etapa 2 — 7 de octubre de 2026

## Circuito acordado

- Compras: cada artículo ingresa a un depósito explícito. El comprobante conserva cantidad, unidad y precio originales, además de la cantidad convertida que ingresó al stock.
- Consumos automáticos de Restaurant y SPA: usan el último destino de transferencia de cada artículo. Si no existe, está inactivo, falta una equivalencia o no alcanza el saldo, se conserva la operación y queda un consumo pendiente completo, sin descuento parcial.
- Consumos internos: precargan ese último destino y permiten cambiarlo. Al cargar una receta se convierten las unidades y se resuelven las subrecetas; los elaborados producidos consumen su propio stock.
- Producción: requiere depósitos de insumos y de salida. Si un insumo no está disponible, se rechaza toda la producción. Una solicitud repetida con el mismo identificador no vuelve a descontar ni a ingresar productos. El costo real surge de los insumos efectivamente consumidos.
- Ajustes y correcciones: trabajan sobre el saldo del depósito y aplican el mismo cambio al total global. La edición de un artículo no puede reemplazar cantidades ni cambiar la unidad base de un artículo con historial.

## Equivalencias y pendientes

En **Inventario → Artículos → Editar → Equivalencias**, el factor expresa cuántas unidades de stock corresponden a una unidad de compra/consumo. Ejemplo: artículo en unidades, caja de 12 → factor 12. Kilos/gramos, litros/mililitros y docenas/unidades tienen factores estándar.

Las cantidades de stock se registran con tres decimales. Las conversiones se redondean a esa precisión; un consumo positivo menor que 0,001 se rechaza en vez de quedar en cero.

Los pendientes aparecen en Inventario y como avisos en Restaurant/SPA. Se pueden reintentar después de reponer stock, transferir o completar equivalencias. El pendiente conserva las cantidades originales. En pedidos con receta faltante se puede elegir expresamente **Usar receta actual**, con registro del antes y después, para recalcular y reintentar.

## Reversiones

En el detalle de movimientos se puede **Revertir stock del documento**. Requiere motivo y confirmación y revierte el documento completo, una sola vez, sobre sus depósitos originales. Se bloquea si un retiro dejaría saldo negativo o si un movimiento antiguo no identifica depósito. Un pendiente cancelado no genera existencias.

Esta acción conserva la operación financiera. La devolución de dinero o anulación fiscal se gestiona en su área. Los cargos SPA con consumo asociado requieren cancelar/revertir ese consumo antes de eliminarlos; una cuenta cerrada no admite edición. La eliminación conserva auditoría y contrapartida en el folio.

## Migración y validación

La migración agrega tablas de equivalencias, consumos pendientes, reversiones e identificadores de producción, y campos de unidades en renglones de compra. No rellena depósitos, no aplica consumos retroactivos y no cambia saldos existentes. Los movimientos previos ya consumidos se reconocen para impedir nuevos descuentos.

Validación final: 140 pruebas PostgreSQL, 27 pruebas de interfaz y 8 de permisos aprobadas; comprobación de tipos y compilación aprobadas.

Se validaron unidades, depósitos, falta de stock, duplicados, simultaneidad, fallas intermedias, compras, recetas anidadas, costos, producción, cargos/cierres SPA, pagos Restaurant, permisos y restauración del respaldo. La migración también se ejecutó dos veces sobre una copia aislada del respaldo nativo de Railway: saldos globales, saldos por depósito e historial previo permanecieron iguales.

Por decisión del usuario, siguen postergados la conciliación de saldos de prueba y los conteos por depósito. Antes de empezar a llevar stock real, se deberá acordar la carga inicial del listado con sus depósitos y unidades. No se implementó una limpieza ni una carga masiva automática.
