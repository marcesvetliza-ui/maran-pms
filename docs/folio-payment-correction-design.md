# Folio: diagnóstico y diseño de corrección financiera

**Estado: enfoque aprobado para avanzar en rama y demo; no implementado.** Las precisiones de cierre, restauración y motor compartido SPA están en `docs/folio-payment-funding-rectifications.md`. No ejecutar reparaciones ni emitir comprobantes a partir de estos documentos.

## 1. Base y alcance

- Rama: `design/folio-payment-correction`, creada desde el `main` de GitHub actualizado, commit `9630a06e217da3f3276fb8536dd5a1b39ff8b73f`.
- Checkout aislado: `.local/folio-correction-design`. El `main` del workspace no se cambia ni se fusiona con esta rama.
- El `main` local diverge del remoto. Los hallazgos siguientes se verificaron contra el remoto indicado, no contra el diagnóstico anterior del workspace.
- Sólo diagnóstico, recorrido y diseño de Folio de reservas. Sin implementación, migraciones, cambios de datos, Revenue, piloto, modificaciones de SPA ni despliegue.
- Evidencia: código, esquema y pruebas existentes, más los informes aportados. No se consultó la base de producción ni se verificó el SHA servido. Las capturas muestran modo ficticio; no prueban autorización fiscal real.
- Los identificadores P-D, P-C, M-D, M-C, F1, NC1 y F2 siguientes son simbólicos. No son identificadores descubiertos en una base.

## 2. Qué relaciones existen realmente

| Relación | Evidencia en main | Qué permite / qué no permite |
|---|---|---|
| Cargo → reserva | `charges.reservationId` | Propiedad operativa del cargo. No identifica al pago que lo financió. |
| Pago → reserva | `payments.reservationId` | Cobro de esa reserva, no de un cargo específico. |
| Pago → factura original | `payments.invoiceRef`, JSON con ID/referencia fiscal | Vínculo histórico explícito si es válido. No debe reemplazarse al refacturar. |
| Factura → pago reclamado | `sales_invoices.paymentId` | Propiedad durable de un pago en los circuitos que la usan. No representa todos los pagos de una factura dividida. |
| Factura → cargos y montos | `sales_invoices.sourceChargeIds` y `sourceChargeAmounts` | Capacidad fiscal de cada cargo; las NC/ND usan composición por origen. No es una aplicación pago→cargo. |
| Factura → métodos e importes | `cashFormaPago` y `cashFormaPagoDetalle` | Snapshot del comprobante. El detalle agregado por método no identifica qué payment ID originó cada importe. |
| Reutilización → pagos concretos | `creditReapplicationIntent.payments/ordinaryAdvances`, con payment ID e importe; `invoiceRef.reapplications` | Evidencia de aplicaciones específicas cuando se conciliaron. Estado pendiente y estado completado no son equivalentes. |
| Caja → pago | `cash_movements.payment_id` | En la creación atómica de pagos de reserva se persiste el vínculo. `source_type='reservation'` y `source_id=reservationId` no identifican por sí solos un pago. |
| Caja → factura directa | `source_type='comprobante'`, `source_id=invoiceId` | Otro circuito: puede existir sin fila en `payments`. No debe confundirse con Caja ligada a payment ID. |
| Folio → pago y Caja | movimiento `type='payment'`, `source_type='payment'`, `source_id=paymentId`, `cash_movement_id` | Rastro explícito. Una corrección debe conservarlo y explicar cualquier sustitución del movimiento de Caja. |
| Caja → turno | `cash_movements.shift_id` | Turno propietario real. No reasignar al turno abierto actual por comodidad. |
| Anulación de movimiento de folio | `voidedMovementId`, motivo y actor | Permite contraasiento vinculado al original. No es evidencia de una devolución física. |
| Pago → solicitud | `paymentRequestId` único y fingerprint | Idempotencia de creación; no sustituye la identidad de una corrección. |

**No se encontró una aplicación general payment ID → charge ID en este circuito.** Ni igualdad de importe, ni método, descripción, fecha, cercanía temporal u orden de filas prueban esa relación. Una transferencia desde SPA prueba el origen del cargo, no quién lo pagó.

