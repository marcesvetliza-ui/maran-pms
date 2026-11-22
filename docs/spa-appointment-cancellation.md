# Cancelación de turnos SPA con cuenta protegida

El botón de cancelación enviaba un PATCH de agenda que la protección de financiación rechazaba como una escritura financiera antigua. La cancelación ahora tiene un contrato estricto: solo estado `cancelled` y un motivo no vacío de hasta 2000 caracteres. Ningún campo de cobro, identidad, tratamiento, habitación o cuenta puede acompañar esa excepción.

La ruta conserva los permisos administrables de SPA, toma la misma exclusión de cuenta que el circuito financiero y luego bloquea el turno. Si hay una operación financiera no terminada (reservada, autorizando, resultado incierto o autorización pendiente de vincular), devuelve un conflicto comprensible antes de modificar la agenda. Conserva las reservas de fondos. La espera por otra operación está acotada a tres segundos.

Una cancelación válida cambia el estado del turno y guarda motivo y operador en auditoría, en una sola transacción. Al excluir los turnos cancelados de disponibilidad, se liberan tanto el gabinete principal como los recursos del circuito, conservando sus registros. Los reintentos conservan el primer motivo y una única auditoría. Si falla la auditoría, se revierte el cambio de estado.

No anula ni devuelve pagos, no modifica facturas, vouchers, saldos, cargos a habitación o consumos de stock. Esos circuitos mantienen sus acciones y protecciones financieras. El diálogo se cierra solo después de una respuesta exitosa; ante un rechazo conserva el motivo para revisar y reintentar.

Pruebas: solicitudes inválidas y mixtas frente a la protección financiera; HTTP con PostgreSQL local descartable y las rutas reales; cuentas adoptadas y despliegue completo; permisos SPA/Recepción; cuentas pagadas/cerradas; operaciones pendientes y fondos retenidos; conflicto por bloqueo; reintentos concurrentes; rollback de auditoría; recursos e invariancia de registros financieros. Navegador con datos sintéticos en escritorio y celular: rechazo, conservación del motivo, espera y éxito. No requiere migraciones ni variables nuevas.
