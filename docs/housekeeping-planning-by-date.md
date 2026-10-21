# Housekeeping: planificación por fecha y camaje

Etapa 3, desde main `51120224` (tareas y asignaciones ya integradas). Trabajo en
`feature/housekeeping-planning-by-date`; no activa ni modifica datos del hotel.

## Uso

La supervisión tiene una pestaña **Planificación por fecha**. Inicia en hoy y permite
consultar otra fecha, filtrar piso, ingresos, salidas, tareas o camajes a revisar.
Las tarjetas distinguen camaje físico actual y pedido de cada reserva. Los totales
son generales de la fecha; los filtros se aplican a la grilla. Las reservas sin
habitación operativa asignada se muestran por separado.

La fecha futura describe trabajo previsto; nunca afirma que una habitación estará
limpia. Para el pasado se muestran horarios de tareas guardados y se advierte que
las reservas y estados físicos actuales no reconstruyen una fotografía histórica.
Se conservan tareas de habitaciones desactivadas o retiradas. Se excluye REUB y
habitaciones virtuales. Reservas canceladas y no-show no se cuentan como movimiento.
La consulta reutiliza las observaciones operativas del parte diario para los
movimientos que éste incluye; no expone importes, documentos, teléfonos ni notas
generales de la reserva.

**Programar tarea** abre el formulario de la etapa anterior con la habitación y la
fecha seleccionadas. No se ejecutan tareas futuras ni se crean tareas automáticas.
Horarios y duración real se muestran en hora argentina, incluidos cruces de día;
un cronómetro o estimación no finaliza una tarea por sí solo.

## Confirmar camaje

La configuración física y el catálogo de pedidos usan códigos distintos. Sólo se
comparan equivalencias explícitas (`DBL`/`MAT`, `TWN`/`TWIN` y códigos de configuración
idénticos). Un código ambiguo o texto libre exige revisión; no se asume equivalencia
por parecido. Se siguen mostrando las indicaciones originales.

La confirmación requiere supervisión, seleccionar el camaje físicamente preparado
y declarar la revisión del pedido e indicaciones. No puede confirmar para otra
reserva mientras exista otro huésped alojado en esa habitación, ni elegir un camaje
fuera de los permitidos. Se comprueban habitación, pedido y revisión física para
rechazar datos desactualizados. No se ofrece confirmación sobre una fecha pasada.

Se actualiza el camaje físico y se registra la confirmación, su actor, fecha e
historial en una sola transacción. No cambia ocupación, limpieza, pagos ni facturas.
No implica autorización para vender o ingresar: las reglas existentes siguen vigentes.
**Limpia — No mover permanece exactamente en su circuito actual.**

Una revisión del camaje físico aumenta cuando éste cambia. Así una confirmación
vieja no reaparece como vigente si el camaje cambia y luego vuelve al anterior.
Cambiar habitación o pedido de la reserva elimina la confirmación actual, conservando
el historial. Un PATCH genérico no puede fabricar confirmaciones ni revisiones.

## Migración y comprobaciones

Migración idempotente, también en el runner incremental: agrega
`reservations.housekeeping_bed_preparation` (nullable) y `rooms.bed_config_revision`
(default 0). No copia datos, no rellena confirmaciones y no requiere activación.
Se debe desplegar junto al código y correr el runner habitual antes de usar la vista.
No debe retirarse una columna en un rollback mientras el código todavía la consulte.

Pruebas con PostgreSQL local desechable: accesos, fechas, proyección futura,
privacidad, historial, confirmación física, No mover intacto, conflictos, permisos de
configuración, invalidación, concurrencia y rollback. Se vuelven a ejecutar tareas,
preparaciones especiales y parte diario de la etapa anterior.

Pruebas de interfaz: futuro frente a estado actual, consulta histórica sin acciones,
fecha al programar, confirmación con datos revisados y cancelación sin escritura.
Chromium con APIs sintéticas a 1366×960, 820×1180 y 390×844: navegación por fecha,
formulario de tarea con fecha correcta, confirmación dentro del viewport y consulta
histórica. TypeScript y build del proyecto. No son pruebas contra el hotel en vivo.