Para identificar una factura se admiten ID persistido o clave fiscal explícita y unívoca tipo/PV/número. Para Caja se exige payment ID, vínculo de folio o propiedad documental explícita según el circuito. Falta, duplicación, JSON inválido o referencias contradictorias implican revisión, no búsqueda por importes.

## 3. Hallazgos comprobados

### 3.1 La NC no anula el cobro

`shared/reservationFolio.ts`, `invoiceReleaseRatio/getAvailableReservationAdvancePayments`: NC parcial de 90.000 sobre factura de 270.000 libera 1/3 de cada pago histórico activo. Conserva el vínculo original y resta reaplicaciones según la regla existente. Una NC no prueba que el dinero no existió.

**Se conserva esa regla; no se reemplaza por “tomar el pago que coincide con el cargo”.** La disponibilidad y las aplicaciones posteriores deben quedar separadas y auditables.

### 3.2 Guardas de reutilización insuficientes para este nuevo caso

`server/billing/reservationCreditReconciliation.ts`: `assertPaymentHasNoUnresolvedCreditHold` bloquea aplicaciones pendientes de conciliación; no equivale a una evaluación completa de dependencias ya conciliadas. Corregir o anular un pago con aplicaciones completadas exige enumerar los documentos afectados y su cobertura, no sólo aprobar esa guarda.

### 3.3 Anulación actual no distingue cobro inexistente de devolución

`server/db-storage.ts`, `voidReservationPaymentAtomic`: para un ingreso monetario ligado a pago crea un egreso `payment_void`, conserva el ingreso y revierte el movimiento del folio. Esa representación no debe reutilizarse sin más para declarar que un cobro jamás existió.

`server/routes/reservations.ts`: el endpoint de anulación limita al día actual y a reservas no bloqueadas. No es una reparación histórica autorizada. Los endpoints genéricos PATCH/DELETE deben incluirse en el control de vías de escritura antes del rollout: actualizar `req.body` o borrar el pago no puede eludir el nuevo circuito.

### 3.4 El editor de medio de factura existente no cubre este caso

`server/billing/reservationInvoicePaymentEdit.ts`, llamado desde PATCH `/api/billing/invoices/:id`: opera sobre Caja con origen `comprobante`, no sobre payments/folio de una prefactura dividida. Rechaza turnos cerrados, reconstruye el ingreso usando el total de factura y no ofrece el plan por payment ID requerido aquí.

No reutilizarlo para pagos divididos, crédito+dinero nuevo o para trasladar cobros a otro turno. La documentación de alcance “un medio” no constituye una prueba de la composición real.

### 3.5 Resumen incoherente con filas ocultas

`client/src/components/PrefacturaDialog.tsx`: el resumen calcula `totalPayments` desde las filas preparadas aun cuando `selectedBalance` es cero; muestra “Sobrepago”. En cambio, al enviar, `currentCollectionRows=[]` y no crea pagos nuevos cuando la selección ya está cubierta.

La inconsistencia visual está comprobada. No demuestra por sí sola un segundo cobro.

### 3.6 Turno cerrado y efectivo contado

`cash_closing_summaries` conserva totales y `total_cash`; el cierre en `server/db-storage.ts` usa efectivo contado si es mayor que cero y, en caso contrario, el total calculado. Ese campo histórico no prueba por sí solo un conteo físico separado.

Una corrección histórica debe preservar exactamente el cierre original y registrar una revisión: esperado corregido, diferencias y evidencia del conteo cuando exista. No convertir un total calculado en “efectivo contado”, ni inventar un conteo cero.

## 4. Modelo propuesto: corregir hechos, no adivinar asociaciones

### 4.1 Tres acciones diferentes

1. **Corregir medio de un cobro real:** cambia clasificación del dinero ya recibido; no aumenta ni disminuye cobros ni facturación.
2. **Anular registro de cobro inexistente:** retira evidencia financiera incorrecta; aumenta la obligación de cobro que corresponda. No representa entrega de dinero al huésped.
3. **Refacturar conservando pagos:** usa capacidad fiscal liberada por NC y aplicaciones verificadas; no crea Caja si no hay dinero nuevo.

Devolución real, cambio de importe, cambio de titular, cambio a CC/voucher, retenciones, pagos distribuidos de grupos y corrección de origen SPA quedan fuera de la acción simple. Se muestran con su dependencia y se derivan al circuito competente, sin tratarlos como efectivo.

