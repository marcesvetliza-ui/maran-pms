# Folio / SPA — contrato del backend aislado

Reparto con Codex y bloqueos de dependencias reales: `docs/folio-funding-handoff.md`. La UI preparada no autoriza la habilitación operativa.

## Estado y límites de habilitación

Implementación en `design/folio-payment-correction`. No está montada en `server/routes.ts`, no modifica el workflow ni el servidor principal y no ejecuta DDL al iniciar la aplicación operativa. La demo separada sirve estos endpoints en el puerto **8099**, con PostgreSQL local descartable y emisor simulado. **No se contactó ARCA ni una base operativa.**

El motor y los adaptadores SQL están en `server/billing/funding/`; el único finalizador es `PaymentFundingService.finalize`, con la rama SPA en `SqlFundingAdapter.finalize`. La integración protegida y opt-in es `mountPaymentFunding`.

Para conectar una interfaz real será necesario montar el módulo **antes** de las rutas legacy, proporcionar autenticación/actor de servidor, una pasarela fiscal recuperable sobre un borrador persistido y un callback de cierre de stock que use exactamente el `PoolClient` recibido. El módulo no fabrica esas dependencias ni habilita producción por haber pasado la demo.

No hay importación histórica automática. La adopción completa se ejecuta explícitamente en una transacción, verificando IDs de pago, Caja y folio. Si hay referencias o documentos fiscales, `adoptScope` exige un importador de historia verificada en ese mismo commit. Los documentos usados por la API deben haber sido preparados por el circuito fiscal validado del backend; **no existe un endpoint público que acepte un receptor/total/CAE arbitrario para convertirlo en factura**.

Antes de habilitar: conciliación de datos reales por IDs autorizados, conexión del emisor fiscal persistente y stock transaccional, lectura UI desde esta proyección en scopes adoptados, y revisión de integración sobre esas dependencias. Las pruebas PostgreSQL aisladas se documentan en `folio-funding-verification.md`.

## Convenciones

- URL base: `/api/payment-funding`.
- Importes: **centavos enteros ARS**, no floats ni pesos. `$95.000 = 9500000`.
- Scope: `{"kind":"reservation","id":"..."}` o `{"kind":"spa","id":"..."}`.
- Métodos monetarios canónicos: `efectivo`, `tarjeta_debito`, `tarjeta_credito`, `transferencia`, `mercadopago`.
- El adaptador SPA convierte `cash/debit_card/credit_card/transfer` explícitamente; no empareja cobros por importes.
- Actor y permisos provienen de middleware/servidor. Las solicitudes son estrictas: no aceptan `actorId` adicional.
- Permisos del contrato: `funding:read`, `funding:write`, `funding:historical`. El integrador los deriva de la sesión/roles reales; no del navegador.
- Las operaciones usan un UUID generado una vez por confirmación. Un retry conserva UUID, request y previewHash.
- Éxito: `{"ok":true,"data":...}`. Error: `{"ok":false,"error":{"code":"...","message":"...","retryable":false,"operationId":"...","details":...}}`.
- HTTP 202 también es éxito: describe una operación fiscal pendiente, **no permiso para emitir otra**.

## Endpoints

| Método | Endpoint | Uso |
|---|---|---|
| GET | `/scopes/:kind/:scopeId` | Proyección única de dinero, documentos, operaciones, revisiones y auditoría. |
| POST | `/previews` | Verificar un plan de factura, sin persistir ni reservar dinero. |
| POST | `/operations` | Confirmar preview y reservar fondos durables. |
| GET | `/operations/:id` | Consultar la misma operación después de refresh, error o reconexión. |
| POST | `/operations/:id/authorize` | Autorizar una vez mediante la pasarela fiscal. No liquida Caja. |
| POST | `/operations/:id/finalize` | Vincular CAE y financiación en una transacción; único dueño de pagos/Caja nuevos. |
| POST | `/operations/:id/resume` | Recuperar autorización y finalizar la misma operación, sin otro cobro ni otro documento. |
| POST | `/operations/:id/abort` | Abortar explícitamente sólo si es seguro; jamás libera por timeout. |
| POST | `/corrections/preview` | Previsualizar corrección de medio, retiro de cobro inexistente o restauración explícita. |
| POST | `/corrections` | Confirmar corrección, aplicaciones, Caja, folio, revisión y auditoría atómicamente. |

