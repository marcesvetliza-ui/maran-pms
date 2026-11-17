# Revisión del cierre impreso

Este arnés usa `printClosingSummary` real, sin sesión ni servidor de producción. Captura el HTML de la ventana de impresión para generar un PDF en Chromium.

1. Levantar `npx vite --config scripts/cash-closing-browser/vite.config.ts`.
2. Ejecutar `node scripts/cash-closing-browser/verify.mjs` para la prueba sintética de paginado, columnas, totales históricos y descripción extensa.
3. Para revisar un cierre proporcionado localmente: `node scripts/cash-closing-browser/render.mjs /ruta/privada/datos.json /ruta/privada/salida`.

El JSON recibe `{shift, movements, systemCash, countedCash, snapshot?}`, con los datos que usa la función de impresión. Los cierres reales y las salidas no se incorporan al repositorio. `generated-artifacts/` está ignorado.

La propuesta compacta conserva la fuente de los totales de cierre y los movimientos. La identificación elimina códigos de reserva de los rótulos reconocidos y conserva el apellido cuando el sistema informa «Apellido, Nombre». Los nombres sin esa separación y los conceptos libres se conservan completos. El comprobante, la habitación, el medio y el importe siguen visibles; informativos y anulados aparecen una vez y separados del dinero.
