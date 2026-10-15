# Bindings Folio/SPA — entrega para revisión conjunta

## Alcance y autorización

Base exacta: `feature/spa-funding-client`, commit `24346aa8`.
Rama de trabajo: `feature/spa-funding-bindings`.

Se leyeron el handoff, el contrato del motor y la revisión/entrega de cliente.
La autorización posterior permite desarrollar y verificar bindings, **no
habilitarlos**. No se consultaron bases operativas ni se contactó ARCA, WSAA,
Railway o un servicio de emisión real. No se cambiaron credenciales, entornos
fiscales ni flags de despliegue. Sin merge, publicación ni modificaciones a main.
El cliente SPA de Codex no se modifica.

**HABILITACIÓN OPERATIVA: BLOQUEADA.** Los resultados siguientes acreditan SQL,
inventario, permisos y persistencia reales sobre datos sintéticos; no acreditan
homologación ARCA ni una migración de historia operativa.

## Implementación

### Preparación fiscal validada

`server/billing/funding/operational/preparation.ts` reconstruye el documento desde
la cuenta, turno, cargos, receptor persistido y configuración del servidor. Usa
`calcularMontos` del constructor fiscal existente; no recibe receptor, IVA, moneda,
precio, importe, CAE ni snapshot del navegador.

Persiste receptor, FA/FB, PV de homologación, ARS, fecha argentina, ítems, total,
folio e identidades de cargos antes de permitir la reserva. Verifica cantidades,
precios, subtotales, total de la cuenta, identidad y condición IVA del receptor.
La identidad de preparación es determinista; no sustituye silenciosamente un
documento anterior si la fuente cambió. Una cuenta con operación activa debe
recuperarla, no preparar otra.

Alcance inicial: cuenta directa SPA completa, cargos estándar al 21%, FA/FB y ARS,
con una ficha inequívoca en huéspedes o clientes SPA. No se habilitan Factura T,
MiPyME, documentos no fiscales, CC, vouchers, retenciones, cargos a habitación ni
selección de otro receptor. Se deben revisar el tratamiento tributario del catálogo
y los casos de identificación fiscal exigible antes de habilitarlo. El PV SPA debe
ser online e inequívoco; en homologación se utiliza el PV de homologación configurado.
Una condición IVA o vínculo de receptor faltante/ambiguo bloquea la preparación.

### FiscalGateway persistente

`operational/fiscalGateway.ts`, `arcaTransport.ts` y `schema.sql`:

- Verifican la operación y el claim persistidos.
- Reclaman número y fila `sales_invoices`, con identidad completa, en un commit
  anterior a `FECAESolicitar`.
- Usan compare-and-set de `prepared` a `sending`: sólo un caller puede enviar.
- Recuperan el mismo ambiente/emisor/tipo/PV/número; nunca el siguiente número.
- Persisten CAE tanto en la fila fiscal como en la identidad del gateway antes
  de devolver la autorización al motor.
- Timeout, excepción, rechazo no clasificado y consulta “no encontrado” quedan
  desconocidos: no liberan fondos ni autorizan un nuevo envío.
- Si el proceso cayó antes de guardar/reclamar el envío, la recuperación puede
  completar la misma preparación. Si cayó después de marcar `sending`, únicamente
  consulta esa identidad, aunque no se pueda probar que llegó a enviar.
- La consulta verifica total, fecha, documento del receptor y moneda antes de
  aceptar el CAE; no basta con recibir un número de CAE.
- La identidad no puede modificarse ni eliminarse; un resultado ya guardado es
  inmutable. No se infiere rechazo terminal para habilitar `abort`.

El transporte concreto utiliza WSFE existente y el caché WSAA existente, sin
exportar ni imprimir credenciales. Sólo acepta homologación. Su construcción no
autentica ni emite. **No se invocó ese transporte contra ARCA en esta entrega.**

`invoiceService.ts` comparte el bloqueo de serie con el gateway y rechaza emisión
legacy cuando existe una identidad funding pendiente de esa serie. No crea otro
liquidador. El emisor ficticio y sus contadores conservan su circuito anterior.
Esta exclusión usa una conexión adicional y debe incluirse en la revisión de
capacidad del pool y de todos los escritores fiscales antes de habilitar.

