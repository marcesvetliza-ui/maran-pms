# Folio y SPA: precisiones previas a la demo

**Estado:** diseño implementado en un módulo aislado y demo PostgreSQL sintética; ver `docs/folio-funding-api.md` y `docs/folio-funding-verification.md`. No está habilitado en la aplicación operativa y no se migraron datos reales.

Complementa `docs/folio-payment-correction-design.md`. Misma rama `design/folio-payment-correction` y base de main remoto. Sin Revenue, piloto, merge ni despliegue a main.

## 1. Decisiones que regirán la implementación

1. Un cobro tiene identidad propia y un solo saldo financiable compartido entre todos los documentos.
2. Liberar cobertura por NC no crea otro cobro. Restaurarla o reaplicarla mueve disponibilidad del mismo cobro.
3. Las rectificaciones conservan el cierre original y su conteo; agregan una revisión financiera, nunca una apertura de turno ni una devolución simulada.
4. Folio y SPA usarán el mismo motor de fondos, con adaptadores de sus tablas. No dos calculadoras de crédito que puedan gastar el mismo dinero.
5. La demo utilizará datos sintéticos, almacenamiento separado y emisor simulado; sin credenciales ARCA ni conexión a producción. La integración con tablas operativas requiere la aprobación y las pruebas posteriores.

Los nombres de tablas, servicios y endpoints siguientes son **propuestos**, no capacidades ya implementadas.

## 2. Identidad del dinero y garantía contra doble utilización

### 2.1 Registros propuestos

| Registro | Identidad y contenido mínimo |
|---|---|
| `financial_receipts` | ID interno, `owner_type` (reserva/spa), owner ID, source payment ID, importe efectivo en centavos, moneda, método actual, versión y estado. UNIQUE(owner_type, source_payment_id). Referencia al pago original; no duplica el ingreso. |
| `financial_operations` | Operation UUID único, tipo, scope, actor de sesión, motivo/evidencia, fingerprint, versión de preview, estado, factura reclamada, resultado. Idéntica solicitud devuelve ese resultado; contenido diferente con el mismo UUID = conflicto. |
| `payment_applications` | Receipt ID, documento destino, monto en centavos, operación y estado `held/applied/reversed`. Única clave de idempotencia por operation ID + application key. El documento destino debe pertenecer al scope autorizado. |
| `payment_application_events` | Historial inmutable: reserva, aplicación, liberación por NC, restauración, retiro y reversión. Fuente documental, evento revertido, secuencia y before/after. Un evento no puede revertirse o aplicarse dos veces. |
| Vínculos de Caja | Receipt ID → movement ID, con rol original/reemplazo/rectificación. Vínculos explícitos; no inferir por importe. Payment ID se interpreta con su tipo de origen, no como ID universal entre tablas. |

Los agregados son proyecciones verificables de eventos. No se usa un JSON de frontend como saldo autorizado ni se convierte un snapshot agregado por método en una lista inventada de payment IDs.

Un movimiento de Caja de origen no puede respaldar dos receipts: vínculo de origen único por cash movement ID. Los reemplazos por corrección conservan el mismo receipt. Si el histórico presenta a la vez un cobro por factura y otro por payment sin poder demostrar cuál representa el ingreso real, no se importan ambos como fondos: el scope queda en revisión.

La cobertura documental se distingue del pago operativo: un Voucher/Cierre SPA y la factura posterior pueden representar la misma obligación de la misma cuenta, no dos ventas que consuman dos veces ese cobro. Se conserva una única aplicación económica con sus representaciones documentales; el comprobante no fiscal de cierre no crea otro receipt ni una segunda aplicación monetaria. “Libre” significa disponible para aplicación documental dentro del scope verificado, no crédito libre para gastar en otros servicios.

### 2.2 Ecuaciones y controles

Para cada cobro real, en centavos:

**importe efectivo = aplicado + reservado pendiente + libre**.

Todos los términos son no negativos. Una NC cambia la distribución, no el importe efectivo. Una anulación por cobro inexistente reduce ese importe a cero, retirando en el mismo commit todas sus aplicaciones/reservas y registrando las obligaciones que dejan de estar cubiertas.

