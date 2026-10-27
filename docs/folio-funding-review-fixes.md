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

## R2 — Propietario persistido y exclusión de escritores legacy

El middleware buscaba pagos/facturas pero nunca resolvía
`spa_account_items.id → account_id`. Ahora resuelve el propietario desde SQL,
independientemente del body, para ítems, pagos, turnos, facturas y folios. También
incluye `/admin/spa` y `/folios`, que antes no pasaban por la protección.
Una cuenta adoptada devuelve `409/MANAGED_SCOPE_USE_FUNDING` **antes** del handler
legacy. La excepción de link de factura sigue delegando al único finalizador.

El chequeo participa del mismo advisory lock de scope que adopción y operaciones
del motor. Para cuentas no adoptadas mantiene ese lock hasta que el handler
termine su respuesta, no sólo durante el chequeo. Si adopción ganó primero,
espera su commit y luego rechaza; si ganó la escritura legacy, adopción espera
su finalización. Los locks múltiples se toman en orden estable y el timeout
de adquisición devuelve el `CONCURRENT_CHANGE` ya existente.

Una desconexión del cliente no libera un lock mientras el handler sigue
escribiendo. No se implementa liberación por antigüedad. El guard usa una conexión
adicional del pool por escritura legacy identificada: antes de habilitar deben
validarse capacidad del pool y handlers que terminen siempre su respuesta. Un
handler que nunca termine conserva el bloqueo deliberadamente; su resolución
requiere detener al escritor, no liberar fondos ni permitir adopción en paralelo.

### Auditoría del alcance

| Familia | Protección y evidencia |
|---|---|
| `PATCH/DELETE /spa/account-items/:id` | Propietario por ítem persistido; prueba HTTP con handlers, almacenamiento, auth y permisos reales contra PostgreSQL sintético. Conserva cargo, cuenta, pagos, operación y holds. Body con propietario falso no evita el rechazo. |
| Cuenta SPA: editar, añadir ítem/pago, cerrar, resume-invoice, NC/reset | Propietario por cuenta en URL. Se comprueba el rechazo en las rutas reales. |
| Pago SPA: anulación / eliminación | Propietario por pago persistido aunque aún no tenga receipt importado. Anulación cubierta en ruta real; eliminación ya está prohibida por legacy y también atraviesa el fence. |
| Turno SPA y creación de cuenta para un turno existente | Relación `appointment_id → cuenta`; rechazo en rutas reales. |
| Revisión fiscal administrativa SPA | Propietario de la factura operativa; rechazo en ruta real. |
| Facturación común y NC de factura SPA | Body explícito o propietario persistido de factura/folio; rechazo en rutas reales sin invocar emisor. |
| Folio común: ensure, movimientos, close/reopen | Relación `folio → entity`; rechazo en rutas reales. |
| Caja | Continúa la protección por IDs de movimiento/pago; se añade `sourceType/sourceId` explícito. Se prueba el resolvedor para `spa_account`; no se monta ni ejecuta la Caja operativa. |
| Eliminación masiva de comprobantes no fiscales | No trae identidades individuales bloqueables. Se rechaza por completo mientras el montaje opt-in esté habilitado, incluso si aún no hay scopes adoptados, para evitar una carrera con adopción. No cambia la aplicación principal, donde el montaje sigue deshabilitado. |
| Catálogos de tratamientos, gabinetes, profesionales y clientes | No son escritores de cargos/pagos/cierre de una cuenta existente; no se habilitan ni reimplementan aquí. |

Las cuentas abiertas no adoptadas conservan PATCH y DELETE reales de ítems;
ambos se verifican con persistencia PostgreSQL, no con un handler sustituto.
Las carreras se controlan pausando el almacenamiento real antes de su escritura
y comprobando el advisory lock con otra conexión PostgreSQL.

**Contrato HTTP/DTO:** no cambia el contrato de `/api/payment-funding`, sus
envelopes ni DTO. Se extiende la aplicación del rechazo legacy ya documentado;
la eliminación masiva descrita arriba queda explícitamente deshabilitada bajo
el montaje opt-in. Codex debe seguir consumiendo la misma API, sin otro
liquidador ni fallback legacy.

No se modificaron el cliente SPA, el finalizador, rutas operativas montadas,
credenciales, stock real ni emisores fiscales. La pasarela y sesión usadas en
pruebas son exclusivamente fixtures, no sustitutos de los bindings pendientes.
