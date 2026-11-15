# Edición de folios de reservas en la matriz

El permiso `reservations:edit-accommodation` se muestra como **Edición de folios de reservas**, en la sección API — Reservas de Permisos por Rol. Permite modificar tarifas, descuentos y noches de alojamiento; no equivale a autorización para anular cargos, cambiar cobros o emitir notas de crédito. Los controles fiscales y de disponibilidad siguen vigentes.

Las casillas controlan la herencia por rol independientemente de la visibilidad de Reservas. No hay panel individual ni excepciones desplegables. Se retiró el bloque de la cabecera. Las excepciones individuales antiguas quedan conservadas como datos históricos, pero ya no afectan este permiso; las rutas antiguas responden 410. Todos los integrantes del rol reciben el mismo resultado.

La migración toma una única vez una copia de los roles que ya tenían acceso heredado desde `sidebar:/reservations`, sin modificar las excepciones individuales. Registra el recurso en `resource_permission_seeds` dentro de la misma transacción, por lo que una revocación posterior no se revierte al reiniciar o migrar nuevamente. No asigna permisos a usuarios por nombre ni modifica perfiles.

## Criterio de producto: corrección de cargos

Confirmado por el responsable del hotel el 15/11/2026: **todos los cargos deben poder editarse o anularse desde Recepción; el objetivo es permitirle resolver errores y continuar la operación.** Aplica también a recargos automáticos de Early Check-in y Late Check-out, cargos repetitivos, consumos de Restaurant/SPA y cargos transferidos.

El circuito de corrección debe resolver el estado del cargo:

- Un cargo sin cobertura fiscal se corrige o anula con motivo e historial, actualizando su efecto en el folio.
- Si ya está facturado, la acción debe conducir al ajuste fiscal correspondiente y a su conciliación. No debe terminar solamente en un botón deshabilitado o un rechazo sin una vía para resolverlo.
- Los cobros reales, Caja y las ventas del área de origen conservan su identidad. Editar o anular el cargo de habitación no equivale por sí solo a devolver dinero ni a cancelar la prestación original.
- Un cargo antiguo sin movimiento vinculado debe poder recuperar su vínculo cuando el origen se verifica de forma inequívoca. Si los registros son ambiguos, la interfaz debe explicar qué requiere corrección para continuar.
- Deben quedar registrados el motivo, el operador y los valores anteriores y posteriores. Los reintentos no deben repetir anulaciones ni ajustes.

Esta es la regla para las correcciones actuales y los próximos trabajos. No implica que todos los circuitos anteriores ya la cumplan. El arreglo de los recargos históricos conecta «Anular cargo» con el procedimiento seguro existente; no sustituye el circuito fiscal de los cargos ya facturados.

Pruebas locales: casillas y despliegue de excepciones en interfaz; edición independiente del acceso al módulo; independencia frente a excepciones antiguas; migración repetida; regresión de precios por noche y bloqueos fiscales. Sin acceso a usuarios o datos del hotel.
