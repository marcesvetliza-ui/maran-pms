# Recetas, inventario, compras y desayunos: revisión del 10/10/2026

Rama de implementación: `fix/inventory-recipes-workflows`, sobre `main` b3f6e1c6.
Estado: cambios preparados para revisión. Este trabajo no publicó ni modificó la base de producción.

## Seguimiento del informe

| Punto | Implementación | Revisión en demo |
| --- | --- | --- |
| 1. In house y Excel | Filtran check-in realizado, fecha de estadía y habitación física. Excel usa la fecha elegida. Se distinguen huéspedes declarados de personas identificadas. | Elegir fecha, comparar habitaciones y exportar; comprobar que no aparezcan check-ins vencidos. |
| 2. Artículo que ya no se compra pero tiene saldo | Nuevo estado **No comprar**, independiente de la baja. Permite consumir y trasladar el remanente, conserva el historial y se puede revertir. Compras bloquea el ingreso del artículo discontinuado. | Marcar un artículo con saldo, consumir una parte, comprobar saldo e historial y volver a habilitar compras. |
| 3. Depósitos vacíos | Filtro compartido para los contratos `is_active` e `isActive`, usado por producción, consumo, compras, traslados y ubicaciones. Producción y compras muestran carga, error o falta de depósitos activos. | Elegir depósito en compras, registrar producción y consumo interno. Un depósito inactivo no debe ofrecerse para operar. |
| 4. Borrado de elaboración base | Desactivación recuperable, conserva ingredientes. Bloquea referencias activas y producción pendiente; reactivación respeta dependencias. | Intentar desactivar una base usada por una receta activa; resolver la referencia y luego desactivar/reactivar. |
| 5. Reactivar platos | Filtros Activos/Inactivos/Todos y acción Activar. Antes de activar, valida categoría y elaboraciones de la receta. El artículo espejo se sincroniza. | Desactivar un plato, ubicarlo en Inactivos y recuperarlo. |
| 6. Categorías del menú | Desactivación recuperable. Una categoría con platos activos exige reasignarlos o desactivarlos primero. | Desactivar/reactivar y comprobar que los platos históricos conservan su categoría. |
| 7. Alta duplicada/confusa | El botón de elaboración limpia el formulario visible. Acciones de platos aparecen en su pestaña. Búsqueda en elaboraciones y preparaciones con stock. | Crear una elaboración y buscarla; revisar cada pestaña. |
| 8. Error posterior al alta | La respuesta de creación incluye ingredientes vacíos y el cliente tolera respuestas anteriores sin ese campo. | Crear una elaboración y agregar ingredientes sin error tras guardar. |
| 9. Unidades incompatibles | Recetas mantienen la unidad del artículo; preparaciones permiten su unidad o conversiones métricas conocidas (kg/g, litro/ml). | Café por kg: receta en kg con fracciones o preparación en g. Verificar cantidad y costo, no elegir unidades incompatibles. |
| 10. Café no aparece | Se explica la separación entre materia prima y preparación con stock. Selectores omiten elaboraciones inactivas. | Revisar ficha del café; confirmar que sea materia prima si es comprado sin elaboración. No reclasificar automáticamente un producto vinculado a una preparación. |
| 11. Desayunos con cifras diferentes | Dashboard, listado y carga diaria comparten el previsto. El dato real del servicio se guarda por separado y no se reemplaza al recalcular el previsto. | Comparar el previsto de mañana en las tres pantallas. Cargar un real diferente y volver a abrir el día. |
| 12. Costo de azúcar y proveedor IVA | Compra permite contenido variable por caja/paquete, guarda cantidades originales y convertidas y calcula costo de stock por sobre. IVA de proveedor no acepta blancos; fichas legadas incompletas se señalan. | Probar cajas de 24 y 120 sobres; revisar costo actual y equivalencias. Completar condiciones fiscales reales cuando falten. |

