# Repetir el último ítem de la comanda

En Restaurant, el último ítem agregado muestra **Repetir ítem**. También se
muestra junto al resumen del último producto mientras se carga desde el menú.
Cada toque agrega un renglón nuevo de una unidad, conservando producto, precio
unitario, aclaraciones y curso. El botón pasa al nuevo último renglón; al cargar
otro producto, pasa a ese producto. La carga por cantidad sigue disponible.

Los renglones permanecen independientes para cobrarlos o trasladarlos por ítem.
Repetir no cobra, imprime ni marca el nuevo renglón como enviado o servido.
El curso determina si queda pendiente o esperando su curso. No se copian los
estados de pago ni de preparación del original.

El servidor obtiene los datos del renglón original y crea la unidad en una
transacción con bloqueo de la orden. Rechaza pedidos cerrados/anulados, ítems
anulados, fuentes ajenas al pedido y platos no disponibles. La interfaz bloquea
el botón durante el guardado y actualiza la comanda si hay un error.

La migración incremental agrega `order_items.created_at` con valor predeterminado
y la consulta masiva ordena por esa fecha, con ID como desempate. Los renglones
anteriores reciben la misma fecha de migración y conservan entre sí el orden
anterior por ID; los nuevos quedan ordenados por su creación. No se reconstruye
una cronología histórica que el sistema no registraba.

Pruebas: interfaz real de Restaurant para repeticiones consecutivas, cambio del
último producto y rechazo sin renglones ficticios; PostgreSQL para precio y
aclaraciones, cantidad unitaria, estados nuevos, conservación del original,
repeticiones concurrentes y rechazo de operaciones inválidas. Se verifican además
las regresiones existentes de división/cobro/transferencia por ítem.
