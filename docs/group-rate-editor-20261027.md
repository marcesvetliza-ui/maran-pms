# Tarifas desde Grupos

## Causa reproducida

El botón Tarifa enviaba finalRatePerNight y totalRoomAmount al PATCH del grupo.
Las reservas nightly_v1 rechazan esas escrituras desde guardPricingUpdate:
deben conservar el detalle de noches y utilizar el escritor con revisión,
previsualización y motivo. El catch del grupo convertía ese conflicto 409 en
un 500 genérico, ocultando el motivo al operador.

Se reprodujo con una reserva sintética de tarifa cero, intentando 144000/noche
y 432000 total, usando el guard real. No se consultó la base operativa ni los
logs del intento de Derecho Administrativo: no se afirma que su estado fiscal
real esté comprobado.

## Corrección

- Grupos reutiliza ReservationNightlyPricing para nightly_v1: selección de
  noches, importes, descuentos, revisión, motivo e historial existentes.
- Actualiza el grupo y Folio Maestro tras aplicar. No crea otro escritor.
- Horarios se guardan por separado sin reenviar una tarifa antigua.
- Reservas anteriores conservan el editor original; no se reconstruyen noches.
- El PATCH de tarifa valida el permiso de edición de alojamiento y el importe
  completo (sin aceptar sufijos o Infinity).
- Conflictos esperados conservan su estado y mensaje; errores internos siguen
  ocultos. La protección fiscal y la concurrencia permanecen en el guard.

## Validación

39 pruebas cliente (Grupos y editor nocturno), 17 servidor (ruta y guard real
con consultas simuladas), TypeScript y compilación. No se emitieron facturas,
se modificaron tarifas reales ni se cambiaron permisos en producción.

Tras desplegar, comprobar el grupo afectado. Si tiene facturas activas, el
editor mostrará el bloqueo de Folio Maestro: resolver por el circuito fiscal
existente, nunca desactivar el guard para forzar la tarifa.