También se refuerzan altas manuales de inventario: nombre, unidad, grupo/subgrupo, proveedor para artículos comprados, ABC, IVA y límites coherentes. Las fichas históricas no se reclasifican automáticamente.

## Presentaciones y costos

- Azúcar: el usuario confirmó cajas de **24 a 120 sobres**, según presentación. El contenido se informa en cada renglón de compra; no se supone un único tamaño de caja para todo el artículo.
- Ejemplo: 2 cajas de 24 sobres a $240 por caja ingresan 48 sobres a $10 por sobre. Dos cajas de 120 a $1.200 ingresan 240 sobres al mismo costo unitario.
- La equivalencia permanente del artículo se conserva; el contenido puntual queda trazado mediante cantidad original, unidad de compra, cantidad convertida y unidad de stock del comprobante.
- Café: el usuario confirmó compra **por kilo**. Si stock está en kg, 8 g de receta equivalen a 0,008 kg. Las conversiones kg/g existentes continúan disponibles.
- Descuento general del comprobante no altera por sí mismo el costo individual del artículo; esta conducta existente se conserva.

## Datos que requieren revisión, no corrección automática

1. Ficha real del azúcar: unidad de stock, costo actualmente registrado y contenido de la presentación que originó ese costo. Saber que las cajas varían no permite deducir si el valor histórico corresponde a 24 o 120 sobres.
2. Ficha real del café: tipo de artículo, unidad y vínculo con una preparación. Comprar por kilo define la conversión, pero no confirma la clasificación actual.
3. Proveedores legados sin condición IVA: completar la condición fiscal real. No asignar una por defecto para ocultar el dato faltante.
4. Altas nuevas en áreas con subgrupos sin padre: completar esa relación antes de crear el artículo. Las fichas existentes siguen disponibles.

## Revisión y publicación

1. Revisar el cambio y ejecutar los casos de la tabla en el entorno de prueba.
2. Confirmar que el demo use su propia base y conserve los servicios del asistente. Este lote sale de `main`; no reemplazar la rama del asistente con él sin integrar previamente ambos trabajos.
3. Si el piloto del asistente exige igual revisión de código, desplegar PMS y asistente desde la misma revisión integrada.
4. Al aprobar los resultados, integrar en `main` y publicar. La migración agrega `recipes.is_active` y `inventory_items.purchase_enabled`, con valores iniciales activos; no borra filas ni reinicia saldos.
5. Comprobar tras publicar: depósitos, alta de elaboración, reactivación, una compra de prueba, previsión de desayunos y listado in house. Revisar datos reales de azúcar/café aparte.
6. Ante una regresión, volver al despliegue anterior conservando las columnas agregadas y los movimientos existentes; no borrar compras ni restaurar datos a ciegas.

## Validación técnica

Las comprobaciones se ejecutaron con datos sintéticos en PostgreSQL local, sin conexión a la base operativa.

- Batería completa del cliente: 115 archivos / 597 pruebas aprobadas. Después de los ajustes finales, se repitieron las pruebas de Compras y Producción y se agregaron dos casos para cajas variables, aprobados en ambos formularios.
- Batería completa del servidor: 91 archivos / 590 pruebas aprobadas.
- Batería completa con PostgreSQL: 120 archivos aprobados / 489 pruebas aprobadas. Se omitieron 6 archivos / 50 pruebas bajo sus condiciones existentes de ejecución; no se consideran verificados.
- TypeScript, compilación de cliente/servidor, controles de fechas y workflows: aprobados.
- Se corrigieron las simulaciones de permisos de cuatro pruebas previas de cobros grupales para que lleguen a ejecutar sus verificaciones reales. No se modifica la autenticación de la aplicación.
- Pruebas de migración adicionales verifican que repetir el agregado de columnas conserve cantidades y estados desactivados.

La validación local no sustituye la prueba con el catálogo y los procesos reales del hotel.
