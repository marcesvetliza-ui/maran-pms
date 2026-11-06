# Piloto: atribución del error y alcance de la propuesta de receta

La respuesta recibida en 6aec6c31 identificó correctamente la pérdida del detalle en loadFromRecipe y propuso reutilizar parseApiError. Quedaron dos defectos: citó una reexportación como origen del mensaje y no distinguió las unidades faltantes del nombre del ingrediente solicitado. Se conserva el diagnóstico recibido en recipe-error-received.json, fuera del catálogo del investigador, junto con estas pruebas y notas.

## Cambios

- Se inspecciona además el lookup unitFactor en su módulo real, sin atribuirle la construcción del mensaje que propaga desde inventoryUnitFactor.
- Las citas que se presentan explícitamente como fuente/origen del error de equivalencia deben incluir el throw localizado en el código actual. La línea se deriva del contenido y no de un número fijo. Se preservan explicaciones válidas de delegación/reexportación y negaciones.
- Autor, revisión final y auditor contrastan lo pedido con el contenido real del mensaje. Un parser no añade información ausente. La propuesta debe explicar qué recupera del servidor y si falta identificar el artículo; una solución parcial es aceptable si declara su alcance.
- Un control acotado detecta la omisión de la identificación solicitada en propuestas centradas en mostrar el error. No aplica si el usuario solo pide las unidades. No es un verificador general de requisitos ni de veracidad de prosa.
- Un borrador que insiste se bloquea antes de publicarse. Corregir la cita sin cubrir la expectativa pendiente no es suficiente. Se conserva auditoría independiente para el diagnóstico corregido.

## Alcance y comprobación

No se cambia Inventario, sus conversiones, mensajes, movimientos ni stock. No se invoca al proveedor real ni se cambia el modelo o presupuesto. Los controles se verifican con respuestas simuladas, no acreditan la calidad del próximo diagnóstico.

Se ejecutan las pruebas de este caso y regresiones de atribución, Caja, afirmaciones, consistencia y auditoría. Los 11 fallos preexistentes de navegación/citas identificados en el trabajo anterior no se dan por corregidos aquí. El próximo paso es repetir el caso con una consulta nueva y revisar citas, alcance y recomendaciones en la respuesta real de la nueva revisión.
