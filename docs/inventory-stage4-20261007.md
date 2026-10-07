# Etapa 4: operación diaria de Inventario

## Comportamiento

- Artículos: filtro de depósito; saldo global explícito cuando se elige todos. Los indicadores de alerta cuentan situaciones artículo–depósito, con una sola categoría (sin stock, crítico o bajo) por combinación.
- Stock y alertas reemplaza la vista anterior Stock Bajo. Se puede filtrar por depósito, artículo/SKU y estado. Ubicaciones sin configuración se distinguen de ubicaciones que se decidió no mantener.
- Solo se alerta por artículos físicos activos en depósitos activos con una política explícita. Configurar una política no crea saldos ni movimientos. No se copian mínimos generales a todos los depósitos.
- Mínimo y crítico son por ubicación; el crítico no puede superar el mínimo. Cero es sin stock; un saldo positivo menor o igual al crítico es crítico; positivo por debajo del mínimo es bajo. El mínimo exacto es suficiente salvo que también sea el umbral crítico.
- Reposición sugerida: máximo entre cero y mínimo menos saldo, con tres decimales. El botón precarga destino, artículo y cantidad. El usuario elige origen y confirma la transferencia. La validación existente impide superar el saldo de origen y aplica el lote completo.
- Confirmar la reposición modifica saldos de ambos depósitos, conserva el total global y registra transferencia e historial. Ese destino pasa a ser el último transferido y, por lo tanto, el origen de consumos automáticos conforme a la regla acordada.
- CSV de artículos o ubicaciones exporta exactamente el filtro visible, usa punto y coma, BOM UTF-8, formato argentino y neutraliza fórmulas. Los costos solo se incluyen con permiso; el servidor también los retira de las respuestas.
- Resúmenes de depósitos e informe general usan las políticas explícitas para alertas. El informe muestra depósito y cuenta total de situaciones, aunque su detalle está limitado a 20.

## Permisos y datos

Configurar límites requiere catálogo; confirmar reposición requiere operar. Consultar requiere lectura. Desactivar la política conserva historial y cantidades. La tabla `inventory_location_policies` se crea en la migración; queda vacía inicialmente. El respaldo SQL descubre tablas y sus dependencias, por lo que incluye estas políticas.

No hay conciliación, cierre de conteos, reclasificación ni carga inicial masiva. La configuración real de artículos esperados y umbrales queda para la preparación del listado de stock del usuario.
