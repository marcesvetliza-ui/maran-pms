# Edición de folios de reservas en la matriz

El permiso `reservations:edit-accommodation` se muestra como **Edición de folios de reservas**, en la sección API — Reservas de Permisos por Rol. Permite modificar tarifas, descuentos y noches de alojamiento; no equivale a autorización para anular cargos, cambiar cobros o emitir notas de crédito. Los controles fiscales y de disponibilidad siguen vigentes.

Las casillas controlan la herencia por rol independientemente de la visibilidad de Reservas. La opción desplegable **Excepciones por usuario**, dentro de la misma fila, conserva Habilitado / Deshabilitado / Heredar rol y muestra el resultado efectivo. Se retiró el bloque independiente de la cabecera.

La migración toma una única vez una copia de los roles que ya tenían acceso heredado desde `sidebar:/reservations`, sin modificar las excepciones individuales. Registra el recurso en `resource_permission_seeds` dentro de la misma transacción, por lo que una revocación posterior no se revierte al reiniciar o migrar nuevamente. No asigna permisos a usuarios por nombre ni modifica perfiles.

Pruebas locales: casillas y despliegue de excepciones en interfaz; edición independiente del acceso al módulo; precedencia de permisos individuales; migración repetida; regresión de precios por noche y bloqueos fiscales. Sin acceso a usuarios o datos del hotel.