### 1. Proyección del scope

Ejemplo parcial, GET `/scopes/spa/spa-existing`:

```json
{
  "ok": true,
  "data": {
    "scope": {"kind": "spa", "id": "spa-existing"},
    "receipts": [
      {"id": "spa:spa-existing:S1", "sourcePaymentId": "spa-existing:S1", "method": "tarjeta_debito",
       "amountCents": 500000, "originalAmountCents": 500000,
       "appliedCents": 0, "heldCents": 0, "freeCents": 500000, "version": 1},
      {"id": "spa:spa-existing:S2", "sourcePaymentId": "spa-existing:S2", "method": "efectivo",
       "amountCents": 9000000, "originalAmountCents": 9000000,
       "appliedCents": 0, "heldCents": 0, "freeCents": 9000000, "version": 1}
    ],
    "documents": [{"id": "spa-existing:F1", "totalCents": 9500000, "status": "draft", "snapshot": {}}],
    "operations": [],
    "debtCents": 0,
    "rectifications": [],
    "events": []
  }
}
```

`snapshot` real contiene receptor, tipo, moneda e ítems de la preparación validada; el `{}` del ejemplo abrevia esos datos, no es un fallback del servidor.

Invariante por receipt: `amountCents = appliedCents + heldCents + freeCents`. No sumar los pagos operativos y sus aplicaciones documentales como dos cobros. “Libre” es disponibilidad documental dentro del scope, no saldo para gastar en otro servicio.

La deuda del scope `reservation` se presenta como **“La reserva tiene $90.000 pendientes de cobro”**. Pendiente fiscal por origen SPA no identifica a quién corresponde ese saldo operativo.

### 2. Preview de factura

POST `/previews`:

```json
{
  "scope": {"kind": "spa", "id": "spa-existing"},
  "documentId": "spa-existing:F1",
  "applications": [
    {"receiptId": "spa:spa-existing:S1", "amountCents": 500000},
    {"receiptId": "spa:spa-existing:S2", "amountCents": 9000000}
  ],
  "newCollections": []
}
```

Respuesta 200, `data`:

```json
{
  "previewHash": "<sha256 de 64 caracteres>",
  "documentId": "spa-existing:F1",
  "scope": {"kind": "spa", "id": "spa-existing"},
  "totalCents": 9500000,
  "snapshot": {"recipient": {}, "items": []},
  "paymentMethods": [
    {"method": "tarjeta_debito", "amountCents": 500000},
    {"method": "efectivo", "amountCents": 9000000}
  ],
  "fundingMode": "existing_only",
  "request": "<mismo objeto validado de la solicitud>"
}
```

En modo mixto se agregan exclusivamente filas nuevas:

```json
{
  "rowId": "faltante",
  "method": "efectivo",
  "amountCents": 9000000,
  "shiftId": "spa-mixed:shift"
}
```

Cada `rowId` es único dentro de la operación. El turno debe estar abierto y pertenecer al área; no se crea otro. El dinero nuevo no puede exceder la deuda real menos otras intenciones de cobro pendientes.

### 3. Reservar

POST `/operations`:

```json
{
  "operationId": "8b46947a-b217-4713-8f39-5a9e3971514b",
  "previewHash": "<hash devuelto>",
  "request": "<objeto completo enviado a /previews>"
}
```

`request` es un objeto JSON, no el string usado aquí para abreviar.

Respuesta 200, `data`:

```json
{
  "id": "8b46947a-b217-4713-8f39-5a9e3971514b",
  "scope": {"kind": "spa", "id": "spa-existing"},
  "status": "reserved",
  "invoice": null,
  "result": null,
  "lastError": null,
  "replayed": false,
  "fundsRetained": true,
  "canAuthorize": true,
  "canFinalize": false,
  "canResume": false
}
```

Mismo UUID/mismo contenido devuelve el estado persistido con `replayed:true`. Mismo UUID/otro contenido es 409. **No cambiar UUID después de un error de red**: consultar primero GET `/operations/:id`.

### 4. Autorización y recuperación

Los POST `authorize/finalize/resume/abort` envían `{}`; no aceptan CAE del cliente.

| Estado | Significado | Acción UI |
|---|---|---|
| `reserved` | Fondos reclamados, todavía no se inició autorización. | Autorizar o abortar si es seguro. |
| `authorizing` | Autorización iniciada, resultado todavía no conciliado. | Consultar/recuperar; no iniciar otra factura. |
| `fiscal_unknown` | Respuesta ambigua o caída tras posible CAE. | Recuperar; fondos permanecen reservados. |
| `authorized_pending_link` | CAE conocido, liquidación local pendiente. | Finalizar/recuperar la misma operación. |
| `applied` | Factura y financiación conciliadas. | Mostrar resultado; retry devuelve el mismo. |
| `aborted` | Abortada de manera segura. | No reactivar el UUID. |

`invoice`, cuando se conoce:

```json
{
  "operationId": "...",
  "documentId": "spa-existing:F1",
  "invoiceId": "80000001",
  "cae": "99999980000001",
  "totalCents": 9500000,
  "claimHash": "..."
}
```

El ejemplo es **simulado**, no un comprobante autorizado por ARCA.

Si CAE se obtuvo y falló antes de persistirlo localmente, se consulta la pasarela por la misma identidad fiscal persistente. Si falló la vinculación, se revierte toda la liquidación local: el CAE y las reservas no se eliminan. `resume` completa el único finalizador. No hay TTL, job ni timeout que libere esos fondos.

Un resultado “no encontrado”/ambiguo **no equivale** a rechazo terminal. Para abortar después de intentar autorizar, la pasarela debe acreditar rechazo definitivo. Una intención con dinero nuevo requiere conciliación explícita de ese cobro: este módulo no permite descartarla mediante `abort`.

Al finalizar, `result` contiene `invoiceId`, `documentId`, `fundingMode`, `totalCents`, `newCollectionCents`, `paymentMethods`. El modo `existing_only` tiene `newCollectionCents:0` y no agrega pagos, Caja, pagos de folio, turnos ni stock.

### 5. Corrección y restauración

POST `/corrections/preview`:

```json
{
  "scope": {"kind": "reservation", "id": "reservation-B"},
  "receiptId": "reservation:reservation-B:P-C",
  "action": "void_nonexistent",
  "reason": "El cobro no existió; se verificó la evidencia",
  "evidenceRef": "comprobante-verificado",
  "historical": true,
  "restorations": [
    {"receiptId": "reservation:reservation-B:P-D", "documentId": "reservation-B:F1", "amountCents": 6000000}
  ]
}
```

Acciones: `change_method` (requiere `newMethod`), `void_nonexistent`, `restore_coverage`. Restauraciones requieren evidencia de liberación por NC para ese receipt/documento y disponibilidad actual.

Respuesta contiene `previewHash`, `request`, `before`, `obligations:[{documentId,uncoveredCents}]`, `debtAfterCents`, `closingRevisionRequired`. POST `/corrections` usa el mismo envelope `{operationId,previewHash,request}` que la reserva de factura.

Turno cerrado exige `historical:true`, permiso histórico y evidencia del esperado original. La revisión preserva el cierre y conteo originales; `physicalCountCents:null` se muestra **“No verificable”**, nunca `$0`.

NC/reutilización existentes sin payment IDs verificables bloquean la adopción/corrección automática. El prorrateo no se reemplaza por coincidencias de importe.