Para cada documento:

**aplicado + reservado no puede superar su capacidad de cobertura**.

Capacidad autorizada neta y capacidad de un borrador reservado son conceptos separados; el borrador sólo puede consumir su propia capacidad reclamada. NC/ND deben actualizar aplicaciones y capacidad en la misma operación de conciliación, con la regla de prorrateo existente, sin hacer quedar una cobertura mayor que el neto.

Garantías a implementar:

- Bloquear la fila del receipt y releer su versión antes de reservar o aplicar. Reservar X sólo si libre >= X; disminuir libre/aumentar reservado atómicamente.
- Finalizar convierte `held` a `applied`: no vuelve a descontar libre. Abortar con resultado fiscal definitivamente no autorizado devuelve la reserva una sola vez.
- UNIQUE de operación, aplicación y reversión; restricciones de montos/counters no negativos. Verificación diferida en PostgreSQL de sumas de aplicaciones contra sus receipts y documentos; no basta un CHECK sobre una suma calculada sólo en JavaScript.
- Bloquear receipts y documentos afectados por IDs en orden estable; los endpoints genéricos de pagos no pueden eludir el motor. El cierre de turno y los escritores financieros deben respetar el mismo contrato de locks antes del rollout.
- No liberar una reserva sólo porque venció un timeout: si ARCA pudo autorizar, queda retenida hasta consultar el comprobante y conciliar el resultado.
- Corrección de medio no cambia importe efectivo. Mantiene aplicaciones y actualiza la proyección de método mediante historial, sin un segundo receipt.

### 2.3 Prorrateo, histórico y adopción

Se conserva la liberación proporcional existente: NC 90.000 / F1 270.000 libera 60.000 de P-D y 30.000 de P-C. Se registra la liberación por NC/pago/evento de origen una sola vez.

Las aplicaciones posteriores tienen secuencia y origen propios. No son pagos anteriores a la NC y no vuelven a liberarse al recalcular esa NC. Una nueva NC/ND debe evaluar la versión vigente y su propio evento; nunca reejecutar movimientos históricos.

No se cambian en esta etapa la fórmula ni las reglas de redondeo vigentes. Una discrepancia histórica o de centavos no se “arregla” emparejando montos: se muestra y bloquea la operación que no conserva importes hasta su conciliación.

El motor explícito no puede convivir con un segundo saldo gastable obtenido del helper anterior:

- adopción por scope completo, no por una fila suelta;
- reconstrucción inicial sólo desde IDs/referencias válidas, intenciones conciliadas y eventos comprobables;
- marcar `funding_version=explicit_v1` sólo al completar la conciliación inicial;
- para ese scope, toda lectura, emisión, reaplicación, corrección y recuperación usa el motor nuevo; los caminos legacy rechazan la escritura;
- un scope ambiguo queda en revisión, no “adoptado” parcialmente.

## 3. Cómo se registra la restauración de cobertura

### 3.1 Ejemplo antes de refacturar

F1=270.000, P-D=180.000 débito y P-C=90.000 crédito, ambos vinculados documentalmente a F1. NC1=90.000 por el origen SPA.

| Paso | P-D aplicado a F1 | P-D libre | P-C aplicado a F1 | P-C libre |
|---|---:|---:|---:|---:|
| Antes de NC1 | 180.000 | 0 | 90.000 | 0 |
| NC1 conciliada | 120.000 | 60.000 | 60.000 | 30.000 |

Esto deriva del prorrateo de la factura, no de atribuir un pago al alojamiento o al SPA.

Si el operador prueba que P-C nunca existió y confirma conservar P-D cubriendo F1 neta:

