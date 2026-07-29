# Respuesta al Informe: Requerimientos Funcionales para Sistema de Gestión Gastronómica
**Autor del informe:** Juan Matías Colobig — Dpto. AA&BB — Julio 2026  
**Documento de respuesta:** Estado de implementación en Maran PMS — Julio 2026

---

## Estado General

El informe identifica 7 módulos funcionales + 1 bloque de KPIs.  
A continuación se detalla el estado de cada uno, con el nivel de implementación actual.

---

## 1. Integración con el Sistema Administrativo

> *"Toda factura de compra registrada debe impactar automáticamente en: Stock, Costos, Cuentas Corrientes, Contabilidad, Información Financiera."*

| Integración | Estado |
|---|---|
| Factura de compra → Stock (ingreso automático) | ✅ Implementado |
| Factura de compra → Costos (actualiza precio del artículo) | ✅ Implementado |
| Factura de compra → Contabilidad (asiento automático) | ✅ Implementado |
| Factura de compra → Cuentas Corrientes de proveedores | ✅ Implementado |
| Sistema integral (nativo, mismo sistema) | ✅ Implementado — el módulo contable, inventario, cuentas corrientes y compras conviven en el mismo sistema |

**El flujo es:** Módulo "Facturas de Compra" → registra el comprobante contable + genera el asiento + actualiza la cuenta corriente del proveedor + carga el stock de los artículos indicados en el Paso 5.

---

## 2.1 Maestro de Insumos y Productos

> *"El maestro constituye la base de toda la operación."*

| Campo solicitado | Estado | Observación |
|---|---|---|
| Código (SKU) | ✅ Implementado | Se genera automáticamente según el área (ej: RST-0042, SPA-0001) |
| Descripción / Nombre | ✅ Implementado | |
| Familia / Categoría | ✅ Implementado | Categorías con área (Restaurante, SPA, General, etc.) |
| Proveedor habitual | ✅ Implementado | Selector de proveedor en el artículo |
| Unidad de compra | ✅ Implementado | Unidad, Kg, g, Litro, ml, Caja, Paquete, Docena |
| Unidad de uso | ⚠️ Parcial | Solo hay una unidad por artículo. Sin factor de conversión automático entre compra y uso. Se puede trabajar con la unidad de uso directamente |
| Factor de conversión | ❌ No implementado | Si se compra por caja y se usa por unidad, la conversión hay que hacerla manual al cargar la factura |
| Precio de compra / Costo unitario | ✅ Implementado | Se actualiza automáticamente al cargar facturas de compra |
| IVA por artículo | ❌ No implementado | El IVA se registra a nivel del comprobante de compra, no en la ficha del artículo |
| Stock mínimo | ✅ Implementado | Genera alertas en el módulo de inventario |
| Tipo de artículo (Materia Prima / Venta Directa) | ✅ Implementado | |
| Historial de precios | ✅ Implementado | Se puede ver la evolución del costo unitario por artículo |

**Pendiente prioritario:** Factor de conversión unidad de compra → unidad de uso.

---

## 2.2 Recetas Estandarizadas

> *"Cada plato debe encontrarse completamente parametrizado."*

| Campo solicitado | Estado | Observación |
|---|---|---|
| Ingredientes con cantidad | ✅ Implementado | |
| Gramajes | ✅ Implementado | La cantidad es el gramaje (se ingresa en la unidad del artículo) |
| Mermas | ❌ No implementado | No hay campo de merma porcentual por ingrediente |
| Rendimiento de la receta | ✅ Implementado | En elaboraciones base hay yield/rendimiento |
| Costo de producción | ✅ Implementado | Se calcula automáticamente sumando costo × cantidad de cada ingrediente |
| Costo por porción | ✅ Implementado | |
| Food Cost % | ✅ Implementado | Costo / Precio de venta |
| Precio sugerido | ⚠️ Visible | El precio está en el menú pero no hay un "precio sugerido por margen objetivo" |
| Margen Bruto | ⚠️ Parcial | Se puede calcular del Food Cost pero no se muestra explícitamente como Margen Bruto |

**Pendiente:** Campo de merma por ingrediente (ej: tomate 15% de merma → la receta usa 115g por cada 100g netos).

---

## 2.3 Recetas de Producción Intermedias (Elaboraciones Base)

> *"Salsa filetto, fondo oscuro, masa de pizza, caldos... Permite calcular el Consumo Teórico."*