## Conflictos y errores

| HTTP | Código | Tratamiento UI |
|---|---|---|
| 401 | Autenticación de la aplicación | Iniciar sesión; conservar UUID si había una operación. |
| 403 | `FORBIDDEN` | No ofrecer confirmación; no reenviar actor/permisos del cliente. |
| 404 | `NOT_FOUND` | Refrescar origen/operación. |
| 409 | `PREVIEW_STALE` | Refrescar scope y generar otra preview; no confirmar el plan viejo. |
| 409 | `FUNDS_UNAVAILABLE`, `DOCUMENT_CAPACITY` | Fondos/capacidad ya utilizados; mostrar distribución vigente. |
| 409 | `IDEMPOTENCY_CONFLICT`, `DUPLICATE_CLAIM` | No cambiar UUID a ciegas; consultar operación existente. |
| 409 | `FISCAL_OPERATION_PENDING`, `DOCUMENT_CLAIMED` | Recuperar operación previa, no emitir de nuevo. |
| 409 | `DOCUMENT_ALREADY_ISSUED` | No facturar otra vez para registrar un cobro. |
| 409 | `FUNDS_MUST_REMAIN_RESERVED` | Recuperación fiscal obligatoria; no liberar saldo. |
| 409 | `NEW_COLLECTION_RECONCILIATION_REQUIRED` | Conciliar la intención de dinero nuevo; no descartarla. |
| 409 | `SHIFT_CLOSED`, `HISTORICAL_CONFIRMATION_REQUIRED` | No redirigir al turno actual; revisar caso histórico. |
| 409 | `HISTORY_REVIEW_REQUIRED`, `CLOSING_SOURCE_CHANGED` | Revisar evidencia histórica, sin inventar conteo o vínculos. |
| 409 | `SCOPE_NOT_ADOPTED`, `PAYMENT_LINK_AMBIGUOUS`, `SOURCE_CHANGED` | Conciliar vínculos por ID; no fallback a crédito cero. |
| 409 | `MANAGED_SCOPE_USE_FUNDING` | La ruta legacy está bloqueada para ese folio; usar el motor. |
| 409 | `CONCURRENT_CHANGE` (`retryable:true`) | Reintentar con el mismo UUID, nunca una nueva emisión. |
| 422 | `INVALID_REQUEST`, `FUNDING_TOTAL_MISMATCH`, `COLLECTION_EXCEEDS_DEBT` | Corregir solicitud/importes, no confirmar. |
| 503 | `INVENTORY_ADAPTER_REQUIRED` | No emitir hasta configurar el cierre transaccional. |
| 500 | `INTERNAL_ERROR` con operationId | Consultar estado y recuperar la misma operación. No suponer liberación. |

## Ejecutar la demo y las pruebas

Desde el checkout aislado, con las dependencias existentes:

```sh
bash script/test-funding-isolated.sh
node --import tsx demo/funding/server.ts /tmp/folio-funding-isolated/socket 8099
```

El primer comando prepara un clúster local sin escucha de red, autenticación host rechazada y DB `folio_funding_synthetic`. No usa `DATABASE_URL`. La instalación sintética verifica nombre de DB y conexión Unix.

Demo:

- GET `/api/demo/scenarios`: siete planes sintéticos A/B/C, reutilización y SPA existente/mixto/post-CAE.
- POST `/api/demo/faults` con `{"point":"after_cae"}` o `{"point":"finalize_after_cash"}`: fallo de una sola ejecución, sólo en este servidor de demo.
- GET `/api/demo/health`: indica `synthetic:true`, `productionEnabled:false`, `emitter:"fake"`.
- Tras fallo/refresh, abrir la operación persistida del historial y usar “Recuperar esta operación”.
- Reiniciar el proceso no reseedea dinero ni elimina holds; no hay botón público de borrado/reset.

No ejecutar scripts generales de migración ni suites contra `DATABASE_URL` para probar esta demo.