### 4.2 Previsualización obligatoria

Desde Folio → pago concreto → “Corregir registro”, el servidor devuelve:

- ID, importe, método actual, referencias y condición del pago;
- movimientos de Caja ligados y turno propietario;
- movimiento de folio original;
- facturas originales, NC/ND, aplicaciones conciliadas y reservas pendientes;
- cobertura fiscal y financiera separada antes/después;
- ajustes de Caja, folio y cierre; lista de documentos con datos de pago afectados;
- motivos de bloqueo, versión de datos y hash de la propuesta.

El operador no confirma un cargo por importe coincidente. Selecciona el pago por su identidad y verifica referencia/evidencia del cobro. Si falta un vínculo, la UI lo declara; cualquier asociación documentada requiere una acción de conciliación separada, con evidencia y autor, no un emparejamiento automático.

### 4.3 Identidad y aplicaciones explícitas

Propuesta de persistencia limitada a este circuito, todavía sin migración:

- **Intento/corrección financiera**: operation ID único, tipo, actor de sesión, permiso, motivo, evidence reference, estado, payment IDs, before/after snapshots, preview hash, turnos y documentos afectados, resultado y reversal-of opcional.
- **Eventos de aplicación de pago**: payment ID, factura destino, monto, evento de origen (pago/NC/reaplicación/restauración/anulación), operación, secuencia, estado y relación con evento revertido. Montos en centavos.
- La liberación por NC mantiene el prorrateo vigente pero conserva el evento y su conjunto de pagos/aplicaciones de origen. Las aplicaciones posteriores no vuelven a liberarse retrospectivamente por una NC anterior.
- Una restauración explícita de cobertura de la factura original no se guarda como `invoiceRef.reapplications` hacia sí misma: la regla actual volvería a descontarla con el ratio de esa misma factura. Se registra como evento posterior a la NC, sin ciclo.
- Importar el histórico sólo desde referencias y aplicaciones verificables. Los snapshots agregados por método no permiten inventar payment IDs. Si no se puede reconstruir, bloquear la reparación automática y presentar el faltante.
- Este registro es necesario para el caso de anulación con NC/reutilización; no basta con editar `payments.method/status`. Debe integrarse a las lecturas de disponibilidad, deuda y emisión antes de habilitar escrituras.

Restricciones: cada aplicación tiene dueño explícito; la suma de aplicaciones activas no excede el pago activo; no hay crédito libre si tiene una reserva o una restauración confirmada; un pago anulado no financia ninguna obligación. Liberación, dinero recibido, facturación y saldo operativo son magnitudes distintas.

### 4.4 Documentos y PDFs

CAE, tipo, PV, número, receptor, ítems, total y composición fiscal de un comprobante autorizado no se alteran por una corrección de cobro.

El snapshot histórico de métodos se conserva. La vista muestra “original” y “corrección financiera” con fecha/actor, y una constancia vinculada; un PDF actualizado debe identificarse como copia con aclaración, nunca reemplazar silenciosamente al emitido. Las facturas posteriores usan aplicaciones confirmadas y medios corregidos.

Si se requiere reemplazar fiscalmente un documento, se usa NC/refacturación autorizada como operación separada; no se genera una NC automáticamente por elegir “corregir medio”.

## 5. Recorrido y ejemplo de 180.000 + 90.000

### 5.1 Estado inicial común

Cargo Alojamiento=180.000; cargo SPA=90.000; F1=270.000 con origen fiscal por ambos cargos. P-D=180.000 débito y P-C=90.000 crédito, ambos vinculados a F1. M-D/M-C son sus ingresos de Caja, si esos vínculos se verifican.

No se afirma que P-D pagó el alojamiento ni P-C el SPA. El operador puede haberlo pretendido, pero no existe esa aplicación general en el esquema.

| Momento | Facturación neta | Pendiente fiscal | Cobros registrados activos | Deuda operativa |
|---|---:|---:|---:|---:|
| F1 emitida y pagos registrados | 270.000 | 0 | 270.000 | 0 |
| NC1 de 90.000 sobre SPA, sin anular pagos | 180.000 | 90.000 | 270.000 | 0 |

