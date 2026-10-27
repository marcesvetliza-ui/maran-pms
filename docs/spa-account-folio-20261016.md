# Folio operativo SPA

La cuenta del cliente vuelve a ser la vista inicial del folio. La facturación
continúa usando PaymentFundingService y su único finalizador; no se habilitan
los escritores financieros legacy.

## Pantallas

- **Cuenta:** tratamientos, productos y extras; pagos/anticipos; total, pagado,
  transferido y saldo. Agregar cargos, anular extras con motivo y registrar pagos.
- **Facturación:** receptor fiscal y revisión/emisión del circuito existente.
  Volver a la cuenta no inicia un cobro ni una factura.
- **Historial:** movimientos, motivos, transferencias y comprobantes PDF existentes.

Las cuentas cerradas, con operación fiscal iniciada o históricas no conciliadas
conservan sus restricciones. El tratamiento inicial se cambia desde el turno.
No se ofrece anular directamente un cobro o un comprobante fiscal desde este
formulario; la corrección financiera conserva su circuito auditado.

## Comandos de cuenta

GET/POST `/api/payment-funding/spa/:id/account` consulta y opera la cuenta.
Cada POST lleva `{commandId: UUID, request: {...}}`. Acciones:

- `add-charge`: descripción, cantidad entera, precio unitario en centavos,
  identidad de producto opcional.
- `void-charge`: identidad del extra y motivo obligatorio.
- `payment`: importe en centavos, medio, caja propia SPA abierta y observaciones.
- `room-transfer`: reserva destino, importe esperado y motivo obligatorio.

Todos requieren sesión y `funding:write`; las consultas requieren `funding:read`.
El comando se serializa con el mismo bloqueo de scope del motor. El evento
inmutable guarda actor, huella, solicitud y resultado. Repetir el UUID y contenido
devuelve el resultado anterior; cambiarlo provoca conflicto. El navegador guarda
el UUID antes del POST y conserva el mismo tras pérdida de respuesta o reapertura.
Un registro de recuperación dañado bloquea movimientos nuevos.

Un cargo invalida solamente documentos internos **draft sin operaciones**:
sus snapshots completos se preservan en eventos antes de retirarlos. Ninguna
factura autorizada ni operación financiera se borra o sustituye. Volver al mismo
contenido recupera la misma identidad de preparación sin duplicar su evento.

## Stock y pagos

Los productos se eligen del catálogo de venta activa de SPA; esta versión admite
IVA 21%, que coincide con la preparación fiscal existente. No se aplica una
alícuota inventada a productos de otros tipos. Su consumo usa el motor de stock
en la misma conexión/transacción. Si falta stock/configuración, conserva la venta
con un consumo pendiente y sin descuentos parciales. La finalización fiscal
reconoce ese mismo consumo y no lo repite.

No se elimina un producto consumido sin reversión/cancelación previa de Inventario.
La anulación conserva el detalle del cargo, motivo y asiento de ajuste auditados.
Un anticipo crea exactamente un pago, movimiento de Caja, movimiento de folio y
recibo libre. Facturarlo después aplica ese recibo, sin otro ingreso.

## Transferencia a habitación

La versión inicial traslada **toda la cuenta sin cobros previos**, no renglones ni
importes parciales. Selecciona explícitamente una estadía con check-in y folio
abierto y único. Revalida estado e importe al confirmar. Una cuenta con pagos,
factura u operación iniciada requiere revisión, sin mover dinero silenciosamente.

La transferencia cierra el servicio/stock una sola vez, crea un cargo SPA real
en la reserva y asientos pareados de salida/entrada vinculados. Deja saldo cero
en SPA, sin pago ni factura nuevos; cobro y facturación pasan a Recepción.
Cualquier fallo revierte todo. El circuito legacy no puede editar/anular el cargo
transferido a espaldas de la cuenta SPA: resuelve su procedencia y lo bloquea.
La reversión de una transferencia no se implementa en esta entrega.

## Instalación y evidencia

No agrega DDL ni variables al ambiente operativo. Utiliza los flags y permisos
ya habilitados. Las tablas auxiliares añadidas a fixtures pertenecen exclusivamente
a PostgreSQL sintético local.

Se verifica en PostgreSQL y Chromium aislados: cargos con reintento concurrente,
anulación, preparación renovada, anticipo seguido de facturación sin nuevo cobro,
cajas/permisos, transferencia idempotente con asientos pareados, protección legacy,
rollback por stock, producto consumido una sola vez y producto sin stock pendiente.
La prueba de navegador recorre Cuenta → Facturación y cuenta/extras/transferencia,
comprueba el historial y ausencia de desborde en celular.

No se consultó ni modificó la base MARAN desde este workspace y no se contactó ARCA.
El despliegue de Railway y la prueba de homologación publicada se verifican aparte.

Verificación de entrega: 666 pruebas de cliente, 711 de servidor, 28 del motor,
39 de rutas/bindings PostgreSQL, tres recorridos Chromium, cuatro de concurrencia
y cuatro de WSAA: 1455 aprobadas. Las capturas se revisaron en escritorio y móvil.
