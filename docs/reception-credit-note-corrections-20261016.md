# Recepción: NC y corrección de cobros — 16/10/2026

## Operación

La NC corrige la factura; conserva los pagos registrados. El folio distingue pendiente de facturación y pendiente de cobro.

En Pagos del folio de la reserva, «Corregir cobro» permite:

1. **Se cobró, pero el medio está mal registrado**: reclasificar el ingreso al medio correcto en el mismo turno de Caja, conservando el importe y la referencia fiscal. No crea otra venta ni otro pago.
2. **El cobro registrado nunca existió**: retirar el registro erróneo. No simula una devolución ni registra un egreso de efectivo. La reserva vuelve a mostrar su deuda.

Se exige motivo, referencia de comprobación, revisión previa y confirmación. Cuando hay fondos libres provenientes de una NC que pueden restablecer la cobertura original, se presenta una propuesta por cobro, factura e importe. Restaurarla exige marcarla y revisar otra vez antes de confirmar. No se reasigna crédito ya consumido por otra factura.

El UUID y el contenido de la corrección se conservan ante pérdida de respuesta y reapertura. Un reintento recupera el resultado confirmado. Los errores deterministas de una previsualización vencida permiten revisar nuevamente; no se libera ni duplica dinero por un timeout.

## Caso del informe

Factura $270.000; débito $180.000 y crédito $90.000; NC parcial $90.000:

- La NC libera $60.000 del débito y $30.000 del crédito, conservando el prorrateo acordado.
- Si la tarjeta se recibió pero estaba mal identificada, se corrige el medio de ese cobro. La refacturación aplica los registros reales, sin otra entrada de dinero.
- Si la tarjeta nunca se cobró, se retira su registro y, con aceptación explícita, se restauran los $60.000 libres del débito a la factura original. Quedan $90.000 pendientes de cobro en la reserva.
- Si la refactura ya consumió el crédito, no se lo toma otra vez. La revisión muestra las obligaciones sin cobertura ($60.000 y $30.000); no inventa otra factura para cobrarlas.

## Integración y garantías

Recepción mantiene su conciliación existente para facturas, anticipos, CC, retenciones y recuperación fiscal. **No se adoptaron ni migraron masivamente sus folios al motor completo de SPA.** El puente comparte el reparto entero y determinista de centavos y el escritor SQL de correcciones del motor nuevo, trabajando sobre los registros nativos por IDs.

La conciliación de una NC persiste en `payments.invoice_ref.fundingReleases` los centavos liberados por factura. El cálculo considera cobertura efectivamente aplicada y porción impaga; esta última no se convierte en dinero. La suma conserva los centavos y las revisiones posteriores toman la cobertura vigente, incluidas restauraciones. Las ND que revierten NC reclaman únicamente crédito todavía libre; no duplican el que ya financió otro comprobante.

El guardado de la NC, sus ajustes y los contadores de disponibilidad pertenece a la misma transacción local recuperable. La autorización fiscal continúa en el circuito existente, con la NC pendiente recuperable si falla la conciliación local.

Las correcciones verifican la identidad exacta del pago, su ingreso de Caja y su movimiento de folio. Usan el bloqueo de preparación de facturas/NC de Recepción, con intento inmediato para no agotar un pool pequeño esperando otra emisión. Rechazan operaciones pendientes, anticipos reservados, identidades cruzadas y previsualizaciones vencidas. El adaptador del puente conserva la convención de totales de Recepción, incluyendo descuentos y transferencias existentes; no los descuenta dos veces al retirar un cobro. La modificación de origen, restauraciones, totales y evento inmutable se confirman o revierten juntos. El operador se obtiene de sesión. La corrección también aparece en el Historial de la reserva, dentro de la misma transacción. Los reintentos no repiten la corrección.

Los contadores de liberación y las reaplicaciones de crédito no se aceptan del navegador. La vinculación/recuperación preserva los valores guardados por el servidor. La edición genérica de pagos queda limitada a notas y referencia; importes, medios y vínculos tienen sus acciones específicas.

La prefactura no muestra como «cobro preparado» importes residuales cuando no requiere dinero nuevo.

## Alcance y permisos

- Corrección de dinero real de Recepción con turno de Caja **abierto**, fuente única y vínculos persistidos verificables.
- Los turnos cerrados requieren conciliación histórica del cierre; esta acción los rechaza. No se altera su conteo físico.
- Los pagos de grupo, CC, vouchers, cargos a habitación y retenciones conservan sus circuitos específicos; no se convierten en efectivo.
- Permiso existente: `funding:write` («Operar financiación de Folio/SPA»). La interfaz usa ese permiso y la habilitación existente del motor en homologación.
- No se modifican silenciosamente las formas de pago históricas impresas en una factura ya emitida. La corrección operacional queda auditada; las nuevas aplicaciones utilizan el medio vigente.
- No se recalcularon ni importaron automáticamente historias anteriores ambiguas.
- No hay nuevas tablas operativas, migraciones ni variables de Railway. Se usa el esquema de financiación ya instalado y el campo de referencia fiscal existente.

## Verificación

PostgreSQL local aislado y HTTP: caso original, corrección de medio, restauración explícita, crédito ya reutilizado, centavos residuales, porción impaga, conciliación nativa de refactura y su reintento, ND, fuentes con alias de Caja reales, permisos, conflictos, pool de dos conexiones y rollback por fallo de auditoría. Chromium con React, HTTP y PostgreSQL verifica la propuesta, confirmación y recuperación de la misma corrección después de una respuesta perdida. Regresiones de cliente, servidor, motor y SPA; TypeScript y build.

No se consultaron bases operativas ni se contactó ARCA real durante estas verificaciones. La publicación en GitHub no acredita que Railway haya completado su despliegue.
