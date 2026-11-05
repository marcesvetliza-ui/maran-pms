# Detalle de caja ampliado — revisión Replit

Cambio de presentación en `HistorialTab` de `client/src/pages/cash-register.tsx`: modal hasta 1700 px, 95% del ancho en escritorio y 92% de la altura; encabezado fijo y cuerpo desplazable. Totales adaptables y tablas con desplazamiento horizontal propio cuando no caben.

Se conservan los historiales de anulaciones de SPA/recepción y, donde existe, rectificaciones de tarjetas. No se modifican consultas, cálculos, permisos, movimientos ni impresión.

## Prueba visual aislada

No iniciar el servidor del PMS. El fixture intercepta fetch, devuelve datos ficticios y rechaza escrituras y lecturas desconocidas.

```sh
CASH_REVIEW_BASELINE=<commit-anterior> npx vite --config scripts/cash-detail-browser/vite.config.ts
REPLIT_PLAYWRIGHT_CHROMIUM_EXECUTABLE=/usr/bin/chromium node scripts/cash-detail-browser/verify.mjs
```

El servidor escucha solo localhost. No ejecutar `npm run build` simultáneamente: la compilación limpia la caché de dependencias compartida de Vite.

Verifica cuatro resoluciones (1920×1080, 1366×768, 768×1024, 390×844), turnos abiertos/cerrados de cuatro áreas, foco, TAB/Shift+TAB, Escape, cierre/reapertura, importes grandes y textos largos. Evidencias locales en `generated-artifacts/cash-detail-review/evidence`.

También se ejecutan TypeScript, compilación y las pruebas existentes de desglose de caja, liquidaciones informativas y reparación de turnos; en Maran se incluye rectificación de tarjetas. No acredita pruebas en iPad/Safari físico ni Windows real.