Después de NC1, la regla existente libera 60.000 de P-D y 30.000 de P-C. No es devolución ni nuevo ingreso.

### Caso A — el cobro fue real, pero P-C se recibió en efectivo

**Supuesto ilustrativo que requiere confirmación; no está probado por el informe.**

1. El operador abre P-C por ID y elige “Corregir medio de un cobro real”.
2. Confirma efectivo, motivo y evidencia. No vuelve a ingresar 90.000 como cobro.
3. Preview: P-C conserva ID, importe y propiedad documental; Caja reclasifica 90.000 crédito→efectivo en el turno dueño; saldo y facturación no cambian.
4. Con autorización, operación atómica: invalida M-C como registro mal clasificado, conserva su historial y crea el reemplazo ligado a la misma corrección/P-C. No crea un egreso de devolución. El movimiento original de folio se conserva; la corrección de medio se registra sin sumar un segundo pago.
5. Resultado antes de NC: F1 sigue en 270.000; pagos activos 180.000 débito+90.000 efectivo; Caja activa neta 270.000; deuda 0; factura original y constancia distinguen dato emitido de dato corregido.
6. Si NC1 ya existe, sigue pendiente fiscal 90.000 y deuda 0. Refacturación por el caso C libera/aplica 60.000 débito+30.000 efectivo según el prorrateo, no “90.000 efectivo porque coincide con SPA”.
7. Si F2 ya reutilizó crédito, se enumeran todas sus aplicaciones. Una operación conciliada puede corregirse sólo con plan completo y constancias sobre documentos dependientes; no se borran consumos de crédito. Un intento pendiente de autorización/conciliación bloquea la corrección hasta resolver su estado.

No modificar pagos hermanos de una división. Si una sola fila representa varios instrumentos reales, una conversión a división necesita un plan explícito que conserve la suma y las aplicaciones; no inventar ese reparto.

### Caso B — P-C se registró, pero ese dinero nunca ingresó

1. El operador elige P-C → “Anular registro de cobro inexistente”, declara que no hubo devolución y aporta motivo/evidencia.
2. Preview verifica M-C y dependencias. Caja invalida el ingreso ficticio; no registra un egreso físico. Folio agrega contraasiento de -90.000 al pago original y P-C queda anulado, no borrado.
3. Inmediatamente después, cobros activos=180.000; deuda operativa=90.000.

**Sin NC:** F1 sigue facturada por 270.000; pendiente fiscal=0. Se cobran los 90.000 faltantes contra F1, sin emitir otra factura por lo mismo.

**Con NC1, antes de F2:** neto F1=180.000; SPA pendiente fiscal=90.000. El cálculo histórico mantiene liberación de 60.000 de P-D. No se debe aplicar ese crédito automáticamente a SPA ignorando la cobertura de F1.

Plan recomendado, a confirmar explícitamente por el operador/supervisor:

- conservar P-D completo financiando F1 neta de 180.000;
- restaurar 60.000 de cobertura a F1 desde el crédito liberado de P-D mediante evento explícito posterior a NC1;
- mostrar crédito históricamente liberado=60.000, restaurado/reservado=60.000, libre=0;
- cobrar realmente 90.000 con el medio confirmado y emitir F2 por SPA=90.000.

| Estado B con NC1 | Facturación neta | Pendiente fiscal | Cobros activos | Deuda | Caja activa |
|---|---:|---:|---:|---:|---|
| Anulación y restauración confirmadas | 180.000 | 90.000 | 180.000 | 90.000 | 180.000 débito |
| Cobro real de 90.000 en efectivo y F2 | 270.000 | 0 | 270.000 | 0 | 180.000 débito+90.000 efectivo |

La restauración es una decisión explícita de cobertura de factura, no una asociación por importe de pago a cargo. Si el operador elige otra distribución, debe verla completa: aplicar los 60.000 a F2 requiere además cubrir 60.000 de F1 y 30.000 de F2, total nuevo dinero=90.000. El sistema no presenta “cobrar sólo 30.000 y todo quedó resuelto”.

