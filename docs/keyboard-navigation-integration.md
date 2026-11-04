# Integración del paquete de teclado de Replit — 4 de noviembre de 2026

## Fuente y adaptación

Paquete recibido: `keyboard-navigation-review.zip`, base declarada
`e6a02ee91e080e5012f2337daaed3b09f0e40701`, checkpoint declarado
`97a572da411dc04c285699032ef9afd58ba6c896`. Se verificaron todas las sumas SHA256.
El informe original se conserva en `keyboard-navigation-audit.md`; sus resultados
son los del autor del paquete, no los de esta integración.

La integración se preparó por separado sobre Maran `65cf7886` y Xenia `9521fcd7`.
No se reemplazaron páginas completas. Se conservaron búsqueda de emisores,
restricciones de remitos, creación de proveedores desde ABM, cálculos de compras,
clasificación de ingredientes y configuración de Channex de cada destino.
La prueba nueva de compras apunta al siguiente campo real (razón social), porque
las ramas destino ya no tienen el botón de creación rápida del checkout de Replit.

Select y Command cierran al pulsar TAB sin elegir una opción resaltada;
Shift+TAB retrocede. Los calendarios conservan su navegación interna. Se agregan
flechas/Enter a buscadores propios, protección contra respuestas tardías y retorno
del foco. No hay interceptor global de TAB, cambios financieros ni migraciones.

Se conservaron los overrides de cuatro dependencias de Radix. El lockfile recibido
no eliminaba una copia anidada antigua de DismissableLayer dentro de Toast en estas
ramas; se retiró esa resolución obsoleta y se reinstaló. `npm ls` confirma las cuatro
versiones unificadas sin errores. No se modificaron las pruebas financieras.

## Validación independiente

- Maran: regresión completa de cliente/shared, 185 archivos y 1051 pruebas aprobadas.
- Después de la corrección final del lockfile: 51 pruebas específicas aprobadas,
  incluyendo los 29 casos de teclado, componentes compartidos y los archivos de
  Factura T/retenciones informados con fallos por Replit.
- Xenia: los 29 casos nuevos aprobaron. Suite completa con dependencias finales:
  1040 aprobadas y tres timeouts de 20000 ms en housekeeping-task-manager,
  planning-quick-reservation.charge-failure y group-detail. Repetidos esos tres
  archivos con los mismos límites: 33/33 aprobadas. La ejecución completa inicial
  conserva sus tres fallos; no se presenta como una ejecución completa verde.
- TypeScript: aprobado en ambos árboles.
- Compilación final con lockfile corregido: aprobada en ambos sistemas.
- Chromium Linux, con formularios reales y HTTP ficticio: transferencia (TAB,
  filas y cantidad), proveedor (texto, TAB y Enter), cliente (TAB, selección y
  quitar), diálogos (Escape de Select, TAB y foco anidado). Sin escrituras ni
  excepciones de página. La primera carga excedió 30 s; con caché preparada y
  espera DOMContentLoaded se completó. Se corrigió un selector ambiguo del script,
  sin cambiar componentes para hacer pasar la comprobación.
- `git diff --check`: aprobado.

## Límites

No certifica todos los formularios ni un iPad físico o Windows. Continúan pendientes
los recorridos integrales de cada módulo de la matriz original. La prueba del
navegador es aislada; no se realizaron cobros, facturación ni cambios de hotel.
Las advertencias de tamaño de compilación/Browserslist y PostCSS permanecen visibles.

Reproducción del navegador: ejecutar Vite con la configuración en
`scripts/keyboard-browser/vite.config.ts` y luego `node scripts/keyboard-browser/check.mjs`.
El ejecutable Chromium debe estar en `/usr/bin/chromium`; `KEYBOARD_TEST_URL` permite
usar otro puerto local. No iniciar este arnés como servicio de producción.
