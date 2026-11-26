# Motor de reservas: habitaciones y reglas compartidas con OTAs

Preparado el 26/11/2026 sobre `d832466283fe39b9c4a6cbf6e25f24917ca12e9d`.

## Comportamiento

El motor consulta las habitaciones físicas seleccionadas en la conexión real de OTAs, incluyendo sus divisiones por variante. Incorporar o quitar una habitación del alcance o del mapeo de esa conexión se refleja en las consultas siguientes del motor. No mantiene una segunda lista para editar.

Una única conexión real se identifica automáticamente. Si hay varias, se elige la referencia desde Motor de Reservas. Las conexiones de demostración no se utilizan. Pausar la sincronización conserva las habitaciones seleccionadas. Una referencia inexistente, un alcance inválido o un plan ambiguo no habilitan una lista alternativa de todas las habitaciones: la categoría requiere revisar su configuración.

La referencia guardada pertenece sólo al motor. No bloquea la eliminación de una conexión OTA; si se elimina una referencia explícita, permanece inválida hasta elegir otra, sin cambiar silenciosamente a otra propiedad.

Cada variante utiliza un plan local, mapeado y vigente en la conexión. Si el plan propio del motor está mapeado, se prefiere ese plan como referencia; si hay un único plan elegible, se usa ese; si hay varios, el administrador elige. Los planes derivados, retirados o con modalidad/ocupaciones incompletas no se usan como referencia. Las restricciones se leen de ese plan: cierre de ventas, llegadas, salidas, mínimos de estadía, máximo de estadía y vigencia. Esto se aplica aunque no se hereden precios.

La disponibilidad reutiliza el cálculo existente de OTAs para grupos sin asignar, mantenimiento y reservas pendientes del canal. Además exige una habitación física disponible durante toda la estadía. La confirmación vuelve a calcular la variante seleccionada, el precio y la habitación, dentro del bloqueo de inventario existente y una transacción consistente. Una oferta vencida exige volver a consultar y no crea huéspedes ni reservas.

## Tarifas

Se conservan el selector de plan y el descuento propios por categoría. Se agregan:

- **Usar rangos tarifarios cargados desde OTAs**, desmarcado inicialmente.
- **Bajar / Subir** y porcentaje de ajuste aplicado únicamente al precio heredado.
- Referencia por variante cuando existe más de un plan elegible.

Con la casilla desmarcada se usa la tarifa base/por ocupación del plan propio y el descuento online. Con la casilla marcada, sólo las noches con un precio de calendario guardado explícitamente desde OTAs usan ese precio y el nuevo ajuste. Fuera del rango continúa el plan propio con su descuento. Los descuentos no se acumulan.

Ejemplo: plan propio $100 con descuento 10%; rango OTA de $200 y ajuste Bajar 20%. Una noche dentro del rango cuesta $160; una noche fuera cuesta $90; total de ambas: $250. Subir 10% sobre $200 da $220. Se conserva el criterio existente de redondear primero el importe del descuento, en centavos.

En modalidad por persona se usa el rango de la ocupación solicitada; en modalidad por habitación, el precio único. No se heredan la tarifa base OTA, otros planes, otras ocupaciones ni calendarios creados por la herramienta de conversión de moneda. Si las monedas difieren, se usa la cotización ARS por USD configurada en la conexión; sin cotización válida no se ofrece ese precio. El importe se expresa en la moneda del plan propio.

## Migración y límites

Las migraciones son aditivas. No seleccionan planes, no modifican reservas existentes, no activan ventas y no cambian conexiones, mapeos ni despachos de OTAs. Las consultas de disponibilidad se ejecutan en transacciones de sólo lectura. Guardar la referencia o las opciones del motor sólo escribe su configuración.

Los precios nuevos del calendario guardan su procedencia. Editar solamente una restricción no convierte un precio copiado en un rango propio de OTAs; volver a tarifa base o borrar un precio por ocupación borra su procedencia correspondiente. Guardar el mismo importe sólo para reconocer su procedencia no genera deltas monetarios hacia OTAs.

No se adivina la procedencia de rangos históricos. Si existe un rango anterior sin origen verificable, debe volverse a guardar explícitamente desde el calendario OTA antes de heredarlo. La consulta de preparación encontró **cero rangos de precio en los seis planes manuales actualmente mapeados** y ningún plan de venta online seleccionado en las cuatro categorías; no se realizó un cambio ni una migración de esos datos.

**Las ventas online continúan desactivadas.** Esta revisión no incorpora una acción para habilitarlas. Publicar el código y autorizar la apertura de ventas son decisiones separadas.

## Verificación reproducible

Usar solamente bases desechables. Nunca ejecutar las pruebas PostgreSQL contra el PMS operativo.

```bash
npm run check
npm run lint:dates
npm run build
CI=true npx vitest run shared/booking-ota-pricing.test.ts client/src/pages/admin-booking-engine.test.tsx client/src/pages/reservar.sales-gate.test.tsx
bash script/test-booking-engine-isolated.sh
bash script/test-booking-engine-ota-isolated.sh
```

El primer script crea y elimina su propia base aislada e incluye las pruebas nuevas de alcance y rangos. El segundo verifica transporte ARI, recepción de reservas y conversión USD con transportes simulados. Requieren las utilidades PostgreSQL locales. En la revisión se usó el mismo aislamiento con PostgreSQL portátil y bootstrap mediante `pg`, porque esas utilidades no estaban instaladas.

También se ejecutaron los tests HTTP/permisos y de reglas de OTAs, y se revisó la pantalla en Chromium con datos sintéticos a 1280, 1180, 768 y 390 píxeles. Las capturas y registros están en el paquete de revisión, sin datos de huéspedes ni credenciales.
