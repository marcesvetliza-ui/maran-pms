# Cocina: preparaciones, producción y stock

## Pantallas

Producción abre en Stock de preparaciones: saldos actuales por artículo y depósito, búsqueda, filtros, estados, impresión/exportación y movimientos. No se calcula sumando lotes históricos. Los pendientes se muestran separados del disponible.

Preparaciones permite crear y editar nombre, unidad de salida, rendimiento esperado, clasificación, ingredientes, cantidades, merma y notas desde la misma pantalla. Crear o editar la fórmula no mueve stock. Los ingredientes pueden ser artículos físicos, elaboraciones al momento o preparaciones con stock; se validan unidades y referencias circulares. El artículo semielaborado se crea con saldo cero en la misma transacción. Los cambios reales requieren permiso de catálogo y registran auditoría.

Registrar producción permite seleccionar una preparación, escalar sugerencias por recetas planificadas y corregir las cantidades realmente utilizadas y obtenidas. Informar menos producto obtenido no reduce retrospectivamente el consumo real. Se requieren depósitos explícitos de insumos y salida. No se aplica nuevamente la merma teórica a cantidades reales ya informadas.

Las recetas de platos distinguen Materia prima, Elaboración base al momento y Preparación con stock. Un preparado consume su artículo obtenido, no vuelve a expandir su fórmula. El selector utiliza su costo de stock y las unidades de ese artículo. Una receta vacía o sin costos completos se muestra como Costo pendiente, sin margen ficticio de 100%.

## Faltantes sin bloquear la carga

La venta conserva el circuito previo: operación comercial guardada y consumo completo pendiente si falta stock.

Una producción válida con stock insuficiente se conserva en inventory_pending_productions, con sus cantidades reales, depósitos, motivo y fecha. No descuenta parcialmente insumos ni ingresa productos ficticios al disponible. Regularizar stock reintenta el movimiento completo, conserva al operador original y registra quién regularizó. Cada operación tiene un identificador persistente, conserva su contenido y se aplica una sola vez aun con reintentos simultáneos.

Una fórmula cambiada desde el registro pendiente exige revisar la producción; no se recalculan sus consumos silenciosamente. Anular pendiente requiere permiso de ajustes y motivo, mantiene historial, no modifica stock y bloquea futuros reintentos. Se puede registrar después una nueva operación revisada.

Faltantes de stock son distintos de datos inválidos: nombre, cantidades, unidades, depósitos e ingredientes deben estar correctamente definidos. Los fallos técnicos no se presentan como una producción guardada.

Las producciones pendientes existen como registro de cocina, pero no suman al stock contabilizado hasta regularizarse. Una venta que usa ese preparado puede quedar pendiente también; después de regularizar la producción se reintenta su consumo desde Inventario.

## Costos y trazabilidad

Cada lote conserva su costo real (insumos realmente consumidos / resultado real). El costo del artículo producido usa promedio ponderado de existencias anteriores y nuevo lote. Las recetas vinculadas reciben el costo actualizado. Revertir un lote por el circuito existente de reversión retira su valor del promedio; una valuación inconsistente exige revisión explícita.

El historial conserva fecha, operador, insumos, resultado y costo del lote. No se implementó lote alimentario con vencimiento ni reserva física de mercadería. No se borraron datos de prueba ni se cargó stock real.

Sigue vigente la regla de consumo automático desde el último destino de transferencia por artículo. Si la preparación nunca tuvo una transferencia, se usa el depósito de su última producción completada y no revertida. Una transferencia real siempre tiene prioridad. Las producciones pendientes no establecen origen ni saldo disponible. La pantalla enlaza Inventario para transferencias y límites.

## Validación

Pruebas PostgreSQL y UI cubren pendiente por faltante sin cambios parciales, regularización/reintentos concurrentes sin duplicación, fórmula modificada, anulación terminal, producción y plato mixto con transferencia real a cocina, costos ponderados y reversión, edición/creación sin movimiento, stock por depósito, impresión filtrada, sugerencias escaladas, costos pendientes y permisos.

Verificación local: 22 pruebas PostgreSQL y 5 de interfaz aprobadas, TypeScript y compilación de producción. Incluye origen por producción antes de la primera transferencia y prioridad del destino transferido, sin volver a un origen anterior si ese depósito está inactivo.
