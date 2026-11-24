# Reemplazar o liberar un pasajero de un grupo

En Grupos → Reservas, el lápiz ofrece **Reemplazar huésped** (o **Asignar huésped** si el cupo todavía no tiene pasajero). Conserva habitación, fechas, precio y cupo. Reemplazar un pasajero exige un motivo de 10 a 1000 caracteres y confirmar que la estadía y sus pagos se conservan. El historial registra el operador, el pasajero anterior, el nuevo y el motivo. La asignación inicial de un cupo sin pasajero no exige un motivo de reemplazo. Los anticipos personales requieren confirmación explícita para beneficiar al reemplazo.

Reemplazar conserva íntegra la distribución actual de los recibos, incluso si tienen aplicaciones a otras habitaciones y cargos del grupo. Se valida la distribución vigente; la simulación de liberar anticipos corresponde únicamente a Liberar asignación.

**Liberar asignación** ofrece una vista previa y exige un motivo. La reserva anterior se cancela y conserva su vínculo al grupo y su historial. Se crea un cupo sin pasajero en la misma habitación, con exactamente las fechas, categoría, condiciones de upgrade y precios persistidos de la reserva anterior. El bloque no se reduce y la habitación sigue comprometida para el grupo. Se puede asignar al nuevo pasajero con el lápiz o desde Asignar del bloque. No se recalcula la tarifa.

Los pagos grupales ya registrados siguen siendo la fuente monetaria. Liberar su aplicación modifica únicamente la distribución del recibo y la aplicación a esa habitación; lo vuelve disponible en **Folio Grupal → Anticipos disponibles del grupo**. No agrega dinero ni registra otro ingreso en Caja. El alojamiento impago no genera un anticipo.

Para un anticipo personal directo, la confirmación crea un recibo de traspaso trazado al pago original. El origen queda identificado como transferido, sus importes/medio/fecha/referencia originales y su ingreso de Caja se conservan, y el recibo grupal muestra **cobro nuevo $0**. Anular el origen por separado se bloquea. Una anulación desde el recibo del grupo revierte sus aplicaciones y utiliza el pago y Caja originales, sin duplicar devoluciones.

Solo se admite antes del check-in. Una factura o intento financiero que afecta a la reserva, consumos/cargos, Cuenta Corriente, retenciones, vouchers, financiación explícita, conexión OTA o evidencia ambigua requiere resolver su circuito específico antes de liberar/reemplazar. Las facturas verificables de otras habitaciones no bloquean por sí solas. No se cambian comprobantes para forzar una liberación.

## Integridad y despliegue

- Dos tablas aditivas: `group_assignment_releases` conserva la identidad y resultado de cada liberación; `group_personal_advance_origins` conserva la procedencia del dinero incluso después de anular un recibo.
- Restricciones únicas impiden liberar dos veces la misma reserva o transferir dos veces el mismo pago. La verificación de esquema financiero exige las tablas, columnas e índices.
- La operación se serializa con facturación, aplicaciones grupales, el grupo, la reserva y el inventario. Compara la vista previa con el estado actual y guarda cancelación, cupo nuevo, distribución y auditoría en una transacción.
- El intento se reenvía con la misma identidad cuando la respuesta es incierta. Un conflicto refresca la vista previa y conserva el motivo. Las identidades de operaciones sobreviven a la eliminación de recibos.
- Se impide reabrir la asignación cancelada que ya tiene reemplazo y cargarle cobros/cargos tardíos. Los cambios generales de reserva no pueden saltarse la revisión de anticipos para reemplazar a un pasajero real del grupo.
- La acción antigua de reducir/desvincular cupos mantiene su protección financiera. Este circuito conserva bloques y vínculos históricos.

Las pruebas usan huéspedes, grupos, pagos y facturas sintéticos en PostgreSQL descartable. No se libera ninguna asignación real como parte de la publicación.
