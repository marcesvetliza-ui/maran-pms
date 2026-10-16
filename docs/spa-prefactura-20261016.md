# Prefactura SPA — 16/10/2026

El folio conserva Cuenta, Facturación e Historial. Facturación abre una prefactura con los datos de SPA, siguiendo la distribución de Recepción. Se amplió únicamente el diálogo del folio para aprovechar el escritorio y conservar la adaptación al celular.

## Operación

- Facturar al cliente SPA, a otro huésped o a una empresa existente. El destinatario fiscal no cambia la persona que recibió el tratamiento.
- Revisar los cargos de la cuenta completa, aplicar un descuento porcentual o fijo con motivo, agregar observaciones e imprimir un resumen no fiscal.
- Aplicar cobros previos y dividir únicamente el faltante entre varios medios de pago. La caja debe pertenecer al operador y estar abierta; no se exige caja para reutilizar cobros que cubren el total.
- Revisar el comprobante preparado por el servidor y confirmar «Registrar y emitir». La emisión y recuperación usan el motor y el único finalizador existentes.
- Cargar la cuenta completa a una habitación mediante la confirmación existente. Primero se guardan descuento y observaciones, sin exigir datos fiscales del cliente ni un nuevo turno de caja. Se conserva la restricción de no transferir cuentas con pagos que necesitan conciliación.

## Integridad

Las preferencias y la preparación fiscal se confirman en una misma transacción del ámbito SPA. Se verifica la versión de los cargos y cada revisión tiene UUID e identidad de contenido/operador. Un reintento obsoleto no puede devolver silenciosamente una preparación posterior con otro destinatario. Los borradores internos no utilizados se invalidan conservando su evidencia; las operaciones financieras activas impiden modificar la cuenta.

El descuento reutiliza el cálculo de Recepción y se representa como un único renglón negativo de la cuenta. Las revisiones no lo acumulan. No puede reducir el total por debajo de los pagos activos. El adaptador recompone los totales netos del folio desde las fuentes, incluso si una caché previa contiene el bruto. No se crean cobros ni movimientos de Caja al guardar preferencias. La cantidad de productos y el consumo de stock no cambian por aplicar un descuento.

Una cuenta cerrada con comprobante no fiscal puede facturarse con sus cobros existentes, conservando sus importes. Las observaciones se incorporan a la factura persistida. El resumen imprimible usa nodos de texto y se identifica como no fiscal.

## Alcance

Se mantienen los tipos FA/FB en ARS y la condición de venta Contado. Elegir una empresa cambia el receptor fiscal; no crea una cuenta corriente ni simula su financiación. Se factura la cuenta completa, sin selección parcial de renglones. La reversión de una transferencia SPA→habitación queda fuera de esta entrega.

No hay nuevas tablas, migraciones ni variables de Railway. Se conservan los flags y permisos existentes del circuito SPA en homologación.

## Validación

Pruebas de cliente y servidor, PostgreSQL aislado y navegador Chromium con HTTP y PostgreSQL: empresa con descuento y pagos divididos; cobros anteriores; reintentos; recuperación posterior a CAE simulado; errores fiscales y de versión; cierre no fiscal; carga a habitación; resumen e interfaz móvil. TypeScript y build.

Resultado: 667 pruebas de cliente, 711 de servidor, 28 del motor PostgreSQL, 46 de rutas/adaptadores operativos, 4 de navegador, 4 de concurrencia y 4 de caché WSAA aprobadas. TypeScript y build finalizaron correctamente.

Estas verificaciones no consultan bases operativas ni contactan ARCA real. El push a main no acredita por sí mismo que Railway haya terminado su despliegue.
