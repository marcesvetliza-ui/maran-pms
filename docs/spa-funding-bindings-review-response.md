# Respuesta a la revisión independiente de Codex — R3 y R4

Revisión recibida: `review/spa-funding-bindings`, `d4c28f1b`.
Correcciones exclusivamente en `feature/spa-funding-bindings`.
El informe original se conserva en `spa-funding-bindings-codex-review.md`;
sus reproductores afirmaban la presencia de los defectos, no su corrección.
Se integró ese material y se convirtieron los reproductores en regresiones.

**Estado: corregidos y verificados con PostgreSQL y SOAP sintéticos.
Habilitación operativa: BLOQUEADA.** Ningún resultado de esta entrega
acredita homologación fiscal real ni autoriza cambiar las gates.

## R3 — FECompConsultar no reconocía ResultGet

- Se separaron los parsers de consulta y autorización. Usan XML estructurado,
  namespaces y rutas SOAP/WSFE exactas, no búsquedas de tags en todo el texto.
  `saxes`, ya presente en el lockfile, se declara dependencia directa.
- La consulta interpreta `ResultGet/CodAutorizacion`, `FchVto` y
  `EmisionTipo=CAE`. El campo `Resultado` no es obligatorio en el esquema de
  consulta; si llega, no puede contradecir la autorización.
- Exige tipo, PV y rango exacto del comprobante consultado. En funding también
  contrasta importe en centavos, receptor, fecha, moneda PES y cotización 1
  contra la preparación persistida del mismo documento.
- CAE de 14 dígitos y vencimiento con fecha válida son evidencia obligatoria.
  Se eliminó el vencimiento inventado de “hoy + 10 días”, también en emisión.
- Sólo un error 602 inequívoco en `FECompConsultarResult/Errors/Err` devuelve
  “inexistente”. Errores mezclados, datos contradictorios, CAEA, XML malformado,
  DTD, estructuras ajenas, duplicados o faltantes no prueban inexistencia.
  El gateway conserva el resultado desconocido y los fondos.
- La recuperación PostgreSQL post-CAE ahora atraviesa el transporte concreto
  y el parser con SOAP `ResultGet` fiel, incluyendo namespaces explícitos,
  dos consultas concurrentes y reconstrucción del gateway. Se comprueba que
  se recupera la identidad existente y no se repite emisión, pago ni Caja.
- Las llamadas SOAP tienen timeout acotado; un timeout sigue siendo desconocido,
  nunca permiso para emitir otra factura.

## R4 — préstamos anidados mientras se retenía el lock de serie

El defecto afectaba al wrapper legacy incluso sin montar funding.

- El emisor legacy toma el lock de serie con `pg_try_advisory_lock` y liga
  Drizzle a **ese mismo PoolClient** durante toda la emisión. El contador,
  lectura/escritura del caché WSAA, borrador transaccional, recuperación y
  persistencia de la factura no piden otra conexión al pool global.
- Los borradores conservan su transacción y commit anterior a la emisión
  externa; no se envolvió todo el envío en una transacción sin commit.
- El lock se libera al terminar, tanto con éxito como con error; si el
  desbloqueo falla, se descarta la conexión en lugar de devolver un lock al pool.
- Un contender de la misma serie recibe conflicto 409 sin autorización remota
  y sin ocupar una conexión esperando el lock. Debe reintentar la misma
  operación; no se modificaron DTO ni estados de cliente/motor.
- Funding usa la versión transaccional no bloqueante del mismo advisory lock.
  Pasa su cliente de asignación a la consulta de último número y a los accesos
  de configuración/WSAA. Su identidad/borrador se siguen confirmando antes de
  la llamada de autorización. La interfaz interna de transporte recibe el
  cliente en `lastNumber`; no es un cambio del contrato HTTP.
- Se conserva el rechazo legacy ante claims funding desconocidos y la
  recuperación por la identidad ya reclamada. No se eliminó la exclusión,
  aumentó el tamaño del pool ni agregó un segundo pool operativo.

