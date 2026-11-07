# Reportes: primer bloque de correcciones

## Cambios

- Gerencia → Reportes → Food Cost consume el contrato existente: resumen y porPlato; porcentaje global foodCostPct y ventas por plato totalVenta. No se cambia el motor de costos de recetas ni se reconstruyen costos históricos.
- La fuente común de costos de compras excluye estado anulado para todo tipo de comprobante. Se preservan las reglas actuales de neto/exento de documentos versionados y retenciones. Los documentos históricos de estado nulo siguen incluidos.
- Ranking Proveedores excluye anulados en mes actual y anterior. El total y denominador porcentual abarcan todos los proveedores antes del límite. Se expone un subtotal independiente del ranking visible. Las compras sin proveedor quedan visibles en su propio grupo; la cantidad de proveedores cuenta solo IDs presentes. Las variaciones relacionan por ID, evitando confundir proveedores homónimos.
- Ambos paneles verifican HTTP antes de aceptar JSON. Los errores ocultan cifras, incluso si quedó una respuesta anterior en caché, y ofrecen reintentar. Reportes bloquea CSV/impresión cuando la consulta principal falla o se está actualizando. Una falla de mermas se muestra separadamente, sin borrar el Food Cost obtenido correctamente.
- Los exportadores PDF/Excel del servidor no generan un archivo a partir de un error de consulta o un objeto de error.

## Alcance pendiente

No se cambiaron registros del hotel. No se alteró el signo de NC: primero debe comprobarse el signo almacenado y acordar una política única. Tampoco se corrigieron aún el motor común por noche, ocupación/ADR/RevPAR, criterio de costo versus compra/pago, impuestos, el fallback de Housekeeping fuera del período, la etiqueta Facturación ni los recortes existentes en exportaciones. El resultado gerencial no queda certificado por este bloque.

## Comprobación con Administración

Elegir un mes cerrado y un corte del mes actual, con lecturas/exportaciones de documentos. Confirmar factura anulada + reemplazo: solo el vigente suma. Comparar todos los proveedores contra el total del período y el top contra su subtotal. Contrastar Food Cost del mismo mes en Gerencia y Administración, recordando que expresa costo teórico con las recetas actuales. Registrar las diferencias por NC y por definición de costo para el siguiente bloque. Las pruebas sintéticas no cuantifican el desvío real del hotel ni sustituyen esta conciliación.
