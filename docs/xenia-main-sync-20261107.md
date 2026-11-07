# Xenia espejado con Maran — 7 de noviembre de 2026

Pedido: mantener Xenia al día con los cambios funcionales de Maran, conservando el ambiente piloto y su asistente. Se integró main hasta daebf645 sobre el piloto f7f0d612 mediante un merge, sin reemplazar historial ni copiar bases o credenciales.

Incluye las correcciones de vouchers y NC, backups, reportes y Revenue, compras/SIRCAR, cargos por unidad, layout de restaurante y preparación de OTAs con permisos granulares. Algunas mejoras ya existían con commits distintos; se conservaron las implementaciones actuales y se resolvieron sus conflictos.

Se mantienen la marca Xenia, APP_ENV=pilot, usuarios y permisos del piloto, identidad de su base, marcas de agua, bloqueo de correo/backup por email/ARCA/MARA reales y el servicio del asistente. La corrección temporal de unidades y las demás funciones de Inventario se espejan con el código actual de Maran; esta sincronización no cambia artículos, recetas ni stock existentes.

Channex conserva las banderas explícitas de staging. El piloto no puede activar producción aunque se definan las banderas de producción: usa la política central de APP_ENV. El código de preparación de producción queda disponible para paridad, sin activar envíos reales. Los registros de rutas, esquemas y workers se consolidaron para iniciarse una sola vez.

El asistente conserva modelo, presupuesto, protocolos y almacenamiento. Se adaptó únicamente el reconocimiento de la expresión de error de unidades al envoltorio Object.assign añadido por Maran. Las citas de pruebas históricas se volvieron a vincular a sus funciones actuales sin cambiar el texto original de los informes. No se invocaron proveedores ni se reabrieron investigaciones.

## Validación

- Interfaz/shared completa: 220 archivos, 1.198 pruebas aprobadas.
- Primera ejecución completa de servidor: 1.694 aprobadas, 60 fallidas. Incluía timeouts por competencia de recursos, expectativas antiguas de mensajes y las regresiones del asistente.
- Se corrigieron los conflictos de registro, la compatibilidad de fixtures fiscales con el bloqueo del piloto, el contrato singular/plural del rechazo de NC, la migración de sectores en la guarda de catálogo y el mock de readiness. Las pruebas afectadas aprobaron después (52 y 46 casos en ejecuciones dirigidas).
- PostgreSQL local: 125 aprobadas y 4 omitidas por sus condiciones de habilitación, en vouchers, descarte de NC, backups, layout, sectores, alojamiento y Channex.
- Asistente: se comparó contra un worktree anterior f7f0d612, con proveedores simulados y timeout de 20 s. Esa versión ya falla 12 de los 161 casos seleccionados. Tras integrar se identificaron seis fallos nuevos por desplazamiento de citas fiscales; los 47 casos afectados aprobaron con referencias actualizadas. La adaptación del constructor de error recuperó las pruebas de identidad de ingrediente y una prueba que fallaba antes. Quedan 11 fallos previos (decisiones operativas históricas, navegación y evidencia de concurrencia); no se presenta la suite completa del asistente como aprobada ni se declara correcta su calidad de diagnóstico.
- TypeScript de la aplicación y del servicio del asistente sin errores. Build de producción verificado antes de publicar.

Las pruebas no emitieron comprobantes fiscales, enviaron correos operativos ni modificaron datos de los hoteles.

## Criterio de trabajo

Mientras siga vigente el pedido de espejo, las mejoras funcionales se deben llevar a Maran y Xenia. Mantener separados datos, credenciales, identidades y destino de comunicaciones. No interpretar espejo como copia de la base real ni como habilitación de integraciones de producción en el piloto.