**Si F2 ya consumió 60.000 de P-D y 30.000 de P-C:** al retirar P-C se pierden 60.000 retenidos en F1 y 30.000 aplicados a F2. Deuda total=90.000, aunque pendiente fiscal=0. Un plan documentado distribuye un nuevo cobro de 90.000 en 60.000 a F1 y 30.000 a F2; no se emite F3 ni una nueva NC sólo para cobrar. Hasta confirmar ese plan se bloquea la anulación automática con crédito reutilizado, mostrando la dependencia.

La anulación y su plan de aplicaciones son una sola confirmación atómica; no dejar aplicaciones activas financiadas por un pago anulado. Si no hay dinero nuevo todavía, el plan registra obligaciones sin cobertura y deuda visible, no inventa un pago.

### Caso C — NC1 y refacturación conservando pagos verdaderos

1. Desde prefactura, seleccionar el cargo SPA con 90.000 de capacidad fiscal restaurada.
2. Mostrar P-D/P-C, liberaciones 60.000/30.000 y sus aplicaciones explícitas a la nueva factura. Permitir revisar y confirmar ese uso.
3. Preview: F2=90.000; crédito aplicado=90.000; nuevo cobro=0; Caja sin cambios.
4. Registrar intención antes de ARCA y reservar aplicaciones/source amounts. Si hay CAE y falla conciliación, reanudar la misma operación/factura.
5. Resultado:

| Objeto | Estado |
|---|---|
| F1 | Original de 270.000, acreditada en 90.000, neta 180.000. |
| NC1 | 90.000 sobre origen SPA; no anula pagos. |
| F2 | 90.000 SPA; detalle 60.000 débito+30.000 crédito, salvo corrección real de medio confirmada. |
| P-D/P-C | Mismos pagos y referencias originales; aplicaciones 60.000/30.000 registradas a F2. No pagos nuevos. |
| Caja | Los ingresos originales activos suman 270.000. Sin ingreso/egreso por refacturar. |
| Folio | Operativo 270.000, cobrado 270.000, deuda 0, pendiente fiscal 0, crédito libre 0. |

Si crédito fue aplicado en otra factura, la selección recibe únicamente disponibilidad libre verificada. No “recuperarlo” borrando la reaplicación anterior.

## 6. Turnos cerrados, reserva cerrada y concurrencia

- Separar estado de reserva de estado del turno de Caja. Recepción no reabre una estadía ni un turno para reparar.
- Turno abierto: aplicar plan en el turno dueño, nunca en uno autogenerado o actual por defecto.
- Turno cerrado: permiso financiero específico, motivo y preview adicional de revisión de cierre. Mantener cierre original y conteo/evidencia originales; guardar revisión con esperado por método y diferencias. No modificar efectivo contado, cierre físico ni trasladar ingresos al turno actual.
- Vínculo de turno faltante/ambiguo: revisión documentada; ninguna deducción por fecha o importe. Si no puede verificarse, bloquear la corrección automática.
- Actor y permisos salen de sesión y middleware de servidor, no de `anuladoPor` enviado por el cliente. Permiso separado para reparar histórico y documentos ya reutilizados.
- Preview no hace escrituras ni reserva dinero. Confirmación valida operation ID, fingerprint y versión esperada. Mismo ID+mismo contenido devuelve resultado persistido; mismo ID+otro contenido=409.
- Todos los escritores de este dominio deben compartir el mutex fiscal por reserva existente `folio-invoice:<reservationId>`: NC/ND, emitir, reaplicar, editar/anular, recuperación y rutas genéricas. Luego turno(s) ordenados y filas de pagos/documentos/folio en orden estable.
- Antes de implementar debe verificarse el orden real completo de locks de cierre de turno, reserva de crédito y conciliación: hay caminos que bloquean documentos y otros pagos primero. No incorporar una transacción con el orden inverso. Añadir prueba de timeout/deadlock y revalidación tras adquirir locks.
- Cierre concurrente: con el turno bloqueado, releer status. O la corrección termina antes del cierre, o se rechaza la confirmación normal y exige nuevo preview de reparación histórica.
- Dos operadores: una sola corrección consumible por versión; la otra recibe 409 y debe refrescar. Reintento de una corrección ya aplicada no reclasifica ni anula otra vez.
- ARCA no está dentro de una transacción SQL larga. Estados de intención: preparada/reservada, autorización pendiente, conciliación pendiente, aplicada, rechazada/requiere revisión. Tras fallo posterior al CAE se consulta/reconcilia el mismo documento; no se reemite.
- Una corrección puramente financiera no llama ARCA. No puede ejecutarse mientras un intento fiscal tenga un resultado ambiguo sobre sus pagos.

