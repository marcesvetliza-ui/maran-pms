# Preparación de inicio real de Inventario

Decisión del usuario: empezar con artículos y recetas nuevos. No se ejecutó un reinicio de datos. El usuario indicó después que no se debe agregar ni cambiar el funcionamiento de recetas, platos o tratamientos; su revisión queda para el módulo específico. No se reinicia ninguno de esos módulos en esta entrega.

## Clasificación y pantallas

La migración agrega una sola vez los niveles faltantes del catálogo físico acordado. Reutiliza nombres equivalentes (ignorando acentos y mayúsculas) dentro de la misma área y padre; no modifica artículos, saldos o vínculos. Repetirla no recrea niveles eliminados por el usuario. Si encuentra duplicados activos ambiguos, revierte la operación y lo informa en los logs para resolverlos; no bloquea el arranque del hotel.

Housekeeping mantiene clasificación por sector de uso y su depósito compartido. Cada agrupamiento sin subdivisión expresa usa General como subagrupamiento. Vajilla y Descartables tiene dos subagrupamientos. Personal externo pertenece a gastos, no Inventario. Marketing conserva su clave y se muestra como Comunicación.

- Artículos físicos: Inventario; área, agrupamiento, subagrupamiento, tipo y unidad base.
- Platos del menú: Recetas y Costos; precios y clasificación de venta, ingredientes vinculados a Inventario. Los espejos internos de tipo plato se conservan como parte del funcionamiento y no se cuentan como existencias físicas.
- Tratamientos: SPA → Tratamientos; insumos por tratamiento vinculados a Inventario.
- Bebidas de venta directa: un artículo físico; su vínculo de venta no crea una segunda existencia.
- Elaboraciones virtuales: recetas base; se expanden a ingredientes. Elaboraciones almacenadas: artículo de salida y producción registrada.

Los catálogos de menú y SPA ya tienen su administración separada. No se borraron ni renombraron las categorías de venta existentes.

## Preparar listado

Usar docs/templates/stock-inicial.csv o Descargar plantilla inicial en Inventario. Una fila por artículo y depósito. Artículo, unidad, cantidad y depósito son indispensables; la clasificación completa permite crear el catálogo nuevo. Repetir un artículo en dos depósitos distribuye cantidades, no crea dos artículos. SKU se asigna al crear; no reutilizar IDs viejos.

La plantilla no es un importador. Antes de una carga masiva se debe validar el listado, resolver unidades y duplicados, y preparar una importación con vista previa e identificador de lote para impedir un segundo ingreso. No cargar este archivo en una función que no admita importación.

Tipo físico: Materia prima, Venta directa o Activo fijo. Los semielaborados almacenados se vinculan mediante la producción existente. No incluir platos ni tratamientos en el listado de existencias.

Cantidad inicial expresada en unidad de stock, máximo tres decimales. Caja de 12 unidades: cantidad en unidades o conversión explícita; nunca sumar cajas y unidades sin convertir. Configurar equivalencias una sola vez por artículo. Los mínimos son por ubicación.

Para consumos automáticos sigue vigente el último destino de transferencia. Las entradas iniciales directas no establecen ese destino: planificar recepción y transferencia reales, o acordar una función explícita de origen inicial antes del primer consumo. No inventar transferencias desde un depósito sin existencias.

## Informe de alcance sin cambios

Con una conexión autorizada a la base que se quiere revisar, ejecutar `npx tsx script/review-inventory-fresh-start.ts --output /tmp/inventory-fresh-start-review.json`. Usa una transacción de solo lectura; genera IDs, cantidades por ubicación, pendientes y vínculos, fecha de corte y una huella del alcance. No anula consumos ni archiva artículos o recetas. Comprobar nuevamente el alcance antes de cualquier aplicación futura.

## Reinicio propuesto para revisión (no ejecutado)

1. Respaldar la base publicada y comprobar restauración en una base separada. Obtener listado e IDs actuales, no usar un respaldo viejo como selección del reinicio.
2. Pausar movimientos de Inventario y consumos automáticos durante el corte; impedir nuevas operaciones concurrentes mientras se limpia.
3. Separar artículos físicos y referencias internas de platos. Proponer archivo de los artículos físicos de prueba conservando sus IDs e historial; crear después artículos nuevos con stock cero. No borrar compras, reservas, cobros, cajas, órdenes ni turnos.
4. Resolver las recetas viejas antes de publicar las nuevas: el esquema actual no tiene estado de archivo para recetas. No eliminarlas sin tratar referencias desde subrecetas, producción y demás documentos. Preparar una operación de archivo o desvinculación compatible, con snapshots y auditoría, y probarla en copia.
5. Anular únicamente los consumos pendientes seleccionados hasta el corte, conservar sus IDs y estado terminal para evitar reintentos. Los consumos ya completados mantienen su registro. Revisar operaciones aún abiertas que podrían generar consumos nuevos con artículos antiguos.
6. Retirar saldos globales y por depósito de los artículos físicos archivados mediante ajustes de cierre auditados (no borrar movimientos). Deshabilitar sus políticas de reposición. Mantener totales globales y por depósito consistentes; saldos antiguos sin ubicación requieren resolución explícita en el corte.
7. Tratar referencias de platos de venta directa, recetas e insumos SPA a artículos archivados; preservar nombres/precios solo si el usuario elige mantener ese catálogo. Un tratamiento sin insumos no debe presentarse como validado para consumir stock hasta configurarlos.
8. Crear el catálogo nuevo, cargar un lote inicial una sola vez y comparar totales por artículo y depósito. Verificar que no sobrevivan pendientes seleccionados y que los nuevos consumos usen artículos nuevos.
9. Registrar alcance, actor, fecha, conteos y resultado. Ejecutar el reinicio solamente después de mostrar el plan concreto y confirmar alcance.

No usar TRUNCATE ni borrar registros comerciales para empezar con existencias nuevas. Esta propuesta necesita implementación y validación adicional antes de ejecutar un corte en producción.
