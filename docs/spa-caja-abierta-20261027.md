# Caja SPA abierta no reconocida al cobrar

La pantalla de Caja usa el turno abierto del área. `cash_shifts.opened_by`
contiene el nombre descriptivo que se ingresó al abrir/tomar turno, no una
referencia al ID del usuario autenticado. El circuito nuevo comparaba ese campo
con `actor.id` en la lista de cajas, la preparación de cobros, los pagos de
cuenta y el voucher. Un turno abierto por nombre quedaba excluido.

La corrección centraliza la consulta y validación del turno SPA abierto. La
autorización sigue dependiendo de los permisos de la sesión; el nombre de
apertura no concede permisos. Los movimientos de Caja y folio conservan el ID
autenticado de quien cobra. Se valida área SPA y estado abierto en servidor,
con bloqueo de fila al registrar dinero. El adaptador vuelve a validar dentro
de la operación financiera; no se habilitan cajas cerradas ni de otras áreas.

No requiere migraciones, renombrar operadores ni cerrar y volver a abrir la
caja. El formulario reconsulta las cajas al regresar y conserva la acción
manual de volver a consultar. El aviso de datos fiscales ausentes permanece:
es independiente del estado de Caja y no se completa por suposición.

Validación con PostgreSQL aislado: los turnos de prueba usan nombres humanos
distintos del ID del cobrador. Se comprueban listado, pagos, voucher y factura,
permisos, importes, reintentos, cierre atómico y ausencia de cobros duplicados.
La prueba nueva verifica que pagar y emitir voucher registran al cobrador sin
reescribir el nombre de apertura, y que cerrar el turno lo elimina del listado.
También se comprueba el circuito completo en navegador con servidor y base
sintéticos, sin ARCA ni Caja operativa.