| Requerimiento | Estado | Observación |
|---|---|---|
| Producciones intermedias con sus ingredientes | ✅ Implementado | Tab "Elaboraciones Base" en Recetas & Costos |
| Rendimiento (yield) de la elaboración | ✅ Implementado | Campo "producción total" (ej: 1000 ml) |
| Costo de la elaboración | ✅ Implementado | Calculado automáticamente |
| Asociar elaboración como ingrediente de otra receta | ✅ Implementado | Al cargar ingredientes se puede seleccionar "Elaboración Base" |
| Deducción recursiva de stock al vender | ✅ Implementado | Al cerrar una orden, se descuenta en cascada: plato → elaboración → materia prima |
| Consumo Teórico automático | ✅ Implementado | El sistema calcula cuánto debería haberse consumido según las ventas |
| Comparativo Teórico vs Real | ⚠️ Parcial | Hay un reporte de consumos, pero **no hay un dashboard de desvíos** que muestre la diferencia en unidades, porcentaje e impacto económico |

---

## 2.4 Inventarios

> *"El sistema debe administrar inventarios por sectores o depósitos."*

| Requerimiento | Estado | Observación |
|---|---|---|
| Múltiples depósitos (Central, Cocina, Bar, Eventos, etc.) | ✅ Implementado | ABM de depósitos en el módulo Inventario |
| Transferencias entre depósitos | ✅ Implementado | |
| Ajustes de stock | ⚠️ Solo vía compras | Las entradas/salidas manuales fueron eliminadas intencionalmente. Los ajustes deben hacerse vía comprobantes |
| Trazabilidad (historial de movimientos) | ✅ Implementado | Pestaña "Movimientos" con historial completo |
| Inventarios parciales (por depósito) | ⚠️ No implementado | No hay un proceso formal de "toma de inventario" donde se ingresa el stock real contado |
| Inventarios generales | ⚠️ No implementado | Ídem |
| Fórmula: Stock Inicial + Compras − Stock Final = Consumo | ⚠️ Parcial | Se pueden obtener los datos pero no hay una pantalla que calcule la fórmula automáticamente |
| Consumo Teórico vs Consumo Real con desvíos | ⚠️ Pendiente | Es una de las funcionalidades más importantes del informe — no implementada como módulo |
| Ranking de mayores desvíos | ❌ No implementado | |
| Impacto económico de los desvíos | ❌ No implementado | |

**Pendiente prioritario:** Módulo de Toma de Inventario (ingreso de stock real contado) + Reporte de Desvíos (Teórico vs Real).

---

## 2.5 Gestión de Bajas

| Tipo de baja | Estado | Observación |
|---|---|---|
| Ventas → descuento automático de stock | ✅ Implementado | Al cerrar una orden del restaurante se descuenta el stock según las recetas |
| Mermas (en recetas) | ❌ No implementado | Mencionado en el punto 2.2 |
| Desperdicios (registro para análisis) | ❌ No implementado | No hay un formulario para registrar un desperdicio puntual |
| Desayunos (consumo diario) | ❌ No implementado | No hay módulo de consumo de desayunos |
| Eventos → descarga automática de insumos | ⚠️ Parcial | El módulo de Eventos existe pero no tiene deducción automática de stock al cerrar un evento |

**Pendiente:** Módulo de desperdicios y mermas. La baja por eventos.

---

## 2.6 Estadísticas de Ventas

| Estadística | Estado | Observación |
|---|---|---|
| Platos vendidos (ranking) | ✅ Implementado | Reporte de consumos muestra artículos con cantidad total |
| Ticket promedio | ⚠️ Parcial | Hay datos en el módulo restaurante pero no como KPI consolidado |
| Cantidad de cubiertos | ⚠️ Parcial | Se registran en las órdenes |
| Venta por horario | ❌ No implementado | |
| Venta por día | ⚠️ Parcial | Hay reportes con filtro de fecha |
| Venta por mesa | ❌ No implementado | |
| Venta por mozo | ❌ No implementado | No hay asignación de mozo por orden |
| Costo por ticket + Margen Bruto en cada orden | ❌ No implementado | |

---

## 2.7 Food Cost y Beverage Cost

| Requerimiento | Estado | Observación |
|---|---|---|
| Food Cost por plato | ✅ Implementado | En la ficha de cada receta |
| Food Cost global (%) del período | ❌ No implementado | No hay KPI de Food Cost del mes/semana |
| Beverage Cost | ❌ No implementado | No se diferencia bebida de comida en los reportes |
| Por familia / categoría | ❌ No implementado | |
| Por sector (Restaurante, Bar, Eventos) | ❌ No implementado | |

---

