# Edición de folios de reservas en la matriz

El permiso `reservations:edit-accommodation` se muestra como **Edición de folios de reservas**, en la sección API — Reservas de Permisos por Rol. Permite modificar tarifas, descuentos y noches de alojamiento; no equivale a autorización para anular cargos, cambiar cobros o emitir notas de crédito. Los controles fiscales y de disponibilidad siguen vigentes.

Las casillas controlan la herencia por rol independientemente de la visibilidad de Reservas. No hay panel individual ni excepciones desplegables. Se retiró el bloque de la cabecera. Las excepciones individuales antiguas quedan conservadas como datos históricos, pero ya no afectan este permiso; las rutas antiguas responden 410. Todos los integrantes del rol reciben el mismo resultado.

La migración toma una única vez una copia de los roles que ya tenían acceso heredado desde `sidebar:/reservations`, sin modificar las excepciones individuales. Registra el recurso en `resource_permission_seeds` dentro de la misma transacción, por lo que una revocación posterior no se revierte al reiniciar o migrar nuevamente. No asigna permisos a usuarios por nombre ni modifica perfiles.

Pruebas locales: casillas y despliegue de excepciones en interfaz; edición independiente del acceso al módulo; independencia frente a excepciones antiguas; migración repetida; regresión de precios por noche y bloqueos fiscales. Sin acceso a usuarios o datos del hotel.
