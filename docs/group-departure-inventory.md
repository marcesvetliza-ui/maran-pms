# Cupo grupal después de una salida individual

El incidente de la habitación 305 mostró una diferencia entre rooming e
inventario. El grupo tenía 15 suites asignadas: 12 seguían alojadas y tres ya
habían tenido check-out. El control conservaba 15 como compromiso y contaba
solo las 12 activas, por lo que llamaba “pendientes de asignar” a las salidas.
Con dos reservas independientes y 17 suites operativas, una reserva nueva
pasaba a computarse como 18/17 y era rechazada.

La evaluación del PMS ahora reconoce que una asignación completada cumplió su
cupo: desde su fecha real de salida no vuelve a generar un lugar pendiente.
Se conserva el bloque contractual y el historial del grupo. Cancelaciones y
no-shows no liberan compromisos automáticamente. Se preservan los lugares
realmente sin asignar, las fechas propias de cada bloque y la protección
transaccional contra superposición física.

El crédito se limita a bloques que la estadía original realmente solapaba y a
una unidad por habitación física: no se usa una salida repetida para consumir
varios lugares ni una estadía antigua para cancelar un bloque futuro separado.
Una asignación activa del mismo grupo sobre esa habitación impide considerarla
liberada. La distribución ambigua entre bloques conserva cupos. La salida se
interpreta en fecha argentina; registros antiguos sin fecha real usan de forma
conservadora el egreso programado.

El almacenamiento incluye las salidas de los grupos vigentes aunque su egreso
programado haya quedado antes del intervalo consultado. La consulta anterior
las omitía precisamente en el día en que la habitación quedaba disponible.
Las validaciones de grupo reciben el mismo dato. No se modifican cantidades,
cargos, pagos, facturas ni reservas históricas para corregir el cálculo. La
reserva del huésped debe volver a solicitarse por Recepción: no se crea desde
la investigación.

Alcance: validación y guardado de inventario del PMS. No se reactivan conexiones
con Channex/Booking ni se cambian las restricciones remotas. El cómputo SQL de
publicación ARI sigue siendo independiente y debe revisarse antes de volver a
habilitar esa integración; en este incidente permanece desactivada por pedido
del usuario.

Validación: pruebas compartidas para el caso 17/15/12/3, salida anticipada,
medianoche argentina, compromisos reales, cancelaciones, bloques posteriores,
reutilización física y reactivación. PostgreSQL descartable comprueba que se
puede crear la reserva en el cuarto liberado, que una segunda superposición se
rechaza y que el bloque y las 15 reservas originales conservan sus datos.

Resultado local: 22 pruebas compartidas, 28 pruebas de rutas/rooming y dos
pruebas con PostgreSQL correctas (52 en total). TypeScript completo y build
de producción correctos. Las consultas al hotel fueron de solo lectura.
