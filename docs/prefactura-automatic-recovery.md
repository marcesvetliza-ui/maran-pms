# Recuperación automática de Prefactura

Al abrir una prefactura con una operación recuperable, el sistema consulta su estado y continúa el pedido original sin pedir «Completar operación pendiente». Funciona tanto con el intento de la misma sesión como con el descubierto desde otra computadora. No prepara importes, receptor, medios de pago, fecha ni cierre a partir del formulario actual.

Antes de escribir vuelve a consultar el servidor, comprueba reserva, operación y plan de recuperación versión 2, y toma su copia inmutable como fuente. Reutiliza los identificadores originales de factura y pago; omite los pagos ya acreditados y las facturas ya recuperadas. Una Cuenta Corriente conserva esa modalidad y no se convierte en ingreso de Caja.

Una salida se ejecuta únicamente si el pedido original la incluía y la reserva sigue sin cerrar. La recuperación conserva el pendiente si falla la salida o la actualización posterior de la cuenta. Una operación con la factura/pago completos y el check-out pendiente sigue siendo descubrible desde otra sesión. El estado de salida, la fecha persistida y el historial de reversión impiden volver a cerrar por un intento anterior una estadía reabierta, incluso cuando la reversión borró su fecha de salida.

Un borrador bloqueado antes de emitir, sin plan de cobros nuevos, se archiva automáticamente mediante el endpoint de corrección existente, que vuelve a verificar sus efectos bajo bloqueo financiero. La prefactura queda editable con receptor, condición de venta y conceptos originales; no se fuerza una emisión con datos rechazados. El circuito de corrección de documentos cancelados conserva sus comprobaciones existentes.

Para cobros individuales de grupos, la elección entre un pago separado y los anticipos sin asignar se valida antes de guardar una nueva operación. La interfaz conserva los campos editables y el servidor repite el control bajo los bloqueos financieros de reserva y grupo; un rechazo sin efectos no queda como una emisión pendiente. Las solicitudes existentes conservan su identidad y los controles posteriores a la validación siguen vigentes.

Si un intento anterior quedó en `prepared` por esa elección pendiente, el servidor lo identifica únicamente cuando no tiene factura ni pagos registrados. Para planes de cobro directo verificables, la recuperación usa la corrección protegida y devuelve la prefactura editable con importe, tarjeta u otro medio, fecha, receptor y conceptos originales. No confirma el uso de anticipos, no emite ni cobra al corregir y no exige un botón de completar. Recepción puede confirmar el pago separado y emitir con una nueva operación; los anticipos grupales conservan su destino.

Las respuestas transitorias de red/502/503/504 tienen hasta dos reintentos automáticos, a los 2 y 10 segundos, siempre consultando otra vez el estado y usando las mismas claves. No hay un bucle de escrituras por renderizado. Cerrar la pantalla o cambiar de reserva frena los pasos siguientes; las respuestas ya comprometidas conservan su seguimiento. Los datos locales no se eliminan ante errores o resultados contradictorios.

La recuperación normal muestra un estado de actualización en lugar del cartel amarillo y el botón de completar. Rechazos fiscales, pagos modificados, planes históricos no verificables y otras inconsistencias conservan sus controles de revisión; no se ocultan como si fueran operaciones exitosas. No se cambian importes ni se asignan anticipos para forzar su resolución. Las demás mesas y habitaciones no forman parte de la operación recuperada.

## Validación

- Pruebas de interfaz: recuperación local/remota a Cuenta Corriente, factura y pago ya confirmados, conflicto detectado al revalidar, borrador bloqueado sin emisión, cobro grupal previo devuelto a edición conservando tarjeta y fecha, reintentos acotados, pérdida de respuesta después de cobrar y cierre de pantalla durante una respuesta fiscal.
- Regresiones de Prefactura y pruebas del plan inmutable y de la política de recuperación.
- Pruebas de servidor y PostgreSQL descartable: numeración fiscal, reintentos, pagos individuales de grupos, salidas pendientes y estadías reabiertas.
- TypeScript, compilación de producción y control de fechas.

No requiere migraciones de esquema ni ejecuta un barrido financiero del hotel. No se completaron, corrigieron ni cobraron operaciones reales durante el desarrollo. La publicación debe preceder a la comprobación del caso real en Maran.
