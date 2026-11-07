# Revenue: tarifas por noche y separación realizado/proyección

Se comparte `shared/nightlyReportPrices.ts` con los reportes de alojamiento. `nightly_v1` requiere fechas, descuentos e importes coherentes con el total guardado; se toma el neto de cada noche. No se sustituye un contrato inconsistente por una tarifa plana o de grupo. Las reservas legacy distribuyen su total entre las noches reales en centavos y se identifican como estimadas; no se usa `nights` desactualizado ni la tarifa plana en lugar del total.

Una tarifa pactada en bloque de grupo puede cubrir un faltante solo en la proyección y se identifica como estimación. No acredita ingresos realizados. Las cortesías explícitas válidas cuentan como $0; un precio ausente o inválido no cuenta como conocido para ADR.

El tablero expone y presenta realizado y reservas por venir por separado: ingresos, habitaciones-noche, capacidad, ocupación, ADR y RevPAR. Para el pasado se admiten checked_in/checked_out; hoy distingue esos estados de pendientes/confirmadas; en fechas futuras solo se admiten estados activos de reserva. Canceladas, no-show y estados desconocidos no generan noches vendidas. El resumen se pondera por capacidad-noches o noches con precio, sin promediar ADR diarios ni sumar porcentajes de fases. La fila diaria y su detalle conservan el total combinado de ese día y muestran la fuente del precio.

La capacidad conserva el inventario operativo actual y bloqueos fechados. No reconstruye altas/bajas históricas. Los extras de grupo se siguen mostrando aparte y no entran en ADR/RevPAR. Los cupos no asignados no se convierten en ocupación física.

Se conserva Pace y su captura diaria. Las capturas anteriores no se recalculan: al comparar capturas viejas y nuevas puede aparecer una diferencia de criterio de valoración, además de variaciones comerciales. Se advierte en pantalla. No se cambian reservas, tarifas pactadas, facturas, pagos ni capturas históricas durante esta corrección.

Validación con casos sintéticos y base PostgreSQL local: descuentos distintos por noche, fechas entre meses, discrepancia con tarifa plana, centavos de legacy, contrato inválido, cortesía, tarifa ausente, grupos, separación de fases, ponderación y regresión de Pace. Falta conciliar datos reales con Administración antes de certificar el impacto monetario de las diferencias. Este cambio no certifica compras/NC, impuestos o el resultado gerencial integral.

Se corrige además la configuración de transacción del servicio común: `accessMode: 'read only'` es la opción admitida por Drizzle. La prueba PostgreSQL consulta `SHOW transaction_read_only` dentro de la transacción y exige `on`; no se depende únicamente de que el código ejecute SELECT.
