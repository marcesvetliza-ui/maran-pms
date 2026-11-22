# Marcar un turno SPA como completado

El botón «Marcar como completado» reemplaza a «Iniciar» en el uso diario de la agenda. Envía el estado real `completed`; el recuadro queda verde y el estado visible es «Completado». Está disponible para turnos confirmados y para los que ya estaban en curso. Los turnos pendientes conservan la confirmación previa.

El diálogo espera una respuesta exitosa antes de cerrarse. Si falla la operación, conserva el turno seleccionado para reintentar. Completar no registra un cobro ni cierra la cuenta: si la cuenta sigue abierta, el acceso a Folio permanece disponible también en los turnos completados.

Al completar directamente se utiliza el mismo consumo de insumos por cuenta que al iniciar o cerrar. El motor existente conserva la identidad de origen y evita repetir el descuento al completar un turno que ya estaba iniciado, reintentar o cerrar su cuenta después. Las ventas anticipadas y vouchers conservan la lógica existente de prestación utilizada al completar.

La ruta histórica `in_progress` sigue funcionando para las integraciones existentes; la nueva interfaz no necesita pasar por ese paso. Se conservan los permisos y la protección financiera. No se modifican turnos reales durante las pruebas ni se aplican cambios a Xenia.

Validación: PostgreSQL local descartable con inicio y finalización directa, fallo simulado de consumo y rollback, reintentos concurrentes, un único descuento, cuenta y pagos conservados, venta anticipada y regresiones de cancelación. Navegador con datos sintéticos en computadora y celular, incluyendo turnos ya en curso, rechazo, espera, éxito, color y acceso posterior al Folio.
