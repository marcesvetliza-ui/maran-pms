# Nombres y orden de sectores de restaurante

La rutina de inicio restablecía display_order de area1/area2 y sobrescribía nombre, capacidad y tipo de los sectores predeterminados. Ahora solo crea sectores faltantes, con valores iniciales. Los registros existentes conservan sus datos. No reconstruye cambios anteriores ya sobrescritos: deben volver a guardarse una vez.

Se incorpora displayOrder al esquema tipado, utilizando la columna que ya creaba refreshRealData. La migración asegura su existencia antes del seed en instalaciones nuevas. GET areas consulta orden explícito (displayOrder, id como desempate) y el plano respeta el mismo orden que el selector.

Configurar sectores permite editar nombres y moverlos arriba/abajo. Guardar sectores envía una sola solicitud; la transacción guarda toda la configuración o revierte todo. Permiso: api:restaurant:edit-layout. Se verifica la lista activa y el nombre/orden originales para evitar sobrescribir una edición concurrente. Reintentos del mismo resultado son idempotentes. Los errores mantienen la edición abierta. La acción previa de renombrar sectores muestra errores de guardado.

No modifica posiciones, estados, números ni asignaciones de mesas. El cambio de layout anterior conserva sus controles.

Validación: UI con cambio de nombre, reordenamiento, fallo/reintento y reapertura; PostgreSQL con guardado, lectura nueva, dos refreshRealData reales, idempotencia, permiso, nombres vacíos, conflicto y rollback. Regresión de layout de mesas.
