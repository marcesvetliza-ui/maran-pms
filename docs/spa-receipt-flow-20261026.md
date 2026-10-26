# SPA: acceso único a comprobantes del turno

Crear un turno directo con el motor SPA activo abre
`/operaciones/emitir-comprobante?spaAccountId=<cuenta>`. La cuenta es la identidad
persistida: recargar o volver desde el folio no depende de importes ni fichas
copiados a sessionStorage. Facturación en el folio abre esa misma pantalla.
Los turnos ya vendidos mantienen su tratamiento anterior, sin un segundo cobro.

La pantalla usa los permisos existentes de Emitir comprobante SPA y financiación.
Permite Factura A/B según la condición fiscal persistida, o Voucher SPA no fiscal.
El servidor vuelve a verificar el tipo; la selección del navegador no autoriza
una factura incompatible. No habilita Factura T, FCE, cuenta corriente ni otra
clase de liquidación que el adaptador no soporte. No cambia el entorno ARCA ni
habilita producción fiscal.

Revisar sigue disponible sin caja abierta o con pagos incompletos. Muestra
receptor, cargos, descuento y total, sin registrar dinero ni emitir. Si los
cobros están completos y la caja está disponible, la revisión fiscal prepara un
borrador y su plan; solamente la confirmación reserva fondos y autoriza.
Los datos fiscales se completan en la ficha vinculada antes de preparar la emisión.

## Voucher

POST `/api/payment-funding/spa/:id/voucher` es una operación local transaccional:

- Permisos y cuenta incorporada al motor, abierta, sin otra operación fiscal.
- Versión de cargos y descuento comprobados en servidor.
- Los pagos existentes más el nuevo cobro deben cubrir exactamente el total.
- Caja SPA del operador abierta, comprobada y bloqueada en esa transacción.
- Cobros, movimientos, recibos del motor, numeración local del voucher, consumo
  de stock y cierre se confirman juntos. Un error revierte todo.
- Identidad por cuenta, operador y requestId. Reintentar la misma petición
  devuelve el mismo resultado. Otro intento sobre una cuenta cerrada se rechaza.
- Numeración por tipo/punto con el contador local compartido existente.
- No consulta ARCA, no usa CAE ficticio ni crea una autorización fiscal.
- El voucher queda vinculado a la cuenta y visible en historial/Facturación.
  No ocupa `spa_accounts.invoice_id`, reservado a la factura fiscal.
- Los recibos permanecen libres para facturar posteriormente ese cierre,
  reutilizando los cobros sin registrar dinero ni descontar stock otra vez.

El navegador conserva el intento antes de enviarlo. Ante una respuesta incierta
permite recuperar exactamente ese intento, incluso después de recargar. Un
registro dañado bloquea una emisión nueva. No imprime automáticamente.

## Habitación y operación del turno

Cargar a habitación conserva el descuento y abre la selección explícita de
reserva y motivo. Usa `account` / `room-transfer`, no PATCH del turno, pago
legacy ni factura SPA. Mantiene los controles de check-in, folio único, pagos,
importe vigente y procedencia del cargo.

La barrera de pagos anteriores deja pasar únicamente PATCH de estado operativo
(confirmado/iniciado/completado) y notas, y POST de movimiento en planning.
Las rutas originales conservan autenticación, permiso SPA, disponibilidad y
consumos. No exime cambios de tratamiento, identidad, habitación, cancelación,
cobros, cierres ni emisiones financieras.

## Validación

Pruebas UI, servidor, PostgreSQL aislado por socket Unix y navegador Chromium.
Casos: lectura sin caja; receptor/tipo incompatible; pagos parciales y divididos;
transferencia con descuento; voucher concurrente, respuesta perdida y recarga;
fallo de stock con rollback; factura posterior con los mismos recibos.
Los emisores de pruebas son simulados. No se usan turnos, pagos ni ARCA reales.
