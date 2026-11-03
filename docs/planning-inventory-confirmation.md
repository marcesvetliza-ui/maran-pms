# Confirmación coherente de inventario desde Planning

Incidente 504: el precontrol HTTP ofrecía confirmar cualquier déficit agregado
cuando había una habitación seleccionada, pero no transmitía esa confirmación
al guardado transaccional. Este repetía una validación más estricta y rechazaba
la reserva; Planning reemplazaba el motivo con una sugerencia genérica.

La evaluación compartida distingue un déficit agregado confirmable de cupos
firmes de grupos pendientes de asignar. Solo una habitación física operativa,
con categoría coincidente y sin superposición, puede confirmar el primer caso.
Se revisan todas las noches antes de ofrecer confirmación. Un compromiso firme
en cualquier noche mantiene el bloqueo incluso con aceptación del usuario.

La ruta transmite al almacenamiento el contexto de grupo y la aceptación como
campos internos que se eliminan antes de guardar. Create y update revalidan la
habitación y el inventario bajo el bloqueo de mutaciones. La aceptación nunca
omite el control de superposición física. Los importadores sin confirmación
explícita mantienen las restricciones.

Planning muestra el motivo real del fallo conservando el formulario. La nueva
explicación de cupos confirmados muestra cantidad y fecha del compromiso.

No se creó la reserva de la 504, ni se modificaron cupos o reservas del hotel.
Esta corrección no demuestra que el conteo 29/28 sea correcto: el desglose de
los datos operativos requiere una consulta específica de lectura.

Validación local: 2 casos PostgreSQL descartable, 16 pruebas HTTP/grupos y 25
pruebas de política/interfaz. Incluyen confirmación, guardado único, colisión
física y protección de grupos confirmados en noches posteriores.
