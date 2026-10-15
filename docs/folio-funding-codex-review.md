# Revisión de Codex — motor Folio/SPA aislado

Snapshot revisado: `149778d4` (motor `553493ba`). No se modificó el motor,
contrato, UI operativa, migraciones, main ni demo publicado.

## Evidencia reproducida

- `tsc -p tsconfig.funding.json`: sin errores.
- Las 24 pruebas `node --import tsx --test server/tests/payment-funding.isolated.pg.test.ts`
  pasan: 24/24, sin omisiones.
- Base descartable `folio_funding_synthetic`, usuario `runner`, Unix socket local,
  sin escucha TCP ni lectura de DATABASE_URL. La máquina de revisión no tenía
  initdb/pg_ctl en PATH: se usó un contenedor PostgreSQL 16 dedicado exponiendo
  únicamente el socket esperado por la suite. No se usó la base de integración
  general ni ninguna base operativa.

Las pruebas existentes son valiosas, pero no cubren los casos siguientes.

## R1 — Prorrateo de NC no conserva el importe exacto [alta]

Origen: `server/billing/funding/creditNotes.ts:29`. Se redondea cada liberación
con Math.round independientemente y no se distribuye el resto entre aplicaciones.

Reproducciones con ledger sintético mínimo, tres o dos pagos del mismo importe:

- Factura $300.000, tres pagos de $100.000, NC $100: libera $33,33 por pago,
  total $99,99. Al disminuir la factura en $100, el trigger detecta cobertura
  excedida y la conciliación falla con DOCUMENT_CAPACITY. La transacción revierte;
  una NC válida no queda conciliada por este camino.
- Factura $200.000, dos pagos de $100.000, NC $100,01: libera $50,01 de cada uno,
  total $100,02. La conciliación termina, pero libera un centavo de más respecto
  de la NC y deja un centavo de la factura original sin cobertura.

Se necesita prorrateo entero con distribución determinística del resto que
conserve el importe a liberar conforme a la cobertura real. Debe contemplar NC
sucesivas, aplicaciones ya reversadas, coberturas parciales y restauraciones,
sin liberar otra vez fondos previos ni superar la capacidad de cada origen.
No se propone alterar la regla de no inferir qué pago financió un servicio.

## R2 — Fence no resuelve los IDs de cargos SPA [alta antes de habilitar]

Origen: `server/billing/funding/integration.ts:27-50`.

El middleware reconoce cuentas, reservas, pagos, Caja, facturas y turnos SPA,
pero no resuelve `spa_account_items.id -> spa_accounts.id`. Una petición a
PATCH/DELETE `/api/spa/account-items/:id` sin `spaAccountId` en el body pasa al
handler legacy, incluso si la cuenta fue adoptada y tiene fondos reservados.

Reproducción HTTP con el mount real, una cuenta abierta adoptada y operación
reservada: un handler legacy de escritura mínima se ejecutó una vez y devolvió
200, cuando se esperaba 409/MANAGED_SCOPE_USE_FUNDING. Se alteró el subtotal
sintético después de la reserva. Es una prueba del fence, no de la aplicación
operativa completa.

Contraste estático del piloto: `server/routes/spa.ts` expone ambas rutas y
`DatabaseStorage.updateSpaAccountItem` permite cambiar precio en una cuenta
abierta; no conoce el scope adoptado. Por tanto, no hay una protección del nuevo
motor en ese almacenamiento existente que pueda darse por demostrada.

Replit debe resolver el propietario por ID y cubrir los otros escritores reales
con pruebas de integración. La comprobación y la escritura también deben
coordinarse con la adopción/reserva mediante locks/transacción para evitar
carreras; añadir sólo un chequeo previo no acredita protección completa.

Este hallazgo no afirma que haya ocurrido una inconsistencia en operación:
el motor todavía no está montado y ese aislamiento debe mantenerse.

## Reproducción adicional

`node --import tsx script/review-funding-edge-cases.ts` contra la misma base
sintética después de la suite. Imprime los tres resultados observados. No
contacta ARCA, no toma configuración de producción y no modifica el motor.
Los dos casos de redondeo usan un ledger mínimo de prueba; no verifican adopción
histórica ni pasarela fiscal. El caso de fence usa los fixtures del motor.

## Nota menor de reproducibilidad

El script instala un clúster como el usuario local, pero la suite fija `user:runner`.
En una máquina cuyo usuario sea distinto, el comando documentado no asegura que
ese rol exista. Parametrizar el usuario de la base sintética o crearlo expresamente.

## Siguiente paso

Corregir R1/R2 en commits enfocados de la rama de Replit y ampliar sus pruebas.
Codex no mantiene otra implementación de financiación. No retirar guardias SPA ni
montar el módulo para superar estos errores. Las dependencias operativas del
handoff siguen pendientes: constructor fiscal, pasarela persistente, importador
histórico, stock transaccional, sesión/permisos y verificación conjunta.
La UI puede prepararse con fixtures, pero no debe emitir, cobrar ni adoptar datos.