## 7. Resumen Cobro preparado/Sobrepago

- Mantener separados: cargos operativos, cobros activos, deuda total, pendiente fiscal, crédito liberado histórico, crédito libre, crédito aplicado y nuevo dinero para esta selección.
- Una única proyección de cobro efectivo debe alimentar resumen, validación y payload.
- Si nuevo dinero=0: filas efectivas=[], cobro preparado=0, ocultar o marcar “No corresponde”; no mostrar “Sobrepago” por filas ocultas. Etiqueta: “Se facturan 90.000 aplicando pagos existentes. No se registra dinero nuevo”.
- No borrar silenciosamente una división en edición: puede conservarse como borrador inactivo, claramente fuera de la operación. Al volver a necesitar dinero, exigir revisión de montos/métodos; no reactivar importes viejos automáticamente.
- Crédito insuficiente: mostrar faltante seleccionado y deuda total, incluyendo documentos anteriores sin cobertura. No permitir confundir 30.000 para F2 con 90.000 de deuda total.
- Si falta evidencia de pagos/aplicaciones, no reemplazar error por crédito=0 ni saldo “cubierto”; bloquear emisión y explicar qué falta.
- Una factura ya emitida con deuda pendiente tiene un recorrido de cobro, no una emisión duplicada para “generar saldo”.

## 8. Pruebas existentes identificadas (no ejecutadas en este trabajo documental)

| Archivo | Cobertura relevante ya presente |
|---|---|
| `shared/reservationFolio.test.ts` y `client/src/lib/reservation-folio.test.ts` | Resúmenes operativo/fiscal; liberación proporcional, avances y reaplicaciones. |
| `server/tests/reservation-folio-credit-note.test.ts` | Composición y restitución fiscal por origen tras NC. |
| `server/tests/reservation-nc-reconciliation.test.ts` | Recuperar NC/ND, conservar origen fiscal, parcialidad y mapas inválidos. |
| `server/tests/folio-invoice-concurrency.test.ts` | Exclusión de facturación simultánea, mapas requeridos, capacidad reservada, NC parcial/total y replay. |
| `server/tests/reservation-credit-reconciliation.test.ts` | Reserva durable de crédito/anticipo y conflictos entre operaciones. |
| `server/tests/reservation-credit-reconciliation-array-param.pg.test.ts` | Conciliación con PostgreSQL y parámetros de arreglos. |
| `server/tests/reservation-invoice-payment-detail.test.ts` | Detalle de medios que cubre exactamente factura; rechaza montos viejos, método desconocido y detalle faltante. |
| `server/tests/reservation-payment-request.test.ts` | Identidad y fingerprint; mismo ID con contenido distinto. |
| `server/tests/reservation-payment-ledger.pg.test.ts` | Pago/folio/Caja atómicos, rollback, retención y pagos concurrentes. |
| `server/tests/reservation-invoice-cash-edit.pg.test.ts` | Editor limitado de Caja por factura; no acredita el nuevo caso con payments divididos. |
| `server/tests/reservation-payment-cash-recovery.pg.test.ts` | Recuperación idempotente y turnos ambiguos/cerrados. |
| `server/tests/cash-shift-payment-race.pg.test.ts` | Carrera de turno y pago; ampliar a correcciones. |
| `server/tests/cash-shift-noncash-summary.pg.test.ts` | CC/voucher no alteran efectivo físico. |
| `server/tests/cash-duplicate-payment-links.pg.test.ts` y `cash-orphaned-payment-links.pg.test.ts` | Duplicados/huérfanos; detección no prueba propiedad cuando falta un vínculo. |

## 9. Pruebas faltantes propuestas

