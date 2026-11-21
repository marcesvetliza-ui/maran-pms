# Producción por agencia

La pestaña **Producción por agencia**, dentro de Agencias, compara las estadías realizadas por cantidad de noches. El porcentaje de comisión no condiciona la inclusión de una agencia.

- Cuenta reservas con estado `checked_in` o `checked_out` y agencia explícitamente vinculada. No deduce la agencia a partir del huésped, el pagador o un nombre.
- Cuenta noches por habitación anteriores a la fecha actual de Argentina. Para huéspedes alojados incluye las noches transcurridas; excluye la noche en curso y las futuras. El día de salida no suma una noche.
- Desde/Hasta se aplican a las noches de estadía, con ambos límites incluidos. Una estadía que cruza el período aporta solo sus noches dentro de él. La reserva cuenta una vez si aporta alguna noche.
- Excluye reservas confirmadas pendientes de alojamiento, tentativas, canceladas, no show y habitaciones virtuales/de prueba. No descarta una estadía histórica porque su habitación física hoy esté inactiva.
- Ordena por noches de mayor a menor, luego reservas y nombre. La participación divide las noches de cada agencia por el total del período. Las agencias sin movimiento se pueden mostrar con una casilla.

El importe de alojamiento utiliza precios por noche guardados y sus descuentos. Para reservas antiguas distribuye el total guardado entre sus noches conservando los centavos; informa esta estimación. Si el precio es desconocido o inconsistente, conserva el conteo de noches y señala que el importe es parcial. No se trata de facturación fiscal ni de cobros.

Las comisiones configuradas se pueden consultar de manera opcional como estimación. La consulta no registra comisiones ni cambia tarifas, reservas, facturas, pagos o saldos.

Los endpoints global e individual comparten el cálculo y requieren sesión y permiso de Agencias. Consultan todas las estadías históricas elegibles en una transacción de solo lectura. Los errores de consulta se muestran como errores, sin sustituirlos por un reporte con cero noches.

Validación: pruebas del cálculo, interacción de la tabla, autorización y fechas de los endpoints, y una base PostgreSQL local descartable con estadías históricas, comisión cero, límites de período y comparación de registros antes/después.
