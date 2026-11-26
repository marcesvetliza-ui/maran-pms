# Huéspedes por habitación y pedidos de camas recibidos de OTAs

Revisión preparada el 26/11/2026 sobre `d832466283fe39b9c4a6cbf6e25f24917ca12e9d`.

## Resultado

Se distingue el titular de la reserva del huésped principal informado para cada unidad. Los nombres adicionales enviados para esa habitación se conservan en el detalle operativo; no se inventan acompañantes ni documentos. Si el canal no informa huéspedes por unidad, se conserva el titular como referencia y se indica esa ausencia. El teléfono y correo del titular no se atribuyen a un pasajero con otro nombre. No se fusionan huéspedes de distintas reservas por similitud de nombre o contacto.

Las nuevas importaciones y modificaciones guardan una huella del huésped por unidad. Una edición de recepción exige revisar la siguiente modificación externa, en lugar de sobrescribirla. Al actualizar una unidad de una reserva antigua que compartía al titular con varias habitaciones, se crea un registro separado cuando corresponde; no se cambia el nombre de todas las habitaciones a la vez.

Los pedidos de camas aparecen en el detalle de la reserva, accesible desde Planning y Reservas, en la bandeja OTA y en la planificación de Housekeeping. Planning incluye una referencia breve al pedido. Se conservan el texto de origen y su alcance. Las expresiones conocidas `2 singoli` y `1 matrimoniale alla francese` se muestran en español, sin usar su orden para asignarlas a huéspedes o habitaciones.

Un mismo texto repetido entre unidades, o una observación global para varias habitaciones, se marca como pedido compartido. Recepción debe confirmar la distribución. No se elige cama física, no se mueve una reserva ni se da una preparación por realizada automáticamente.

Si una reserva nueva no tiene camaje elegido por el personal, su pedido se incorpora a las observaciones operativas de camas. Una corrección local o una preparación de Housekeeping ya registrada se conservan. El pedido original del canal queda visible por separado.

## Recuperación de reservas ya importadas

Al iniciar el receptor OTA que ya estaba habilitado, una recuperación en lotes de 50 recorre las reservas aceptadas, pendientes de llegada y aún sin el nuevo detalle. No activa conexiones ni vuelve a importar el movimiento económico. No necesita pedir una nueva entrega del canal.

Sólo corrige automáticamente al huésped cuando las huellas aceptadas coinciden, no hay movimientos financieros ni vínculo de grupo, documentos añadidos, acompañantes o selección de estadía registrados localmente, y el perfil no se comparte con otra reserva externa a esa contratación. Usa los bloqueos de reserva e inventario existentes y una transacción por contratación completa.

En los demás casos conserva al huésped local y muestra los nombres informados por el canal para revisión. Las habitaciones finalizadas o alojadas no se reescriben. Los errores de una contratación revierten todos sus cambios y no detienen la recepción normal. La recuperación es idempotente y utiliza paginación, sin sondear periódicamente las tablas de origen.

El parche de recuperación sólo contiene huésped y datos operativos de camas. Conserva fechas, habitaciones, ocupación, tarifas, noches, cotización, liquidaciones, cobros y facturas. No genera envíos de inventario. Las cancelaciones, selección manual de habitación y protecciones financieras existentes mantienen su circuito.

## Datos y publicación

La migración agrega `reservations.ota_room_details` y una huella por unidad en `channex_inbound_rooms`. Los formularios públicos y de recepción no pueden escribir el detalle de procedencia. Sólo se guardan nombres y líneas acotadas de preferencia de camas: no se copian contactos, notas privadas completas ni datos de pago a ese campo. Las observaciones privadas originales siguen en su archivo cifrado y detalle con autorización/auditoría.

No se cambian precios confirmados por Booking, descuentos Genius, mapeos ni reglas de venta. No se activan ventas del motor ni ARCA real. Esta revisión no publica el código ni modifica la reserva operativa: la recuperación se ejecutará al publicar e iniciar el receptor habilitado.

Las pruebas y capturas usan identidades ficticias. El paquete no contiene el resultado de consultas operativas, nombres reales, credenciales ni claves.

## Verificación

- Tests de parser, precios recibidos, contacto del titular y alcance de pedidos de camas.
- Tests de pantalla para detalle OTA, Planning/Reservas y Housekeeping.
- PostgreSQL real desechable: nuevas reservas, separación del titular antiguo, correcciones locales, recuperación idempotente, pagos, reservas finalizadas, preparación registrada y rollback de varias habitaciones.
- Regresión de asignación manual, permisos de producción, transporte ARI, recepción y conversión USD, con transportes simulados.
- TypeScript, control de fechas y compilación de producción.
- Chromium a 1280, 820 y 390 píxeles, sin errores ni desborde del diálogo.

Nunca ejecutar las pruebas PostgreSQL contra una base operativa. El script `script/test-booking-engine-ota-isolated.sh` proporciona un entorno desechable para las suites principales de OTAs; las suites de asignación y permisos aceptan una base local de pruebas. La revisión utilizó PostgreSQL portátil y bootstrap con `pg`, porque el entorno carecía de `psql` y `createdb`.
