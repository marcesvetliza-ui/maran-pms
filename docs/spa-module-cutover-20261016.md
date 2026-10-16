# SPA: cambio general de motor y receptor fiscal

## Resultado

Autorización de Marcelo del 16/10/2026: las cuentas y comprobantes actuales son de
prueba y se solicita utilizar el motor nuevo en todo SPA. Con los dos flags ya
activados, este despliegue realiza el cambio automáticamente. No requiere volver
a instalar tablas, nuevas variables ni vincular cada cuenta en la pantalla.

El backend incorpora al arrancar las cuentas existentes que todavía no fueron
incorporadas. Las nuevas se incorporan al consultar el folio. Los scopes ya
gestionados, UUID, reservas de fondos, comprobantes preparados y operaciones
pendientes se conservan, sin reiniciarlos. El navegador deja de elegir motor.

## Tratamiento de lo anterior

- Cuentas directas abiertas o cerradas sin historia fiscal: se verifican e importan
  sus cobros mediante los IDs reales de pago, Caja y folio. Una cuenta realmente
  sin pagos puede iniciar su folio unificado con el importe de sus cargos.
- Un cierre no fiscal puede facturarse después con los mismos pagos; no constituye
  otro ingreso y no vuelve a descontar insumos si el cierre ya estaba realizado.
- Facturas, NC, cuentas canceladas, liquidaciones por habitación y registros cuyos
  vínculos no pueden conciliarse: se conservan como **historial de consulta** en
  el motor nuevo. No se vuelven a emitir ni se convierten en crédito disponible.
  Este cambio no implementa la edición financiera de esas historias complejas.
- No se borran ni alteran comprobantes, pagos, Caja, cierres ni consumos anteriores.
  Las capturas del historial se guardan en el registro de eventos inmutable con
  estado, motivo, importes e identidades originales. No se inventan aplicaciones.

Cada incorporación usa el lock de scope del motor. Repetir el arranque o dos
consultas concurrentes no duplican recibos ni eventos. Las vías financieras legacy
SPA quedan bloqueadas para todas las cuentas, incluso antes de su primera consulta.
La propiedad de facturas anteriores también se resuelve desde `spa_accounts.invoice_id`.
Recepción y Restaurant mantienen sus circuitos actuales.

## Receptor fiscal

La captura mostraba un nombre de turno sin `guest_id`: un nombre escrito no era
un receptor fiscal vinculado. El folio ofrece ahora **Datos fiscales del cliente**:

1. Elegir una ficha existente con el buscador, o completar una nueva.
2. Revisar nombre, apellido, documento, condición IVA, CUIT y domicilio.
3. Pulsar **Guardar y vincular cliente**. Actualiza la ficha elegida o crea una
   ficha persistente y la vincula al turno. No factura, cobra ni descuenta stock.
4. Preparar el comprobante con los datos persistidos en el servidor.

No se adivina identidad por nombre ni se inventa DNI/CUIT. La selección guarda
el namespace explícito (huésped/cliente SPA) para resolver IDs históricos ambiguos.
Los IDs nuevos son estables por cuenta; repetir el guardado no crea otra ficha.
La creación serializa el documento e informa una ficha existente para elegirla.
Los permisos de consulta/operación se conservan. Una cuenta con comprobante
preparado u operación no permite cambiar el receptor por este endpoint.

Endpoints adicionales, con sesión y permisos:

- GET `/api/payment-funding/spa/:id/recipient`: ficha actual y disponibilidad de edición.
- POST en esa ruta: campos fiscales validados; permiso `funding:write`.
- GET `/api/payment-funding/recipients/:guestId`: precarga por ID elegido en el buscador.

Para dinero nuevo sigue siendo necesaria una caja SPA propia realmente abierta.
La preparación y el historial no necesitan abrir una caja ni generan dinero.

## Publicación y evidencia

La implementación se verifica en PostgreSQL aislado y Chromium, con proveedor
fiscal simulado. No se consultó la base de MARAN ni se contactó ARCA desde este
workspace. La incorporación efectiva depende del despliegue y arranque del servicio.
El log `[SPA funding] Motor general listo.` informa sólo la cantidad incorporada,
sin nombres, certificados ni datos de conexión.

El recorrido de navegador incluye el error por receptor ausente, alta/vínculo de
la ficha desde el folio, preparación, pagos existentes, cobro del faltante,
consumo de insumos y recuperación posterior al CAE sin repetir emisiones.

Validación de esta entrega: 659 pruebas de cliente, 709 de servidor, 28 del motor
PostgreSQL, 27 de bindings/rutas aisladas, 2 recorridos Chromium, 4 de concurrencia,
4 de persistencia WSAA y 8 del instalador empaquetado: 1441 aprobadas.
TypeScript completo, build con UI activada y `git diff --check` correctos.
Los 37 casos focalizados de UI están incluidos en las 659 pruebas de cliente.
