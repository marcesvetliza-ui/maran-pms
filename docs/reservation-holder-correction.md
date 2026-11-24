# Corregir el titular de una estadía

Planning o Reservas → abrir la reserva → Datos → Cambiar titular.
Disponible para estadías con check-in activo y permiso de edición de Reservas.
Editar datos mantiene su función de corregir la ficha de la misma persona.

Cambiar titular sirve para corregir quién se alojó desde el ingreso cuando se
registró otra persona por error. Permite buscar una ficha existente o crear una
nueva. Crear la ficha es una acción separada; la reserva no cambia hasta elegir
el destino, escribir un motivo de al menos diez caracteres y confirmar el aviso.

La operación conserva habitación, fechas, tarifa, cantidad de huéspedes,
acompañantes, vehículos, mascotas, grupo y movimientos. No cambia las fichas de
las personas, facturas emitidas, pagos, consumos, Caja ni responsables de deudas
de Cuenta Corriente. El snapshot de datos de la estadía se vincula al titular
correcto e incrementa su versión para rechazar ediciones antiguas.

Titular anterior, nuevo titular, motivo, operador y fecha quedan en Historial y
en auditoría, dentro de la misma transacción que la corrección. Un fallo de
auditoría revierte toda la operación. El titular esperado evita sobrescribir
otro cambio; el bloqueo de la reserva serializa confirmaciones simultáneas.

Se rechazan estadías cerradas o previas al check-in, fichas inactivas, personas
jurídicas, perfiles genéricos de grupo y personas que ya figuran como
acompañantes. En este último caso hay que revisar ese registro para no duplicar
ocupantes. Una autorización fiscal en curso o incierta de esta estadía debe
resolverse antes; los consumos y comprobantes ya emitidos no impiden corregirla.
Los circuitos generales de reemplazo de pasajeros y liberación de cupos de
Grupos conservan sus controles anteriores.