1. Previsualización muestra deuda 90.000 y el plan de aplicaciones.
2. Operación única: retirar los 60.000 aplicados y 30.000 libres de P-C; anular su evidencia de ingreso; contraasentar su pago en folio; importe efectivo de P-C=0.
3. En la misma confirmación, evento `restore_coverage` mueve 60.000 libres de P-D a F1. Guarda receipt ID, F1, NC1, operación, importe, actor y motivo.
4. Resultado P-D: aplicado F1=180.000, libre=0, reservado=0; P-C=0. No movimiento nuevo de Caja.
5. La reserva tiene 90.000 pendientes de cobro. El origen SPA tiene 90.000 pendientes de emisión fiscal, pero no se le atribuye la deuda sin una asociación explícita pago–cargo. Sólo un cobro real posterior puede saldar la deuda de la reserva.

El evento de restauración es una aplicación nueva sobre un destino explícito, no un pago nuevo ni un cálculo de “pago que coincide”. **No se guarda como reaplicación de F1 hacia sí misma en el JSON legacy**, donde la NC anterior volvería a prorratearlo.

Si dos operadores intentan gastar esos mismos 60.000:

- si gana restauración: otra factura ve libre=0;
- si gana la reserva para F2: restauración recibe 409 y debe volver a mostrar el impacto;
- no hay un instante confirmado en que F1 y F2 tengan disponibles los mismos 60.000.

### 3.2 Si F2 ya reutilizó el crédito

P-D está aplicado 120.000 a F1 y 60.000 a F2; P-C, 60.000 a F1 y 30.000 a F2. Todo se verifica por application IDs.

Al retirar P-C faltan 60.000 a F1 y 30.000 a F2. El motor conserva las aplicaciones de P-D. Un nuevo cobro real de 90.000 puede distribuirse expresamente 60.000/30.000 a esos documentos, sin emitir F3.

No se restaura P-D a F1 automáticamente ni se desfinancia F2 en silencio. Si falta el detalle de aplicación o hay autorización pendiente, se bloquea la corrección automática hasta resolverlo.

## 4. Rectificaciones de turnos cerrados

### 4.1 Registro y lectura del cierre

Propuesta `cash_shift_rectifications`:

- id, shift ID, closing summary ID original y hash/version del original;
- revision number secuencial por turno, previous revision ID;
- operation ID y efectos por receipt/movement ID;
- tipo: reclasificación o retiro de cobro inexistente; nunca devolución real implícita;
- snapshot del esperado base verificado, delta por medio y esperado resultante;
- conteo físico original si existe evidencia separada, o `unknown`; referencia al dato original sin reinterpretarlo;
- motivo, evidence reference, actor/aprobador de sesión y timestamps;
- resultado aplicado/revertido por otra operación vinculada, sin editar el evento original.

UNIQUE(shift ID, revision number) y clave de efecto por operation ID + shift ID. Un reintento no crea otra rectificación. Una nueva corrección legítima usa otra operación y nueva revisión.

El cierre original no se modifica. Los reportes muestran:

1. cierre originalmente registrado;
2. rectificaciones y documentos afectados;
3. esperado rectificado = esperado base + deltas aplicados;
4. conteo físico original, cuando es demostrable, y diferencia rectificada.

`cash_closing_summaries.total_cash` mezcla conteo positivo y esperado según el cierre actual. No sirve para inventar un conteo separado. Se conserva su valor literal; si no hay evidencia suficiente, se muestra “conteo no verificable” y se bloquea el ajuste automático de diferencias físicas.

Base esperada: reconstrucción por movimientos identificados y estado histórico verificable al cierre, no el total_cash ambiguo. Si hubo modificaciones antiguas sin rastro que impiden esa reconstrucción, revisión manual documentada.

### 4.2 Efectos concretos

| Acción | Delta esperado del turno propietario | Dinero físico / cierre original |
|---|---|---|
| Corregir 90.000 de crédito a efectivo | Crédito -90.000, efectivo +90.000; total neto 0 | No se recibe otra vez ni se cambia lo contado. |
| Retirar 90.000 nunca cobrados en crédito | Crédito -90.000; total -90.000 | No se crea egreso ni devolución al huésped. |
| Restaurar 60.000 de cobertura o refacturar pagos existentes | Delta 0 | No modifica Caja ni revisa el conteo. |

