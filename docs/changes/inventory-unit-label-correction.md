# Corrección excepcional de unidad mal rotulada

Caso autorizado: las cantidades y costos existentes ya representan la unidad correcta; sólo estaba mal su etiqueta. No es una conversión de envases ni una migración numérica.

En Inventario, la acción independiente «Corregir unidad» permite revisar la nueva unidad, cantidades, costo (si el usuario ya puede verlo), depósitos y referencias. Exige motivo, confirmación expresa y una vista previa vigente. Cambiar cantidades o referencias entre vista previa y confirmación obliga a revisar nuevamente.

La operación atómica actualiza el artículo y las etiquetas coincidentes de ingredientes de recetas, referencias a elaboraciones producidas, unidad de producción de fórmulas vinculadas, insumos SPA, conteos abiertos y consumos pendientes. Conserva todos los números, mínimos y costos. No crea movimientos de stock ni reescribe comprobantes, conteos cerrados o corridas históricas. Registra usuario, motivo, unidad anterior/nueva y estado previo de las referencias en auditoría.

Las equivalencias existentes se conservan y se validan contra la unidad nueva. Si resultarían incompatibles o alterarían otra conversión, bloquea la corrección con una explicación. Las producciones pendientes vinculadas deben resolverse antes: modificar sus fórmulas invalidaría la recuperación de esos intentos. Las referencias bloqueadas por otra operación devuelven un conflicto legible.

Permisos: administradores activos y usuarios con el flag individual `canCorrectInventoryUnit`. Este flag es administrable en Usuarios y se comprueba por ID de usuario en la base en cada operación; no se concede a un rol completo ni se autoriza por el nombre recibido en una petición. La migración de la columna concede inicialmente el flag a una sola cuenta activa existente cuyo nombre completo normalizado sea exactamente Gonzalo Villanueva, según la autorización del usuario. Si no hay coincidencia única, no concede nada: un administrador debe seleccionar la cuenta y activar el permiso. La concesión inicial queda auditada. Reiniciar o renombrar una cuenta no vuelve a conceder permisos revocados.

La edición común sigue bloqueando cambios de unidad con referencias/historial. El nuevo permiso no amplía acceso a costos ni otros permisos de catálogo.

Verificación: PostgreSQL descartable con corrección por administrador y operador individual, denegación/revocación, concesión inicial única/ambigua, valores e historia conservados, referencias vigentes, conflictos, API real y visibilidad de costos; pruebas del formulario con vista previa/motivo/confirmación y errores legibles. Sin modificación de datos operativos.

Resultado de verificación del parche: 53 pruebas aprobadas (23 PostgreSQL, 27 de permisos/historial/validación y 3 del formulario); TypeScript global, compilación y diff correctos. No se probó contra la cuenta operativa real de Gonzalo ni se corrigieron artículos operativos. Su asignación efectiva depende de la coincidencia única al desplegar o de la selección explícita en Usuarios.