## 3. KPIs / Dashboard

| Indicador | Estado |
|---|---|
| **Costos:** Food Cost %, Beverage Cost %, Costo de Ventas | ❌ No como dashboard |
| **Comerciales:** Ticket Promedio, Cubiertos, Ocupación | ⚠️ Datos disponibles, sin dashboard |
| **Inventario:** Rotación de Stock, Días de Inventario, Diferencias, Desvíos | ❌ No implementado |
| **Económicos:** Utilidad Bruta, Utilidad Operativa | ❌ No implementado |

---

## Resumen de lo Implementado — Cambios Concretos Realizados

### Fase 1 — Maestro de Insumos (Módulo Inventario Base)
- ABM completo de artículos: SKU automático, categoría, proveedor, unidad, costo, stock mínimo, tipo
- Alertas de stock bajo
- Historial de precios por artículo
- Depósitos (warehouses): ABM, transferencias entre depósitos, stock por depósito

### Fase 2 — Recetas Estandarizadas
- Módulo Recetas & Costos: ingredientes, cantidades, costo calculado, Food Cost %
- Asociación plato ↔ receta para deducción automática de stock

### Fase 3 — Integración Ventas → Stock
- Al cerrar una orden del restaurante se deduce stock según las recetas configuradas
- Si no hay receta: descuenta el artículo directamente (venta directa)

### Fase 4 — Facturas de Compra → Stock
- Módulo de Facturas de Compra (contable)
- Paso 5: permite asignar artículos de inventario a los renglones de la factura
- Entrada de stock automática al guardar el comprobante
- Actualiza el costo unitario del artículo

### Fase 5 — Reporte de Consumos
- Reporte "Consumos" con filtro de fechas
- Muestra por artículo: unidades consumidas, costo total, cantidad de órdenes

### Fase 6 — Elaboraciones Base (Sub-recetas / Producción Intermedia)
- Tab "Elaboraciones Base" en Recetas & Costos
- Cada elaboración tiene sus ingredientes, rendimiento total y costo
- Una receta de plato puede usar una elaboración como ingrediente
- Al cerrar orden: deducción recursiva (plato → elaboración → materias primas)

### Fase 7 — Eliminación de entrada/salida manual
- Se eliminaron los botones "Registrar Entrada" y "Registrar Salida" del módulo Inventario
- El stock solo se mueve por: facturas de compra, cierre de órdenes, transferencias entre depósitos
- Esto garantiza que todos los movimientos tengan respaldo contable

### Cambios de esta sesión (hoy)
- **"Nuevo Artículo"** simplificado: ya no tiene "Stock Inicial" ni "Depósito destino". Se crea el artículo sin stock; el stock entra por comprobantes de compra
- **Facturas de Compra — Paso 5 — modo "Artículo nuevo"**: se agregaron los campos Tipo de artículo (Materia Prima / Venta Directa) y Stock mínimo, igualando las opciones del formulario de Nuevo Artículo

---

## Pendientes (por orden de prioridad sugerida)

| # | Funcionalidad | Impacto | Complejidad |
|---|---|---|---|
| P1 | **Módulo de Toma de Inventario** — ingresar stock real contado para calcular fórmula Stock Ini + Compras − Stock Final | Muy alto | Media |
| P2 | **Reporte de Desvíos** — Consumo Teórico vs Consumo Real, diferencia en unidades y $ | Muy alto | Media |
| P3 | **Mermas en recetas** — porcentaje de merma por ingrediente | Alto | Baja |
| P4 | **Desperdicios** — registro de bajas puntuales con motivo y artículo | Alto | Baja |
| P5 | **Dashboard de KPIs** — Food Cost %, Ticket Promedio, Cubiertos del período | Alto | Media |
| P6 | **Venta por mozo** — asignación de usuario/mozo a cada orden | Medio | Media |
| P7 | **Factor de conversión** — comprar por caja, usar por unidad | Medio | Media-Alta |
| P8 | **Descarga automática de stock en Eventos** | Medio | Media |
| P9 | **Food Cost por período / por categoría** (no solo por plato) | Medio | Baja |
| P10 | **Registro de consumo de Desayunos** | Bajo-Medio | Baja |

---

## Nota sobre Exportación a Excel

> *"Preferentemente que toda la información solicitada al sistema sea transportable a Excel."*

El sistema actualmente genera PDFs para varios reportes. La exportación a Excel/CSV no está implementada en el módulo de Inventario ni en Reportes. Es una mejora transversal a evaluar.

---

*Documento generado: Julio 2026 — Maran PMS*
