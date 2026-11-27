# Fechas, noches y precios de grupos

Al cambiar las fechas generales de un grupo, `updateGroupAtomic` conserva la
integridad del alojamiento: fechas, cantidad de noches, detalle nocturno y total
se guardan en una misma transacción junto con el registro de auditoría.

## Uso desde recepción

1. Editar las fechas del grupo y resolver las habitaciones que ya no estén disponibles.
2. Revisar la vista previa de noches e importes por habitación y del conjunto.
3. Si se agregan noches a un contrato con tarifas variables, indicar sus importes
   y pulsar **Revisar importes**. Las noches conservadas mantienen sus precios y descuentos.
4. Confirmar. Si otra persona modificó la cuenta, un bloque o la reserva, se debe
   actualizar la vista previa antes de guardar.

Las habitaciones con fechas individuales y los bloques con fechas propias conservan
esos acuerdos. Las reservas canceladas, con salida registrada o no-show quedan en
el historial. Las estadías en casa, con cobertura fiscal, intentos fiscales pendientes,
vouchers, alojamiento contabilizado en el folio o financiación adoptada requieren
resolverse desde su circuito individual antes de reprogramar el grupo.

Los cobros, sus medios y fechas, Caja, cuenta corriente y consumos no se modifican.
La vista previa no emite comprobantes ni guarda modificaciones.

## Contrato para otros clientes y mantenimiento

- `POST /api/groups/:id/date-change-preview` recibe las nuevas fechas, estado,
  reasignaciones de habitación y cotizaciones de noches nuevas. Devuelve detalle,
  totales, `canConfirm` y `fingerprint`.
- `PATCH /api/groups/:id` necesita `dateChangeConfirmation: { fingerprint, addedRates }`
  cuando cambian las fechas. Se recalcula la propuesta bajo los bloqueos financieros
  y de inventario. Una prueba ausente o desactualizada rechaza la operación completa.
- El escritor anterior `updateGroup` rechaza cambios de fechas; no debe utilizarse
  para evitar la revisión. No se aceptan totales ni detalles nocturnos del cliente.
- Se vuelve a comprobar disponibilidad y mantenimiento al guardar. Un fallo en la
  actualización o en la auditoría revierte todos los cambios.
- No hay migración ni reconstrucción masiva de reservas anteriores. Un detalle
  existente inconsistente exige revisión; no se sobrescribe para ocultar el problema.

## Pruebas de regresión

`shared/groupStayDates.test.ts`, `client/src/pages/groups.stay-dates.test.tsx` y
`server/tests/group-stay-dates.pg.test.ts` cubren el caso de cuatro a tres noches,
precios variables, descuentos, fechas propias, protección fiscal, pagos conservados,
vista previa desactualizada, reintentos, concurrencia y reversión completa por fallos.
La suite PostgreSQL requiere una base local desechable cuyo nombre contenga `test`.
