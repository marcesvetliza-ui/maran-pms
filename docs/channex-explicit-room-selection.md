# Selección de habitaciones físicas para Channex

Los mapeos conservan la categoría del PMS y admiten `roomIds`: `null` incluye toda la categoría dentro del alcance; un array no vacío incluye exclusivamente esas habitaciones. Cambiar este mapeo no cambia categorías, reservas ni tarifas generales del hotel.

Para la puesta en marcha de Maran, mantener piso 3, conexión, captura y recepción desactivadas hasta completar las revisiones. Configurar Premium hasta 4 con categoría Premium y habitación 301; Premium hasta 2 con categoría Premium y habitación 307. Guardar cada mapeo con su botón. Ejecutiva y Suite Panorámica pueden conservar la categoría completa dentro del piso 3. El inventario esperado es 3, 1, 1 y 2 habitaciones físicas respectivamente, antes de descontar reservas, mantenimiento y bloqueos.

El servidor serializa ediciones por conexión y rechaza solapamientos, arrays vacíos o repetidos, habitaciones inactivas, virtuales, de otra categoría o fuera del alcance. Captura y recepción deben estar pausadas para editar. La previsualización y los envíos verifican esos mismos conjuntos. La recepción solo busca candidatos dentro de las habitaciones elegidas y respeta ocupación, mantenimiento y reservas existentes. Si no hay lugar, queda para revisión en lugar de asignarse a otra Premium. Los bloques de grupo pendientes siguen descontándose conservadoramente en cada subconjunto de su categoría.

Las columnas nuevas son aditivas y los mapeos anteriores conservan modo de categoría completa. Los cambios de selección se registran en la cola existente cuando corresponde, sin habilitar envíos automáticamente. La configuración exige el permiso Channex de configuración; admin conserva acceso.

## Precios: pendiente antes de producción

La limitación inicial del precio escalar se resolvió con la adaptación documentada en [Precios por ocupación](channex-occupancy-prices.md). Obtener nuevamente el catálogo para registrar modalidad y opciones remotas. Se usan los importes por pax del plan de Maran y del calendario, con validación de positivos y de las ocupaciones requeridas; no se copian automáticamente los precios de Channex ni se extrapola un precio único.

La conexión real y los envíos siguen desactivados hasta completar la revisión de importes, continuidad de vigencias y puesta en marcha. Las pruebas con proveedores simulados no sustituyen la verificación remota.

## Verificación

Pruebas locales con PostgreSQL descartable: separación de inventario, rechazo de solapamientos, rollback, edición concurrente y asignación entrante limitada a la habitación elegida. Se ejercitan también las suites existentes de ARI, recepción y sincronización con proveedor simulado. Las pruebas de interfaz cubren selección explícita, cambio de categoría y guardado. Sin llamadas reales a Channex, reservas operativas ni cambios en credenciales.
