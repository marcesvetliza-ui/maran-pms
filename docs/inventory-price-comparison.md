# Comparación de precios de compra

La pestaña junto a Toma de Inventario requiere permiso de costos, tanto en pantalla como en el endpoint. Consulta renglones de facturas A/B/C no anuladas, ordenados por registro de compra. No modifica cantidades ni precios históricos.

La regla existente de ingreso mantiene el costo vigente cuando el precio de compra es cero. Las cantidades gratuitas sí ingresan y el precio cero permanece en el comprobante. Una compra positiva reemplaza el costo por unidad de stock y actualiza las recetas vinculadas en la misma transacción; no promedia regalos ni reparte descuentos generales.

La comparación convierte los precios usando cantidades y unidades guardadas en cada renglón. Sin conversión histórica registrada, muestra el renglón en el historial pero no calcula variaciones. Se comparan por separado precios finales de B y precios de A/C, así como distintas unidades. Los renglones gratuitos no pasan a ser el precio anterior ni ocultan una variación positiva previa.

El listado muestra la última compra positiva comparable por artículo y criterio fiscal dentro de los filtros, solo cuando varió respecto de la compra positiva anterior (incluye antecedentes fuera del rango de fechas). Agrupamientos y áreas corresponden a la clasificación actual del artículo. El historial incluye también precios repetidos y bonificaciones. Impresión y CSV usan el listado filtrado.

Validación: pruebas PostgreSQL de compra positiva seguida de regalo, cantidad, costo y receta; consulta real del endpoint; conversiones de cajas y exclusión de IVA/unidades incompatibles; permisos, TypeScript y compilación.