La revisión está vinculada a los movimientos invalidados/reemplazados. Las proyecciones usan una sola fuente de efectos: los movimientos efectivos ya corregidos y el snapshot del cierre + delta deben reconciliar; **no sumar otra vez el delta a movimientos que ya lo incorporan**.

Si existía evidencia de efectivo contado 90.000 y esperado original efectivo 0 por el error de clasificación, rectificar esperado a 90.000 explica la diferencia, sin cambiar el conteo. No se altera el saldo inicial de un turno posterior automáticamente.

### 4.3 Confirmación y concurrencia

Un supervisor con permiso específico confirma preview de reparación histórica. Se verifica estado y versión del turno, pagos/aplicaciones, documento, cierre original y revisión previa.

En una sola transacción local: aplicar corrección de pago, movimientos efectivos de Caja, contraasiento/nota de folio cuando corresponda, aplicaciones, rectificación del cierre y auditoría. Falla en cualquier parte = rollback de todo.

Turnos afectados se bloquean en orden estable antes de los recursos monetarios/documentales, coordinado con cierre. Si el turno se cierra entre preview y confirmación, la confirmación normal se rechaza: no se convierte silenciosamente en reparación histórica.

No se crea otro turno, no se reabre el cerrado y no se escribe en la Caja actual para “compensar” un error antiguo. No hay acción masiva de reparación sin previsualización por lote y reversión exacta.

## 5. Motor compartido para SPA y Folio

### 5.1 Servicio propuesto

`server/billing/paymentFundingService.ts`, con adaptadores propuestos para `reservation` y `spa_account`.

Contrato:

- `previewFunding(scope, recipient, sourceSelection, receiptApplications, newCollection)` calcula efectos sin escrituras;
- `reserveFunding(operationId, previewVersion)` valida versiones y crea holds durables por receipt;
- `finalizeFunding(operationId, authorizedInvoiceId)` aplica esos holds y vincula el documento en una transacción;
- `resumeFunding(operationId)` consulta estado fiscal y continúa esa misma operación;
- `abortFunding(operationId)` sólo libera holds ante un resultado fiscal definitivamente abortable.

Dos modos explícitos:

- **`existing_only`**: factura con fondos existentes y verificados. Prohibido insertar pagos, ingresos/egresos de Caja, otro pago de folio o un turno nuevo.
- **`existing_and_new`**: aplica fondos existentes y registra sólo el faltante confirmado. Cada fila nueva tiene identidad operation ID + collection row ID para no duplicarse en un retry.

El modo lo valida el servidor contra recibos/obligaciones; no es un booleano del navegador que habilite saltarse Caja. Un solo finalizador es dueño de las escrituras de liquidación.

### 5.2 Qué cambia en el circuito SPA existente

Comprobado en esta base:

- `spa_payments` pertenece a `spa_accounts`, pero no tiene invoiceRef por pago.
- `sales_invoices.spa_account_id` reclama el folio; `spa_accounts.invoice_id` vincula su factura.
- El emisor de billing rechaza `has_payments` antes de ARCA.
- `POST /api/spa/accounts/:id/link-invoice` también rechaza pagos existentes; su camino actual inserta un spa_payment, puede insertar Caja y registra un pago de folio.
- Por eso no basta quitar el bloqueo de la pantalla, ni el del link: hay que separar la financiación existente del cobro nuevo y reservarla antes de emitir.

El adaptador SPA leerá pagos activos por ID, su cuenta propietaria, movimientos de folio `source_type='spa_payment'` y vínculos de Caja persistidos. Si falta el vínculo, no lo completa por nombre, importe, fecha o nota libre.

Flujo nuevo:

