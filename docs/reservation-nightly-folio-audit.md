# Detalle de reserva y Folio por noche: revisión previa

Fecha: 2026-10-19. Zona horaria de negocio: America/Argentina/Buenos_Aires.

## Alcance autorizado y estado de esta entrega

Se solicita llevar al sistema real el diseño aprobado de **Reserva ampliada ·
Folio por noche**, revisar los cálculos e implementar persistencia y operación
completa primero en una demo aislada.

Este documento registra la **revisión inicial**, anterior a la implementación.
La implementación posterior, sus verificaciones y las instrucciones de demo
se documentan en `reservation-nightly-folio-demo.md`. No se modificaron datos
operativos ni se emitieron comprobantes reales. No se integró ni publicó main.

La rama `feature/reservation-nightly-folio` parte de `origin/main`
`41eb2ac3984c054671d2ca3e266d17e232d97ce1`, obtenido mediante fetch antes de crear
la rama. El trabajo se realiza en un worktree separado del asistente y del
checkout principal. No se mezclaron commits de las ramas del asistente.

El diseño aprobado está en el workspace principal:

- `artifacts/mockup-sandbox/src/components/mockups/reservation-folio/WideFolio.tsx`
- `artifacts/mockup-sandbox/src/components/mockups/reservation-folio/wide-folio.css`

Es una referencia visual, no una implementación financiera. Sus datos, guardado,
historial, disponibilidad y acciones de cargos no pueden trasladarse como
simulaciones al sistema real.

## Hallazgos verificados en el código de main

### 1. Persistencia actual del alojamiento

`shared/schema.ts`, tabla `reservations`, guarda:

- Fechas de ingreso y egreso y cantidad de noches.
- `baseRatePerNight`, `finalRatePerNight`.
- `discountType`, `discountValue`.
- `totalRoomAmount`.
- Fecha de creación y último modificador.

No se encontró un registro persistido de tarifa y descuento por fecha nocturna,
ni una versión del esquema de precios de la reserva. La información existente
describe importes globales o una tarifa única, no una secuencia de tarifas
pactadas individualmente para cada noche.

El historial de `reservation_changelog` conserva cambios operativos, pero no
reemplaza un contrato nocturno completo. Los eventos de tarifa se construyen con
`getReservationRateAuditEvent` en `shared/reservationFolio.ts`.

**Consecuencia:** dividir un total histórico entre sus noches produce un
promedio, no evidencia de lo pactado en cada fecha. No debe mostrarse como un
detalle nocturno original ni persistirse como conversión implícita.

### 2. Alta y cambios de fechas

`server/routes/reservations.ts` contiene el alta y el PATCH general. El servidor
asigna la creación y el actor del alta y protege esos campos durante el PATCH.
También admite y normaliza los campos globales de tarifa y descuento.

El PATCH puede recalcular `totalRoomAmount` cuando recibe nuevas noches sin un
total explícito, usando la tarifa única guardada. Ese comportamiento pertenece
al circuito anterior y **no sirve como regla del nuevo modelo nocturno**.

Hay controles de superposición de habitación y de inventario grupal. En
`server/db-storage.ts`, `createReservation` y `updateReservation` vuelven a
controlar inventario dentro de transacciones protegidas por el bloqueo
`lodging-inventory-mutations`. El update bloquea además la reserva con
`SELECT ... FOR UPDATE`.

**Reutilizar:** estos controles y su tratamiento de conflictos, en vez de crear
un segundo verificador de disponibilidad.

**Pendiente de implementar:** previsualización autoritativa y confirmación de
estadía que conserven las noches retenidas y exijan importes explícitos para
cada noche nueva. Quitar una noche debe retirar también su descuento, sin
redistribuirlo silenciosamente a las restantes.

### 3. Lecturas del Folio y la Prefactura

La ficha completa está en `client/src/pages/reservations.tsx`,
`ReservationDetailDialog`. La Prefactura está en
`client/src/components/PrefacturaDialog.tsx`.

Actualmente parten de importes guardados de la reserva y de cargos, pagos y
facturas existentes. Las funciones de `shared/reservationFolio.ts` ya distinguen
los efectos de facturas, notas de crédito, anticipos y cargos operativos.

**Reutilizar:** ese circuito financiero. El nuevo detalle nocturno debe sumar
exactamente el `totalRoomAmount` que consumen estos lectores; no debe inventar
otro saldo ni otra forma de aplicar pagos.

### 4. Cobertura fiscal: existe por concepto, no por noche

En `server/billing/routes.ts`, la emisión de una factura de reserva consume
fuentes explícitas y sus importes. El alojamiento se presenta como una fuente
global `accommodation`. Los consumos se identifican por sus cargos.

Para controlar residuales se consultan facturas previas y sus importes por
fuente, incluyendo estados fiscales que no pueden ignorarse durante una
edición. Este mecanismo permite distinguir un importe de alojamiento facturado
de un cargo de Restaurant o SPA, pero no atribuirlo a fechas nocturnas.

La emisión utiliza el bloqueo existente `folio-invoice:<reservationId>` mediante
`withInvoiceAdvisoryLock`, en `server/billing/invoiceAdvisoryLock.ts`.
Modificar alojamiento y emitir facturas deben serializarse sobre ese mismo
alcance, además de respetar los bloqueos de inventario y fila. Agregar sólo una
comprobación de facturas antes de guardar dejaría una carrera.

No se deben usar únicamente el total facturado de toda la reserva ni la
presencia de anticipos para declarar una noche fiscalmente cubierta.

### 5. Accesos y acciones que deben conservarse

- Reservas muestra `ReservationDetailDialog`.
- Planning utiliza `client/src/components/planning-reservation-detail.tsx`.
  Su botón **Ver Completo** navega a `/reservations?view=<id>`.
