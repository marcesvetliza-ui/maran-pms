# Cuenta grupal y recepción

Se conservan Grupos, el Folio Maestro, las habitaciones y las reservas. El acuerdo
con el organizador queda como referencia comercial; no determina qué habitación
puede registrar un cobro o emitir su factura ordinaria.

## Recorridos en las pantallas existentes

- En el folio de una habitación, la cuenta muestra cargos, pagos aplicados, saldo
  por cobrar, conceptos pendientes de facturar y anticipos grupales sin asignar.
- «Registrar pago sin facturar» registra dinero nuevo por esa habitación, aunque
  ya esté facturada al organizador. No emite otro comprobante fiscal. Si hay
  anticipos pendientes de asignar, exige confirmar que se trata de dinero nuevo.
- La emisión individual ordinaria (A/B/C/MiPyme) documenta las fuentes pendientes,
  sin registrar dinero nuevo ni crear deuda en Cuenta Corriente. El receptor se
  elige en el selector existente. La cobertura se comparte con la factura grupal.
- Al dar salida a una reserva grupal, Recepción puede abrir la cuenta de la
  habitación o confirmar la salida física dejando el saldo dentro del grupo.
  Se conserva el registro de quién autoriza la salida con deuda y su motivo.
  El acceso desde Planning usa este mismo recorrido, también para grupos
  anteriores: «Check-out» → «Confirmar salida sin cobro». Alojamiento y consumos
  permanecen en el Folio Maestro con su habitación de origen, sin pagos ni facturas;
  las demás habitaciones y el grupo siguen abiertos.
- Pago Grupal permite un reparto igual con tope en los saldos, proporcional, por
  una habitación o con importes manuales. El anticipo también puede dejarse sin
  asignar; después se aplica desde el grupo a varias habitaciones o desde una
  habitación a su propio saldo, con vista previa.
- La aplicación de un anticipo conserva el recibo, fecha e instrumentos originales.
  No crea un nuevo ingreso en Caja ni reabre la habitación al liquidar una deuda
  posterior a su salida.

## Controles conservados

Los importes se validan en centavos. Las asignaciones pertenecen al mismo grupo,
no superan el recibo disponible ni el saldo de la habitación y se confirman en una
transacción bajo los bloqueos financieros existentes. Padre y asignaciones nunca
se suman como cobros diferentes. Los totales consolidados incluyen alojamiento,
consumos de habitaciones y cargos generales, con independencia del acuerdo.

Los intentos nuevos conservan identidad y contenido para reintentar tras un corte
sin repetir dinero ni documentos. `group_account_operations` conserva también la
identidad de los recibos anulados: un reintento tardío no puede recrearlos. Las
operaciones fiscales ya preparadas conservan sus planes y su recuperación previa;
no se cambian automáticamente. Notas de crédito, retenciones, Cuenta Corriente y
Factura T conservan sus controles específicos.

No se reconstruye el pasado. Los recibos sin distribución probada, aplicaciones
inconsistentes o instrumentos que requieren conciliación se identifican para
revisión. Solo los anticipos explícitamente sin asignar y con medios monetarios
verificables se ofrecen para aplicar. Un nuevo anticipo sin asignar admite efectivo,
transferencia, débito, crédito o Mercado Pago sin retenciones; las otras liquidaciones
usan el circuito existente con destino definido.

Una factura grupal o individual histórica sin detalle suficiente de fuentes impide emitir de
nuevo esos conceptos hasta revisar su cobertura; no impide cobrar una deuda
verificada. Las reservas cerradas mantienen sus fechas y su cierre; no se alteran
sus cargos por este circuito.

## Verificación

Pruebas con PostgreSQL local cubren emisión individual pagada y pendiente sin
movimientos económicos, cobro de una habitación ya facturada al grupo, liquidación
posterior a la salida, reparto manual, aplicación parcial con instrumentos mixtos,
concurrencia, reintentos, anulación seguida de reintento tardío, exceso de saldo y
habitaciones ajenas. Las pruebas de interfaz cubren las opciones de salida y los
reintentos después de recargar la página.

La emisión aislada por un pago de habitación grupal se reemplaza por la selección
de conceptos pendientes en el folio; así conserva una cobertura fiscal común.
