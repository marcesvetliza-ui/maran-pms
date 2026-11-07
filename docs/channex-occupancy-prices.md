# Precios por ocupación de Maran a Channex

## Contrato consultado

El 07/11/2026 el usuario adjuntó el texto de “Update Rate & Restrictions”, apartado “Multi Occupancy Rate Plan update”. Se revisó el documento proporcionado; no se consultó nuevamente el sitio, bloqueado por la política de red del entorno. Es evidencia del formato del proveedor, no una instrucción para ejecutar cambios.

El contrato usa `POST /restrictions`, `values` con identificación de propiedad y plan, fechas inclusivas y **`rates`**, una lista de objetos `occupancy` y `rate`. Los importes decimales deben ser strings (los enteros representan unidades monetarias mínimas). Puede haber advertencias de validación dentro de respuestas HTTP 200; no se deben considerar publicación íntegra exitosa.

Ejemplo de prueba, sin envío real: `rates: [{occupancy: 1, rate: "169000.00"}, {occupancy: 2, rate: "190000.00"}]`. Son totales en ARS por habitación y noche, no precios por persona ni centavos.

## Fuente y comportamiento

- El catálogo conserva modalidad de venta, modalidad de cálculo y las ocupaciones declaradas en `options`. Después de desplegar, obtener nuevamente el catálogo de las conexiones existentes.
- Para `per_person` se admiten planes `manual` con ocupaciones enteras de 1 a 4. No se inventan ocupaciones ni se sobrescriben planes derivados/auto.
- Se usan `rate_1pax` a `rate_4pax` del plan de Maran. Las excepciones del calendario prevalecen por ocupación y fecha. No se importan los precios de Channex a Maran ni se multiplican los totales por huéspedes o por 100. No se modifica IVA, desayuno, cargos infantiles ni políticas del plan remoto.
- El calendario permite modificar una o varias ocupaciones, conservar vacíos y volver a los precios del plan. La propuesta se revisa antes de confirmar; un cambio concurrente del plan o del calendario invalida la revisión. Se muestran por separado precio único y precios por ocupación.
- Un precio único ya guardado en el calendario de un plan por ocupación se debe restablecer a tarifa base antes de publicar: no se extrapolan importes a otras ocupaciones. El API impide crear nuevos precios únicos positivos en planes vinculados a `per_person`.
- Faltantes, ceros, modalidades no verificadas, monedas diferentes, opciones fuera del rango admitido y fechas fuera de vigencia mantienen el envío bloqueado con explicación. No hay fallback silencioso al precio único.
- Los cambios de precios por pax y de calendario generan deltas durables. Los deltas de precio usan `rates`; los de restricciones no incluyen precios ajenos al cambio. Arrays iguales no se retransmiten por tener otra identidad en memoria. Los rangos iguales se comprimen y se conserva el límite de dos llamadas ARI para el full sync.
- Advertencias de validación con HTTP 200 bloquean el lote y evitan marcarlo como publicado. Channex puede haber procesado parte; los reintentos conservan valores absolutos idempotentes y requieren revisar el motivo.

## Puesta en marcha pendiente

La conexión real continúa desactivada. Obtener catálogo, revisar preparación y contrastar importes por ocupación en Maran con los cargados en Channex. Ejecutiva debe tener 169000.00 para una persona y 190000.00 para dos si esos siguen siendo los importes acordados. Mantener el alcance piso 3 y los mapeos físicos revisados, sin tocar el resto del hotel.

La vigencia de Ejecutiva vista en la última captura termina el 01/02/2027. No se extiende automáticamente para satisfacer la revisión de 500 días. Faltan resolver la continuidad tarifaria, política de niños/bebés, impuestos y cancelaciones, y verificar los primeros envíos/recepción/webhook al habilitar producción. Las pruebas de código y PostgreSQL usan proveedores simulados; no prueban aceptación remota real ni conectan OTAs.