### Cierre y stock reales en la transacción del finalizador

`operational/spaClosure.ts` usa exactamente el `PoolClient` entregado por
`SqlFundingAdapter.finalize`. Invoca `consumeStockLines`, el motor existente,
mediante Drizzle ligado a ese cliente. No usa `storage.closeSpaAccount`, pool
global, otra transacción ni un callback vacío.

Consume insumos del tratamiento y productos identificados, verifica tratamiento,
turno, cantidades, unidades, depósitos y existencias. Reclama el job por identidad
de origen **antes** de consumir, para coordinar también con el trabajador legacy.
Respeta consumo previo y jobs completados; una reversión o plan pendiente distinto
requiere revisión. Un tratamiento existente sin insumos es un plan vacío verificado,
no un sustituto del binding de stock.

Falta de stock revierte consumo, jobs, pagos nuevos, Caja, folio y metadatos del
cierre. CAE y holds permanecen para recuperar el mismo finalizador tras corregir
el problema. El binding actualiza turno y metadatos operativos; sólo
`PaymentFundingService.finalize`/`SqlFundingAdapter.finalize` liquida y cierra.

### Adopción histórica por IDs

`operational/history.ts` es un comando interno, sin endpoint ni ejecución automática.
Exige `funding:historical`, evidencia de revisión y un plan explícito.

Adopta el scope completo en una transacción y con el mismo lock del motor/fence.
Verifica factura propietaria, lista completa de documentos, pago, Caja, folio,
medio, estado e importes en centavos. Cada aplicación exige vínculo fiscal
persistido por ID (`payment_id` o referencia fiscal del pago); jamás busca otro
pago por coincidencia de importe. Sólo puede saltar el rechazo de una cuenta con
factura propietaria dentro de esta adopción con importador verificado.

**Límite intencional:** el importador inicial acepta facturas FA/FB emitidas,
sin NC, completamente cubiertas y con vínculos fiscales demostrables.
NC/reutilización, cobertura parcial, no fiscales, vínculos ausentes o ambiguos,
duplicados y omisiones bloquean toda la adopción. No se declara resuelta una
historia compleja sólo por suministrar un archivo de importación. Su soporte
requiere un plan de evidencia adicional revisado; no se ejecutó importación real.

### Sesión, roles, turnos y montaje

`operational/access.ts` deriva Actor de Passport y el catálogo administrable
`role_permissions`; rechaza sesión incompleta/2FA pendiente. Los tres permisos del
contrato tienen etiquetas administrables y **ningún grant automático**, ni siquiera
para admin. Se consultan con la misma política de `/api/permissions/mine`.

`operational/mount.ts` reúne los bindings sin recrear el adaptador ni el finalizador.
El servidor prepara la llamada inmediatamente después de su gate de sesión y
antes de los escritores legacy. `mountConfiguredOperationalSpaFunding` tiene
`enabled=false` por defecto y la aplicación no pasa `true`. Así no hace consultas,
DDL ni registra rutas. No se puede habilitar con `VITE_SPA_FUNDING_UI`.

La fuente de turnos consulta turnos de Caja SPA realmente abiertos cuyo cajero
es el Actor. Preview y reserva rechazan turnos ajenos/no abiertos; el motor
conserva su comprobación transaccional de turno/área. El replay de un UUID existente
no se rompe por un turno cerrado después de la reserva.

El montaje conserva el fence legacy revisado y exige esquema previamente instalado
si se habilita explícitamente. No se agrega DDL a migraciones ni al arranque.

## Propuestas de contrato: requieren acuerdo de Codex

No cambian DTO, endpoints ni estados del motor existente.
Se prepararon estas **extensiones aditivas**, con gate independiente
`reviewedExtensions=false` por defecto. Sólo las pruebas sintéticas lo pasan a true.
No forman parte todavía del contrato aprobado ni se consumen desde la UI:

1. `POST /api/payment-funding/spa/:accountId/prepare-document`, body `{}`.
   Respuesta habitual `{ok:true,data:{documentId,totalCents}}`. Permiso write.
   Rechaza cualquier campo adicional. Se vuelve a leer la proyección para
   seleccionar el documento persistido; no se introduce snapshot del navegador.
