# Correcciones a la revisión de Codex

Evidencia leída: `review/folio-funding`, commit `14f6c890`,
`docs/folio-funding-codex-review.md` y `script/review-funding-edge-cases.ts`.
No se incorpora ni ejecuta ninguna dependencia operativa.

## R1 — Centavos de NC

Se reprodujeron los dos defectos antes de corregir: `DOCUMENT_CAPACITY` con
tres aplicaciones y liberación de 10.002 centavos para una NC de 10.001.

La distribución usa cocientes enteros y mayores restos sobre **cobertura vigente**,
incluyendo restauraciones explícitas y excluyendo aplicaciones reversadas.
Los empates se resuelven por receipt ID (orden C) y application ID. Se usa BigInt
para evitar pérdida de precisión en los productos. La suma liberada es exactamente
la NC y cada liberación está acotada por su aplicación vigente. No se infiere
qué servicio pagó cada receipt.

Si falta cobertura suficiente, se rechaza toda la conciliación con el código
ya existente `NC_RECONCILIATION_REQUIRED`; no se inventa dinero ni se devuelve
un reparto parcial. En una factura parcialmente descubierta con cobertura
suficiente se libera exactamente la NC, preservando el descubierto previo.

La identidad de la NC y los eventos por aplicación no cambian: replay retorna
la evidencia anterior sin liberar otra vez; cambiar el importe con la misma
identidad es conflicto. Todo sigue dentro de la misma transacción y lock de scope.

Pruebas PostgreSQL añadidas: los dos casos exactos de Codex, replay concurrente
y conflicto, NC sucesivas con reversión/restauración y agotamiento de capacidad,
y factura parcialmente descubierta (rechazo atómico y conciliación válida).

**Contrato HTTP/DTO:** sin cambios. No se habilita un endpoint de NC ni se
modifican el finalizador o el cliente SPA.

**Habilitación operativa: BLOQUEADA.** Continúan pendientes constructor fiscal,
pasarela fiscal persistente, importación histórica verificada, stock en la misma
transacción, sesión/permisos, montaje y pruebas conjuntas, según el handoff.
