# R5 — durabilidad del ticket WSAA independiente del rollback financiero

Revisión recibida: rama `review/spa-funding-bindings-r3-r4`, commit `d323b886`,
informe `docs/spa-funding-bindings-r3-r4-verification.md`.
Base de esta corrección: `a12f366` en `feature/spa-funding-bindings`.
Este cambio se entrega en un único commit separado de R3/R4.

**Estado: corregido y verificado con datos sintéticos.
La habilitación y homologación fiscal real continúan bloqueadas.**

## Causa

La corrección del autoagotamiento del pool había ligado el caché WSAA al cliente
financiero. Era necesario no pedir otro préstamo, pero no era correcto guardar
un ticket externo dentro de una transacción que pudiera revertir la numeración:
el rollback local borraba el ticket aunque WSAA ya lo hubiera emitido.
Un nuevo login podía obtener `alreadyAuthenticated` sin disponer localmente del TA.

## Solución y límites

1. `FundingStore.transaction` admite una preparación interna opcional, ejecutada
   con **el mismo PoolClient prestado**, antes del BEGIN y de los locks
   financieros. Los demás usos de la transacción mantienen su secuencia anterior.
2. El gateway lee la preparación fiscal persistida y solicita
   `FiscalTransport.prepareNumbering`. Ese método abre y confirma una
   **transacción de autenticación independiente**, en la conexión ya prestada.
   El ticket se guarda en el caché SQL existente, no en memoria como solución.
3. La autenticación concurrente funding del mismo ambiente/emisor se coordina
   mediante un advisory lock transaccional no bloqueante. Un contender no vuelve
   a autenticar: recibe el conflicto existente y conserva la misma operación y
   sus fondos para reintentar después.
4. El transporte configurado exige leer y guardar el caché correctamente:
   errores SQL o ausencia de la fila actualizada no se silencian como si el
   ticket fuera durable. Esta modalidad estricta es explícita para funding;
   no cambia los argumentos de los callers legacy existentes.
5. Sólo después del COMMIT de autenticación empieza el BEGIN financiero.
   Se vuelve a verificar la preparación persistida contra la que se autenticó.
   La función de consulta de número ya tiene credenciales; no renueva tickets
   dentro de la transacción financiera.
6. Se conserva el lock no bloqueante de serie, el claim/borrador confirmado
   antes de enviar y la recuperación de esa misma identidad. Un borrador
   pendiente, cambio de fuente o fallo financiero no revierte el ticket que ya
   estaba confirmado antes del BEGIN.

No se agrega otro pool, no se aumenta max, no se pide una segunda conexión
mientras se retiene la primera, no se elimina la exclusión ni se añade un
liquidador. `PaymentFundingService.finalize` no fue modificado.
`prepareNumbering` es un cambio del adaptador interno, no del contrato HTTP,
DTO o cliente SPA. Debe invocarse antes de la transacción financiera, nunca
anidarse en un BEGIN del caller.

La garantía comprobada es supervivencia al **rollback financiero posterior**,
también tras reconstruir instancias y sesiones SQL. No se afirma atomicidad
distribuida entre WSAA y PostgreSQL: una caída entre la respuesta externa y el
primer COMMIT del caché, o una falla al persistir ese COMMIT, sigue exigiendo
reconciliación. No se intenta ocultarla con otro login o un caché sólo en memoria.

## Reproductor convertido en regresión de corrección

`server/tests/funding-wsaa-cache-review.isolated.pg.test.ts`, derivado del
reproductor de Codex, ahora exige el comportamiento corregido. Usa:

- Pool PostgreSQL real con **max=2**, socket Unix local y base exclusiva
  `folio_funding_synthetic`.
- Certificado/clave sintéticos generados durante la prueba.
- Transporte configurado, firmador/cache WSAA, gateway, store, locks y
  finalizador reales; sólo HTTP externo y la conexión global se sustituyen.
- Una simulación WSAA que emite un ticket una vez y devolvería
  `alreadyAuthenticated` ante un segundo login.
- Caché SQL persistido y nuevas instancias con todas las conexiones reemplazadas
  y módulos recargados. No se declara haber matado/reiniciado un servidor
  operativo ni haber hecho una prueba de homologación.

Los cuatro casos comprueban:

1. Caché vacío → ticket nuevo → fallo real por borrador pendiente después de
   consultar número → rollback financiero → ticket todavía visible con firma,
   ambiente y vencimiento → instancia nueva → reintento sin segundo login.
2. La misma secuencia partiendo de caché vencido, reemplazado por el nuevo TA.
3. Dos operaciones concurrentes con max=2: el contender conserva fondos sin
   duplicar login; el propietario revierte por el borrador pendiente; el ticket
   permanece y ambas operaciones completan por reintento con una instancia nueva.
4. Timeout posterior al CAE → fondos retenidos → instancia nueva → consulta SOAP
   fiel → misma identidad fiscal → único finalizador. No se emite ni cobra otra
   vez y no se alteran los conteos de pagos, Caja ni folio.

La simulación `alreadyAuthenticated` no es una observación de ARCA real.
Las assertions verifican persistencia y reutilización; no son pruebas verdes
que sólo acreditan la pérdida del ticket.

## Verificación ejecutada

| Suite | Resultado |
|---|---:|
| Motor, fence/rutas SPA, cliente HTTP/PG y bindings | 47 aprobadas |
| Regresiones R4 de pool/series | 4 aprobadas |
| Nuevas regresiones R5 y recuperación post-CAE | 4 aprobadas |
| Permisos, borradores, parsers ARCA y reintento WSAA | 82 aprobadas |
| Cliente original de Codex, sin cambios | 22 aprobadas |
| **Total** | **159 aprobadas** |
| TypeScript completo y `tsconfig.funding.json` | Correctos |
| Build | Correcto; avisos habituales de Browserslist/PostCSS/chunks |

```sh
npx vitest run --config vitest.funding-wsaa-review.config.ts
bash script/test-funding-isolated.sh
npx vitest run --config vitest.funding-review.config.ts
npx vitest run --config vitest.server.config.ts \
  server/tests/permissions.test.ts \
  server/tests/invoice-recovery-draft.test.ts \
  server/tests/arca-credit-note-recovery.test.ts \
  server/tests/wsaa-transient-fault-retry.test.ts
npx vitest run client/src/components/spa/spa-funding-panel.test.tsx \
  client/src/lib/paymentFunding.test.ts
npx tsc --noEmit --incremental false
npx tsc -p tsconfig.funding.json
npm run build
```

No se invocó una suite general que utilizara el `DATABASE_URL` operativo.
Se restituyó el timestamp generado: el diff de `client/` es vacío.

## Pendientes y restricciones

R3/R4 conservados en las suites repetidas. Sin modificaciones de main, flags,
contrato HTTP o cliente; sin nuevos grants, migraciones operativas, accesos a
datos reales, llamadas a ARCA/WSAA reales, merge ni despliegue.
`enabled=false` y `reviewedExtensions=false` siguen siendo los valores por defecto.

Continúan pendientes la revisión conjunta de este commit con Codex, homologación
WSAA/WSFE autorizada, reglas fiscales/catálogo/PV, revisión de otros escritores,
acuerdo sobre extensiones e integración de UI e historia compleja.
