# Ocupación futura en Ejecutivo y Reportes

La fila de Revenue de Planning ya cuenta las reservas vigentes de cada noche. Los informes calculaban las noches futuras, pero su porcentaje, disponibilidad y tarjeta ejecutiva leían solamente las noches realizadas. Un rango futuro aparecía así en 0 % aunque hubiera reservas.

Se utiliza la misma frontera de Planning: hasta ayer, noches realizadas; desde hoy, reservas vigentes para la noche, incluidas las ya alojadas. Se excluye la fecha de salida. Inventario, bloqueos fechados, estados y habitaciones no operativas provienen del cálculo nocturno existente. Una reserva de grupo asignada cuenta una sola vez; un cupo comercial sin habitación física no se agrega como otra reserva.

El gráfico y la disponibilidad diaria de `/api/reports/occupancy`, la tabla, el CSV y la tarjeta de ocupación de Ejecutivo usan este criterio. La tarjeta identifica la ocupación reservada, realizada o de un período mixto. El porcentaje del período se calcula sumando habitaciones-noche computadas y dividiendo por la capacidad de todas las noches seleccionadas, incluidos días sin reservas. El estado actual de las habitaciones conserva su indicador separado.

No se cambian reservas ni precios. Los ingresos realizados, ADR, RevPAR y las demás cifras contables conservan su fuente de producción realizada. No se convierte la proyección de ingresos en ingreso realizado.

Pruebas: comparación directa de Reportes contra `computeRevenueBoard` de Planning usando PostgreSQL temporal, con 58 reservas sobre 66 habitaciones, grupos asignados, noches futuras de huéspedes alojados, fecha de salida, cancelaciones, no-show, habitaciones virtuales/inactivas/REUB y bloqueos superpuestos. Se valida además la tabla, el CSV y el rango personalizado de Ejecutivo.
