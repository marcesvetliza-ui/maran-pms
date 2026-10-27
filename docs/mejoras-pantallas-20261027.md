# Mejoras de pantallas operativas

Rama: `improve/operational-screens-20261027`. Implementación para revisión,
sin despliegue ni cambios en datos de producción.

| Punto solicitado | Resultado |
| --- | --- |
| Nueva reserva y editar reserva | Ventana adaptable hasta 1100 px; huésped y vínculos separados de estadía/tarifa; empresa/agencia desplegables; resumen en escritorio; encabezado y botones fuera del área desplazable. El formulario sigue usando sus validaciones y operaciones existentes. |
| Facturar/cerrar mesas | Consumos y resumen a la izquierda, cliente/comprobante/cobro a la derecha en escritorio; una columna en celular. Total y confirmación permanecen visibles. Se conservan descuentos, anticipos, cuenta dividida y reglas fiscales. |
| Aviso de Caja SPA | Aviso al inicio del formulario. Distingue consulta pendiente, error de consulta, ausencia de cajas y falta de selección entre varias cajas. Permite reconsultar y ofrece acceso a Caja sólo con permiso, en otra pestaña para conservar el formulario. Sigue permitiendo revisión sin cobrar. |
| IVA de artículos de compras | Toma la alícuota configurada del nuevo artículo, sin arrastrar la del anterior. Una corrección deliberada se conserva al seleccionar el mismo artículo. Cambiar de artículo restablece el control de edición. Valores no admitidos quedan señalados, sin asumir 21 %, exento o no gravado. Se mantiene la posibilidad de corregir la tasa para ese comprobante. |
| Condición IVA en SPA | El circuito actual ya consulta la ficha asociada de huésped/cliente SPA. Se refresca al abrir y al guardar cambios de la ficha. Una condición ausente muestra “No registrada”, abre los datos fiscales y explica qué completar; ya no se presenta Consumidor Final como si estuviera guardado al editar una ficha que no lo tiene. Se conserva la validación fiscal del servidor. |
| Grupo en checkout | Nombre principal con código secundario, tanto en tarjeta como en confirmación. No cambia la salida grupal sin cobro. |
| Detalle desde Planning | Reutiliza `ReservationDetailDialog`, con Datos/Folio/Historial y resumen de cuenta. Conserva check-in, advertencia de habitación sucia, motivo retroactivo, checkout, reversiones y acceso al grupo. Se retira el editor paralelo que quedó sin uso. |
| Cliente SPA y Empresa | Ventanas adaptables, campos distribuidos según ancho, secciones y botones persistentes. Se conservan identidad, domicilio, contacto, datos fiscales y condiciones comerciales. |
| Buscador de compras | Se escribe directamente por nombre o SKU; resultados con categoría, stock y costo registrado. Permite elegir con teclado y pasa el foco a cantidad. Conserva la exclusión de artículos ya elegidos en otros renglones. |
| Detalle del turno SPA | Ancho máximo de 760 px, distribución adaptable y acciones separadas del detalle desplazable. Conserva las acciones y sus estados originales. |
| Editar habitación | Formulario más amplio, campos en columnas, camajes permitidos mejor distribuidos y guardar/cancelar siempre visibles. El estado continúa sujeto al circuito de Housekeeping. |

El lanzador flotante de ayuda deja de tapar las acciones mientras estas ventanas
modales están abiertas. Las preferencias de apariencia y el diseño del folio
aprobado se conservan.

## Verificación

- Suite cliente completa: **152 archivos, 821 pruebas aprobadas**.
- Pruebas específicas: cambio y corrección de alícuota, valores no admitidos,
  búsqueda por teclado y foco; nombre de grupo; IVA guardado/ausente y permiso de
  Caja; acciones operativas de Planning, incluidos habitación sucia y motivo
  retroactivo.
- TypeScript y compilación de producción.
- Navegador Chromium con respuestas sintéticas: Reserva, Empresa, Cliente SPA,
  Habitación, cierre de Restaurant, detalle de Planning y detalle SPA en
  **1366×768, 1024×768 y 390×844**, con comprobación de límites y posición de
  acciones. También IVA guardado, aviso superior y revisión de comprobante SPA.
- Las comprobaciones de navegador bloquean toda escritura a API y fallan si
  detectan intentos de escritura o errores de ejecución.

No se consultaron fichas operativas ni se emitieron facturas/cobros reales. Si
una ficha real no tiene condición IVA, o no está vinculada de forma inequívoca,
requiere completarla/seleccionarla: no se reconstruye por coincidencia de nombre.

## Repetir la comprobación visual

Iniciar Vite local con `VITE_SPA_FUNDING_UI=true` y puerto 5194. Luego:

```sh
node script/check-operational-screen-layout.cjs
```

El script usa `@playwright/test`, requiere Chromium instalado y acepta
`PLAYWRIGHT_CHROMIUM_EXECUTABLE` para indicar su ejecutable. Sólo permite un
servidor local. `SCREEN_TEST_ORIGIN` cambia el origen local y `SCREENSHOT_DIR`
cambia la carpeta de capturas (por defecto `/tmp/maran-operational-screens`).
