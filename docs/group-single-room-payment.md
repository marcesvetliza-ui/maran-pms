# Pago de una sola habitación perteneciente a un grupo

La prefactura individual no admite una nueva cobranza directa de una reserva vinculada a un grupo. El pago debe pasar por el recibo padre del grupo y su asignación a la reserva, para conservar conciliación y evitar duplicaciones.

En Pago grupal distribuido, «Aplicar el pago a» permite elegir «Sólo hab. …». La asignación se limita a esa reserva activa, se precarga su saldo, se conserva el método elegido y no se cierra ninguna habitación. La selección de otras habitaciones, la asignación automática y el cierre quedan deshabilitados para ese cobro dirigido. La emisión fiscal sólo puede usar conceptos de la habitación seleccionada y se controla el saldo antes de solicitar autorización. Si existen anticipos grupales sin facturar, se requiere revisar su aplicación antes de usar esta emisión dirigida.

La prefactura muestra el grupo y un enlace para acceder al circuito correcto. Los nuevos intentos de cobranza individual se detienen antes de crearse; el cierre no fiscal a Cuenta Corriente conserva su circuito. Los intentos anteriores se conservan: cuando el servidor confirma que no hubo autorización ni cobros, el operador puede usar «Corregir datos del intento» y luego registrar el pago desde el grupo. No se migran, descartan ni ejecutan operaciones financieras automáticamente.

Pruebas: grupo con varias habitaciones, transferencia dirigida sin pagos en las otras reservas, estados intactos, Caja con el método original, rechazo de reserva ajena/inactiva, saldo excedido o cierre combinado, selección en pantalla y regresiones del pago grupal.
