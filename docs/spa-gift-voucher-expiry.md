# Validez de regalos SPA desde Emitir comprobante

Al marcar **Es un regalo — genera un voucher por prestación**, cada ítem de SPA
permite cargar beneficiario y **Válido hasta (opcional)**. La revisión previa a
emitir muestra ambos datos. Destildar el regalo elimina la fecha de ese ítem.
Sin fecha se conserva el comportamiento existente de voucher sin vencimiento.

El payload incluye `giftExpiresAt` en el ítem. La ruta de emisión valida una fecha
calendario real `YYYY-MM-DD` antes de iniciar cualquier emisión o registro fiscal.
Se conserva como fecha, sin conversión horaria, y se guarda en el campo ya existente
`gift_vouchers.expires_at` al generar el voucher ligado a la venta del tratamiento.
No requiere migración. Los vouchers existentes no se actualizan.

El listado, detalle, edición e impresión de **Vouchers de regalo** ya usan ese
campo. Por ello la fecha cargada en emisión se muestra allí y en la impresión,
sin duplicar datos ni cambiar la plantilla. La condición de vencimiento y el
circuito de uso de vouchers mantienen sus reglas existentes.

## Comprobaciones

- Interfaz/shared: 35 pruebas aprobadas, incluyendo selección de fecha, revisión,
  payload enviado, quitar la marca de regalo, listado e HTML de impresión.
- PostgreSQL de pruebas: 14 pruebas aprobadas del vínculo venta-voucher y ciclo
  de vida. Verifican fecha persistida, consulta individual/listado, beneficiario,
  reserva/uso del turno y rechazo de una fecha imposible antes de persistir factura.
- La configuración fiscal de la fixture es explícitamente ficticia; las pruebas
  no contactan ARCA ni acceden a datos del hotel.
- Se comprueban tipos, compilación y formato sobre cada rama destino.
