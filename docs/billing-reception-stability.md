# Estabilización de facturación de Recepción

## Comportamiento para Recepción

- El punto de venta espera la configuración. Homologación usa únicamente el
  punto de pruebas configurado. Una preferencia antigua se corrige al cargar
  la configuración o reabrir; un intento retenido conserva su punto original.
- El servidor valida ambiente/punto y datos fiscales antes de numerar o pedir
  autorización. Los puntos desactivados o manuales no se ofrecen como puntos
  electrónicos de producción.
- Cada emisión fiscal tiene un borrador persistido antes de solicitar CAE.
  Una colisión se detecta antes de autorizar. Bajo el bloqueo de serie, se
  verifica el pedido inmutable del borrador y se consulta su identidad exacta
  en ARCA. Un rechazo confirmado o una interrupción anterior al envío puede
  archivarse automáticamente si ARCA confirma ausencia de autorización y no
  hay vínculos económicos. El documento completo queda en el journal y la
  auditoría. No se adopta otra factura por coincidencia de número/CAE ni se
  adelanta el contador.
  Si ARCA devuelve el CAE original, se conserva en su propia factura, pendiente
  de conciliación; nunca se cobra esa operación desde otra reserva. Se vuelve
  a consultar el último número antes de continuar la emisión nueva.
- Los intentos nuevos de Prefactura conservan su pedido, importes y claves de
  pago en el servidor. Se recuperan también desde otra sesión/computadora.
  Para omitir un pago se exige su clave original, reserva, factura, importe,
  método, fecha y referencias; una coincidencia de importe no alcanza.
- Una respuesta incierta conserva la operación y consulta el mismo comprobante
  antes de reautorizar su mismo número. El resultado debe coincidir también
  con fecha, receptor e importe. No se asigna otro número para salir del paso.
- La pantalla diferencia un intento que no salió, un rechazo confirmado, un
  resultado incierto y una factura autorizada con registro pendiente.
  Los conflictos de numeración anteriores al envío admiten reintentar el mismo
  pedido con sus claves de pago originales. Se identifica el comprobante
  interno que ocupa el número. Los pedidos rechazados o ya archivados siguen
  requiriendo revisar sus datos antes de preparar una nueva operación.
- **Corregir datos del intento** es una acción explícita. Antes de una
  autorización se libera solo el intento nuevo con evidencia del servidor.
  Tras un rechazo confirmado se consulta ARCA; únicamente la respuesta negativa
  inequívoca permite retirar el borrador local no emitido. El borrador completo
  y la evidencia se conservan en el registro de operaciones y la auditoría.
- Si esa consulta encuentra una autorización que coincide con el original,
  se guarda el CAE de la misma factura. Se conserva el intento para completar
  los pagos o la Cuenta Corriente mediante los circuitos existentes.
- Corregir nunca emite una nueva factura ni registra dinero. Las relaciones
  financieras ya aplicadas bloquean el descarte. Un borrador rechazado puede
  liberar sus reservas de anticipos sin modificar los pagos originales.
- El check-out saldado conserva su acción independiente de facturación.

## Identidad, históricos y despliegue

Los nuevos borradores guardan ambiente, emisor, punto, tipo y operación. Una
recuperación no puede cambiar esa identidad según la configuración actual.
Para un borrador antiguo sin identidad fiscal solo se admite consultar y
recuperar una autorización coincidente; una consulta negativa no habilita su
reemisión automática. Los intentos históricos, incluida la 904, no se liberan
ni se reenvían por publicar esta corrección.

La restricción histórica de tipo/punto/número se conserva. No se reclasifican
facturas ni se cambian contadores históricos. Una serie ya contaminada con
datos ficticios necesita revisión explícita; el programa la detiene antes de
solicitar CAE. Un resultado incierto no se descarta sólo porque una consulta
no lo encuentre: se recupera desde su cuenta de origen. Los documentos sin
identidad/pedido verificable, cuentas de SPA/financiación, grupos, pedidos de
Restaurant y documentos con vínculos económicos conservan su recuperación
específica. La verificación no espera por otra cuenta financiera ocupada.
Tampoco cambia la configuración de homologación a producción.

`billing_operations` es un registro persistente de intención/etapa; no es un
libro de Caja. Guarda el pedido necesario para recuperación con los permisos
de reserva existentes. Los logs no incluyen esos pedidos ni XML/credenciales.
Las nuevas columnas son aditivas. La comprobación de esquema impide emitir
si su instalación no terminó. Las consultas de estado no toman bloqueos
financieros; las correcciones y emisiones revalidan bajo los mismos bloqueos.

El servidor incorpora su revisión Git en el bundle. `/api/health` informa esa
revisión y si el esquema financiero está listo. Las comprobaciones de Maran,
staging y Xenia esperan la revisión exacta antes de aceptar el despliegue.

## Verificación

Pruebas con ARCA simulado y PostgreSQL descartable: punto inválido sin llamadas
fiscales, configuración tardía, colisión con ficticios, doble clic, respuesta
perdida, identidad modificada, recuperación del mismo número, corrección sin
emisión, rechazo confirmado y consulta contradictoria. La interfaz prueba
reapertura, conservación del punto inválido, corrección explícita y recuperación
desde otra sesión registrando solo el pago faltante. También se conservan las
regresiones de notas de crédito, grupos, SPA, retenciones y check-out saldado.