### Evidencia específica de capacidad

Pool PostgreSQL real de **max=2** y timeout de conexión de 250 ms,
siempre contra la base sintética por socket:

1. Dos emisiones legacy en series distintas completan con los dos slots
   ocupados. Configuración, caché WSAA y commits de borrador son reales.
   Exactamente cuatro préstamos: dos lecturas iniciales de configuración y
   dos conexiones de emisión; ningún préstamo anidado.
2. La misma serie rechaza al contender sin emitir. Después de liberar el
   propietario, el siguiente intento obtiene el siguiente número.
3. Un fallo de autorización conserva el borrador y su error, pero libera
   la conexión y el lock.
4. El transporte concreto funding lee configuración y caché WSAA en sus
   clientes suministrados aun con todos los slots ocupados, sin pedir otro.
5. Dos operaciones funding de series distintas terminan con max=2.
   Mientras ambas retienen su lock, los emisores legacy de esas series son
   rechazados. Después se completa el único finalizador con los cobros
   existentes; no hay un liquidador nuevo.

Estas pruebas excluyen el autoagotamiento reproducido; no constituyen una prueba
de carga ilimitada, de disponibilidad de PostgreSQL ni una auditoría exhaustiva
de todos los emisores externos al alcance revisado.

## Verificación ejecutada

Sólo PostgreSQL Unix socket `/tmp/folio-funding-isolated/socket:55439`,
base `folio_funding_synthetic`. La suite de revisión usa un schema sintético
propio, creado y eliminado por ella. Ninguna suite general dependiente del
`DATABASE_URL` operativo fue invocada. Respuestas externas sustituidas: no
hubo conexión a ARCA/WSAA reales ni lectura de credenciales operativas.

| Verificación | Resultado |
|---|---:|
| Motor + fence/rutas + cliente HTTP/PG + bindings | 47 aprobadas |
| Regresiones de concurrencia y préstamo de conexiones de la revisión | 4 aprobadas |
| Permisos, borradores y parsers ARCA | 79 aprobadas |
| Cliente original de Codex, sin cambios | 22 aprobadas |
| **Total** | **152 aprobadas** |
| TypeScript completo y `tsconfig.funding.json` | Correctos |
| Build | Correcto; avisos habituales de Browserslist/PostCSS/chunks |

Comandos:

```sh
bash script/test-funding-isolated.sh
npx vitest run --config vitest.funding-review.config.ts
npx vitest run --config vitest.server.config.ts \
  server/tests/permissions.test.ts \
  server/tests/invoice-recovery-draft.test.ts \
  server/tests/arca-credit-note-recovery.test.ts
npx vitest run client/src/components/spa/spa-funding-panel.test.tsx \
  client/src/lib/paymentFunding.test.ts
npx tsc --noEmit --incremental false
npx tsc -p tsconfig.funding.json
npm run build
```

Las dos suites de cliente se ejecutaron por separado, sin modificar su código.
Se restituyó el timestamp generado por el build; el diff de `client/` es vacío.

## Revisión conjunta pendiente

Codex debe revisar especialmente la estructura SOAP, el rechazo conservador
de evidencia incompleta y el uso del cliente transaccional de numeración.
Los casos negativos de sus reproductores originales ahora se expresan como
assertions de corrección, no como pruebas verdes de un fallo conocido.

Se conservan todas las restricciones anteriores: sin cambios a main ni al
cliente SPA; sin datos operativos, nuevas migraciones/grants, flags, merge o
despliegue. `enabled=false` y `reviewedExtensions=false` siguen por defecto.
`PaymentFundingService.finalize` sigue siendo el único finalizador.

Continúan pendientes homologación WSAA/WSFE autorizada, reglas tributarias y
catálogo/PV, revisión de los demás escritores, acuerdo de las extensiones,
integración de navegador con Codex y evidencia histórica compleja.