1. “Facturar cobros existentes” muestra receptor de la base, condición IVA real, cargos e IDs de pagos disponibles.
2. Motor valida propiedad, capacidad fiscal, cobertura y aplicaciones/holds previos. Una cuenta ya facturada no se factura otra vez por tener pagos; requiere el circuito fiscal de NC cuando corresponda.
3. Se reclama invoice + financiación antes de ARCA con snapshot de receptor/ítems/total/métodos/aplicaciones. Los métodos se construyen de esos pagos, no se inventan desde A/B.
4. ARCA opera fuera de la transacción larga. Hasta conciliar, esos fondos siguen reservados.
5. `finalizeFunding` vincula factura y aplicaciones. En `existing_only` mantiene los mismos spa_payment IDs, movimientos de Caja y pagos del folio. Agrega historia fiscal, no otro cobro.
6. El endpoint legacy de link pasa a ser adaptador del finalizador según la operación reclamada; no conserva un segundo camino que cree un pago completo incondicionalmente. El escritor genérico de billing tampoco genera Caja para una factura administrada por este motor.
7. Cuenta pagada y cerrada con comprobante no fiscal puede facturarse, si no tiene cobertura fiscal previa, sin reabrir turno/atención ni repetir stock. Conserva el comprobante original y agrega el vínculo fiscal.
8. Cuenta cerrada/facturada con la misma operación devuelve el resultado; con otra factura/capacidad agotada devuelve conflicto.

Cargo a habitación no es dinero cobrado en SPA: sigue siendo transferencia al folio de Recepción. No genera una factura de cobro directo SPA duplicada. CC, gift vouchers y retenciones necesitan su adaptador no monetario autorizado; se excluyen del primer recorrido de dinero real, no se convierten a efectivo.

### 5.3 Ejemplo SPA del informe

Cuenta=95.000, spa_payment S1=débito 5.000 y S2=efectivo 90.000, con sus movimientos verificados y sin aplicaciones fiscales previas:

| Antes | Después de facturar con `existing_only` |
|---|---|
| 2 pagos activos, total 95.000 | Los mismos 2 pagos, total 95.000. |
| Caja ya registrada 95.000 | Mismos movimientos/turnos, delta 0. |
| Folio ya pagado | Mismos pagos de folio; saldo 0. |
| Sin factura fiscal | Una factura 95.000, detalle débito 5.000 + efectivo 90.000, financiada por S1/S2. |
| Cobros libres para facturar | Aplicaciones confirmadas; no disponibles para otra factura simultánea. |

Si sólo estaban cobrados 5.000, la preview muestra 90.000 de dinero nuevo. El modo mixto aplica S1 y crea exclusivamente el cobro restante confirmado, una sola vez. No vuelve a cobrar 95.000.

## 6. Pruebas específicas y límite de la demo

Además de la matriz previa:

- restaurar vs reservar simultáneamente los mismos 60.000: sólo una gana, nunca 120.000 de aplicaciones sobre 60.000 libres;
- reservado→aplicado no descuenta el saldo dos veces; replay no crea otra aplicación;
- anular con F2 ya emitida deja obligaciones 60.000/30.000 sin pagos fantasma;
- NC/ND concurrente cambia versión y obliga a nueva preview; no relibera eventos anteriores;
- cierre antiguo con total_cash ambiguo no inventa conteo; revisión no cambia original;
- retry y corrección de una revisión conservan cadena y netos, sin sumar delta dos veces;
- SPA 95.000 ya cobrado genera una factura y cero nuevos pagos, Caja, pagos de folio, turnos o descuentos de stock;
- SPA parcialmente pagado crea sólo 90.000, con replay y fallo post-CAE;
- dos emisores SPA, o uno de Folio y otro que intenta el mismo receipt, no gastan fondos compartidos;
- link antiguo/generic writer no eluden claims ni crean otro cobro;
- cuenta SPA cerrada no fiscal mantiene atención/stock y comprobante original;
- resultado fiscal ambiguo conserva holds hasta recuperación; no basta un timeout;
- permisos y sesión reales, no sólo mocks de UI.

La demo mostrará estado de cada cobro (aplicado/reservado/libre), revisiones de cierre, operaciones/reintentos y diferencias antes/después. Casos A/B/C de Folio y SPA existente/mixto, con IDs sintéticos y emisor fake no conectado a ARCA.

Una demo en memoria puede demostrar el recorrido, pero **no acredita** exclusión mutua de PostgreSQL ni atomicidad real. Esas garantías requieren pruebas PG en una base descartable y aislada, además de rutas con autorización real, antes de habilitar el circuito operativo.
