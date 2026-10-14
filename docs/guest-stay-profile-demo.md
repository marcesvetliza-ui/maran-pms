# Huéspedes y datos de estadía: revisión en Xenia

Implementación en `fix/assistant-diagnostic-format`, para el demo. No desplegar
esta rama completa en MARAN: contiene marca y asistente exclusivos del piloto.
Después de aprobar, trasladar únicamente el commit de esta funcionalidad.

## Funcionamiento

- La ficha del huésped guarda listas de vehículos, familiares y mascotas.
  Los vehículos anteriores se ofrecen como primer registro sin borrar sus datos.
- El formulario principal aprovecha el ancho en escritorio, apila campos en
  celular y conserva los botones de guardado fuera del área que se desplaza.
  Fecha de nacimiento es visible y opcional.
- Las reservas muestran datos habituales sin seleccionar. Seleccionar un familiar
  lo incluye entre los acompañantes, sin crear un cliente nuevo.
- Se puede cargar información ocasional y elegir, explícitamente, recordarla en
  la ficha del titular para futuras visitas.
- Familiares, autos y mascotas de una reserva son snapshots: editar la agenda
  no cambia estadías existentes. Las mascotas no generan cargos y los vehículos
  no asignan cupos de cochera. La cantidad de huéspedes y la tarifa no se cambian.
- Lo seleccionado antes del ingreso se presenta como previsto para la reserva;
  recepción verifica quiénes y qué llegaron.
- Crear la reserva y guardar estas selecciones se realiza en una transacción.
  Los acompañantes ocasionales ya existentes conservan su flujo de carga.
- Cambiar el titular limpia las selecciones asociadas al anterior y conserva
  los acompañantes ocasionales. Guardados concurrentes exigen actualizar.

## Migración y compatibilidad

`ensureGuestStaySchema` agrega, sin eliminar ni reconstruir tablas:
`guests.stay_profile`, `reservations.stay_details` y
`reservation_companions.profile_member_id`, con índice único por reserva/familiar.
Es idempotente y corre en el arranque del PMS. El vehículo principal se refleja
también en los cuatro campos anteriores, para conservar las vistas existentes.

Los endpoints GET/PUT `/api/reservations/:id/stay-details` usan los permisos
existentes de reservas. El servidor valida campos y versión, bloquea la reserva
y sincroniza los familiares con los acompañantes dentro de la misma transacción.
Editar o eliminar acompañantes también invalida esa versión y verifica su
pertenencia a la reserva.

Ante una reversión de código, conservar las columnas y los datos nuevos; no
borrarlos para volver a la versión anterior. La interfaz anterior no muestra
las listas pero conserva los acompañantes y el vehículo principal.

## Recorrido de aceptación en el demo

1. Editar un huésped de prueba: nacimiento, dos vehículos, dos familiares y una
   mascota. Cerrar y abrir sus desplegables; guardar y volver a abrir la ficha.
2. Crear una reserva con ese titular. Verificar que ninguna opción está marcada.
   Elegir un familiar, un vehículo y una mascota; comprobar Acompañantes.
3. Abrir Ver completo: revisar lo seleccionado, agregar un acompañante ocasional
   y guardar una mascota ocasional sin marcar Recordar. Reabrir y comprobar todo.
4. Crear otra reserva del mismo huésped: las opciones habituales siguen sin marcar
   y la mascota ocasional anterior no está en su agenda. Probar también Recordar.
5. Editar el perfil habitual y verificar que los datos de la primera reserva
   se conservan. Quitar un familiar desde Acompañantes y revisar Grupo familiar.
6. En una reserva nueva, seleccionar datos y cambiar el titular: no deben arrastrarse.
   Probar dos ventanas editando la misma estadía: la segunda debe pedir actualizar.
7. Repetir el formulario y los desplegables en celular. Confirmar que Guardar
   permanece accesible y no aparece desplazamiento horizontal.

Validación automatizada: componentes React, regresiones de reservas y huéspedes,
PostgreSQL local con transacciones reales, tipos y compilación. Verificación
visual adicional en Chromium a 1440×1000 y 390×844, con datos ficticios.
La aceptación en el demo desplegado sigue pendiente de revisión del usuario.