- Planning tiene también su propio editor rápido y su acceso a Prefactura.
  Deben cubrirse ambos, no sólo ensanchar el diálogo completo.
- Existen circuitos para cargos manuales, anulación con motivo, transferencias,
  cobros e historial. El rediseño no debe reemplazarlos por acciones nuevas.
- Las restricciones actuales por origen y situación fiscal del cargo siguen
  vigentes. Mostrar botones para Restaurant o SPA en un prototipo no autoriza
  anular esos consumos desde Recepción.

## Decisión financiera confirmada por el usuario

### Caso concreto

Noches pactadas: $90.000, $90.000 y $95.000. Alojamiento: $275.000.
Una factura consume $100.000 de `accommodation`.

Recepción desea bajar la última noche de $95.000 a $85.000.

El registro fiscal actual prueba que hay $100.000 de alojamiento facturados,
pero no que la factura cubra las primeras noches o excluya la última. No se
puede afirmar que esa última noche está pendiente de facturar por el solo hecho
de que quede un residual agregado de $175.000.

### Alternativa recomendada para este alcance

**Aprobada expresamente el 2026-10-19:** bloqueo conservador hasta resolver
el ajuste fiscal. No se aprobó ampliar la atribución fiscal a cada noche.

Mientras exista cobertura fiscal de alojamiento, parcial o completa, impedir
la edición directa de sus tarifas/descuentos y la eliminación de sus noches.
La interfaz debe mostrar el importe cubierto y explicar el paso de ajuste o
nota de crédito existente, sin emitirlo automáticamente.

La comprobación debe contemplar operaciones fiscales en curso y evidencia
histórica ambigua; no debe desbloquear una edición suponiendo que una nota
de crédito o factura anulada eliminó toda su cobertura.

Los anticipos por sí solos no bloquearían la edición: permanecen intactos y
afectan el saldo, no la tarifa pactada.

Esta alternativa es conservadora: también bloquearía la edición de noches que
podrían estar pendientes, porque no hay una atribución fiscal por fecha que
permita demostrarlo. Debe aprobarse esa limitación operativa explícitamente.

### Alternativa de mayor alcance

Agregar cobertura fiscal por noche para las nuevas emisiones del nuevo esquema,
manteniendo compatibilidad con `accommodation`, notas de crédito, cobertura
parcial, reservas grupales y evidencia histórica sin desglose. Requiere ampliar
el diseño fiscal; no corresponde inferirlo del prototipo ni implementarlo sin
confirmación.

Las reservas y facturas anteriores seguirían sin disponer de atribución por
fecha; no se les debe inventar esa atribución.

## Condiciones de la implementación posterior

1. Agregar una identificación persistida del esquema por reserva. Las existentes
   quedan en el esquema anterior; abrirlas, editarlas o cambiar su estado nunca
   debe convertirlas.
2. Registrar la activación en el servidor con fecha/hora interpretable en la zona
   del hotel. Sólo altas nuevas posteriores a la activación pueden entrar al
   esquema nuevo. La fecha de ingreso de la estadía no es el criterio.
3. Para reservas nuevas, capturar tarifas nocturnas al contratar; no reconstruir
   valores históricos desde el tarifario vigente.
4. Calcular en centavos. Una tarifa común vacía conserva tarifas diferentes.
   Un descuento vacío conserva; cero elimina; uno nuevo reemplaza el anterior.
   El porcentaje se calcula sobre cada tarifa. El descuento total debe mostrar
   distribución y redondeo exactos.
5. Guardar detalle, total canónico, revisión e historial en una transacción.
   La confirmación debe rechazar una revisión obsoleta y preservar actor,
   instante, motivo y valores anteriores/nuevos.
6. Cualquier modificación de estadía debe volver a validar disponibilidad al
   confirmar, aunque la previsualización hubiese indicado disponibilidad.
7. Aplicar el criterio fiscal confirmado sin crear ni anular pagos, movimientos
   de Caja o devoluciones como efecto de cambiar tarifas.
8. Mantener la coherencia entre detalle, Folio, Prefactura y facturación,
   reutilizando las fuentes y los bloqueos actuales.
9. Incorporar cualquier migración necesaria tanto al esquema como al mecanismo
   incremental de `server/migrate.ts`, de manera idempotente y sin backfill de
   tarifas antiguas.
10. Migrar la estructura visual aprobada al sistema real sin perder acciones,
    datos, historial, accesibilidad ni acceso desde Planning.

## Matriz definida durante la auditoría

La demo debe usar una base desechable explícitamente aislada. No basta con que
exista una variable `DATABASE_URL`. No cambiar la conexión de la aplicación
operativa ni iniciar la nueva versión contra esa base.

Matriz obligatoria antes de entregar implementación:

- Tarifas nocturnas distintas y descuentos en pesos/porcentaje.
- Descuento conservado, reemplazado y eliminado con cero.
- Distribución de descuentos totales con centavos y límites.
- Agregar y quitar noches; conflicto de disponibilidad al confirmar.
- Guardar, cerrar, reabrir e historial con datos persistidos.
- Importes iguales en Folio y Prefactura.
- Reservas anteriores sin conversión ni cambios de importes.
- Anticipos y facturación parcial/completa.
- Dos ediciones concurrentes y carrera con emisión de factura.
- Interfaz en escritorio, tablet y celular, incluidos ambos accesos.

Esta matriz se definió durante la auditoría, antes de las pruebas. Los resultados
efectivamente obtenidos y las limitaciones se registran por separado en
`reservation-nightly-folio-demo.md`; no deben confundirse con esta lista inicial.