2. `GET /api/payment-funding/spa/:accountId/collection-shifts`.
   Respuesta `{ok:true,data:[{id,label}]}`. Permiso read y scope adoptado.
   Codex cargaría esta fuente y pasaría las filas a `collectionShifts`.

Errores de los bindings, pendientes de acuerdo: `FISCAL_PREPARATION_REQUIRED`,
`FISCAL_ENVIRONMENT_BLOCKED`, `INVENTORY_REVIEW_REQUIRED`.
Las respuestas del motor mantienen sus envelopes actuales. Una falta de stock
se informa actualmente como error de finalización y conserva `authorized_pending_link`;
no se transforma en emisión rechazada ni permite liberar dinero.

## Evidencia ejecutada

Entorno: PostgreSQL local por Unix socket, DB `folio_funding_synthetic`.
Ninguna suite general que pueda consumir `DATABASE_URL` fue invocada.
Sólo se reemplaza el módulo de conexión por la conexión sintética en los tests
de rutas/bindings; la autenticación, permisos, builder, inventario, gateway
persistente, handlers y adaptador SQL ejecutan código real. El proveedor externo
es un sustituto de prueba con autorización persistida en una conexión separada.

- `bash script/test-funding-isolated.sh`: **46 aprobadas**:
  28 motor + 8 fence/rutas SPA + 2 cliente HTTP/PG + 8 bindings operativos.
- Regresión de permisos, borrador fiscal y consulta ARCA:
  **38 aprobadas**, usando `vitest.server.config.ts` con selección explícita de
  `permissions`, `invoice-recovery-draft`, `arca-credit-note-recovery`.
- Cliente SPA de Codex: **22 aprobadas** en sus dos suites existentes, sin
  modificar su implementación.
- TypeScript completo y `tsconfig.funding.json`: correctos.
- `npm run build`: correcto. Sólo advertencias de Browserslist, PostCSS y chunks.
  Se descartó el timestamp generado del cliente; no hay cambios al cliente SPA.
- El build no se ejecutó ni se publicó contra un servidor operativo.

Los 8 casos nuevos cubren: montaje desactivado sin acceso a dependencias;
existing_only sin nuevos pagos/Caja/folio; mixto sólo por faltante y stock real;
rollback integral por stock insuficiente y recuperación del mismo CAE;
CAE remoto seguido de timeout y recuperación concurrente con otra instancia;
consulta no encontrada que conserva fondos/identidad y bloqueo de serie legacy;
sesión, permisos, turnos falsos, snapshots falsos y fence; importación completa
por IDs y rollback por ambigüedad/omisión. También se verifica inmutabilidad SQL
de la identidad fiscal.

## Bloqueos y pasos de revisión conjunta

1. Revisar esta rama sobre la base exacta de Codex, especialmente exclusión de
   serie fiscal, ventana prepared/sending, reintentos y conservación de holds.
2. Acordar las dos extensiones/errores antes de que Codex conecte la preparación
   y `collectionShifts`. No habilitar aún ninguna de las dos gates.
3. Confirmar reglas fiscales del catálogo, identidad del receptor, PV SPA y
   manejo de ficha incompleta; ampliar sólo mediante reglas validadas.
4. Probar SOAP/WSAA reales en un entorno de homologación aislado autorizado con
   sus credenciales, PV y caché persistente. Aquí no se leyó configuración
   operativa ni se verificó disponibilidad de esas credenciales.
5. Revisar pool/locks, todos los escritores fiscales, terminación de handlers y
   coordinación de trabajadores de inventario. Las suites prueban los casos
   declarados; no acreditan una auditoría exhaustiva de cada escritor operativo.
6. Preparar evidencia histórica sintética representativa de NC/reutilizaciones
   y casos incompletos que el importador actual rechaza. No importar historia
   real sin revisión de sus identidades y autorización específica.
7. Una vez acordado el contrato, ejecutar navegador con el cliente de Codex
   y estos bindings en homologación aislada, incluidos refresh/post-CAE, dos
   cajeros, recuperación y límites de rol. No hubo nueva prueba de navegador
   en esta entrega porque no se modificó/conectó su cliente.
8. Solicitar autorización posterior para instalación de esquema, grants,
   importación real, habilitación, merge o despliegue. Nada de ello queda
   autorizado ni ejecutado por este push.
