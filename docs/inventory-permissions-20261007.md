# Permisos de Inventario aprobados el 7/10/2026

| Rol | Consultar | Catálogo y depósitos | Operar | Ajustar y anular | Costos |
| --- | --- | --- | --- | --- | --- |
| admin, manager, resp_deposito, resp_administracion | Sí | Sí | Sí | Sí | Sí |
| restaurant | Sí | No | Sí | No | No |
| spa, ama_de_llaves, responsable_area | Sí | No | No | No | No |
| Otros | No | No | No | No | No |

Claves: `api:inventory:read`, `catalog`, `operate`, `adjust`, `cost` (mismo prefijo).
El permiso anterior `api:inventory:write` permanece para compatibilidad del catálogo de administración, pero ya no autoriza estas rutas.

Catálogo incluye artículos, equivalencias, categorías, marcas y depósitos. Operar incluye movimientos normales, transferencias, consumos internos, reintentos de pendientes, producción y borradores de conteo. Ajustar incluye movimientos de ajuste, correcciones, anulaciones, reversión de documentos completos y cierre de conteos.

Los costos se retiran de respuestas de Inventario y producción, incluyendo objetos y snapshots anidados, para usuarios sin permiso de costos. Historial de precios y escrituras explícitas de costos requieren ese permiso. Las exportaciones locales parten de las respuestas filtradas. Ventas, cobros y descuentos automáticos conservan su circuito: no dependen del permiso humano para modificar stock manualmente.

Los permisos nuevos se inicializan mediante la migración existente que siembra cada clave una vez. La habilitación de Restaurant en el menú tiene su propia marca de migración, aplicada una sola vez. Las revocaciones posteriores no se reintegran en cada arranque. Administración de permisos sigue reservada a admin.

No hay cambios a saldos, movimientos históricos ni clasificaciones. Conteos y conciliación siguen postergados para la carga de stock real.