| Nivel | Casos y aserciones obligatorias |
|---|---|
| Unidad: vínculos | Dos cargos/pagos de igual importe con IDs distintos; no asociación automática. invoiceRef inválido, clave fiscal duplicada, Caja por reserva sin payment ID, combinación de comprobante y pago; bloquear ambigüedad. |
| Unidad: aplicaciones | Ejemplo completo A/B/C, centavos y residuales de prorrateo; no autopreferir el pago de 90.000 para SPA. Restitución a F1 sin self-reapplication cíclica. |
| Unidad: NC parcial | Anular P-C después de NC deja deuda 90.000, no 30.000; crédito liberado 60.000 no es crédito libre si se restaura F1. Pagos posteriores a NC no se liberan por esa NC anterior. |
| Unidad: dependencias | Crédito completado, reservado, agotado, NC posteriores y ND; conservación del historial, sin saldo reaplicado negativo ni disponibilidad doble. |
| React: resumen | Borrador 180.000 oculto con nuevo cobro 0: no preparado/sobrepago, emisión sin filas nuevas. División conservada inactiva y revisión al volver a cobrar. |
| React: recorrido | Tres acciones con textos diferentes, selección por ID, motivo, prueba de impacto, bloqueos visibles, confirmación histórica y refresh por 409. |
| PostgreSQL: A | Pago conserva ID/importe; sólo cambia clasificación confirmada; Caja activa neta igual; historial y snapshot original preservados; folio no registra segundo pago. Pago dividido no altera hermanos. |
| PostgreSQL: B | No egreso físico; ingreso ficticio invalidado, pago anulado no borrado, contraasiento exacto de folio, deuda 90.000, aplicaciones sin fondos retiradas/regularizadas en la misma transacción. |
| PostgreSQL: B con reutilización | Antes de anular, F1+F2 y IDs/importe de cada aplicación; cancelar P-C provoca obligaciones 60.000+30.000. Cobrar 90.000 no emite F3 ni libera crédito histórico otra vez. |
| PostgreSQL: C | Una F2 de 90.000 y aplicaciones 60.000/30.000; mismos pagos y Caja, crédito libre 0. Reintento devuelve mismo resultado. |
| PostgreSQL: cierre | Turno cerrado conserva cierre original y conteo, crea revisión, no turno actual. Carrera cierre/corrección con reread; rollback si falla revisión. |
| PostgreSQL: concurrencia | Dos correcciones, corregir vs anular, anular vs emitir, anular vs reutilizar, NC vs corregir, cierre vs corrección. No doble ingreso, egreso, folio, aplicación ni CAE. Locks con límite de tiempo. |
| PostgreSQL: fallos | Fallar en cada escritura revierte todo; caída después de commit reproduce resultado; CAE autorizado antes de fallo local recupera misma factura. |
| Rutas reales | Sesión/roles/permisos, suplantación de actor, confirmación sin preview, preview vencido, operación UUID distinta/igual y contenido alterado. PATCH/DELETE genéricos no eluden reglas. |
| PDF/reportes | Original inalterado, constancia de corrección visible, métodos actuales y originales distinguibles; Caja/Folio/reportes leen la misma proyección. |
| Compatibilidad | Retenciones, CC/voucher, grupos, orígenes SPA y datos incompletos: rechazo/derivación explícitos, no cambio silencioso de circuito. |

Ejecución futura: unitarias + React en sus configuraciones; PG en base disposable migrada, nunca producción. `vitest.server.pg.config.ts` descubre `server/tests/**/*.pg.test.ts` y serializa archivos. Una única prueba de navegador del recorrido crítico cuando exista implementación; mocks solos no prueban autorización/atomicidad.

## 10. Condiciones para pasar a implementación

1. Aprobar recorridos A/B/C, política de corrección de datos de pago de documentos emitidos y permisos históricos.
2. Aprobar restauración explícita de cobertura del caso B y el registro durable de aplicaciones; no implementar un parche de selector o un matching por importes.
3. Definir revisión de cierres sin modificar conteo histórico y verificar orden global de locks.
4. Preparar lectura no mutante de datos reales por IDs cuando se autorice, para verificar calidad del histórico. No ejecutar backfill automático sobre relaciones incompletas.
5. Implementar sólo en esta rama (o sucesora desde esta base), con pruebas anteriores y nuevas, sin Revenue/piloto. Revisión del usuario antes de publicar.

**Esta entrega no cambia comportamiento de la aplicación. No hay reparación, migración ni despliegue realizado.**
