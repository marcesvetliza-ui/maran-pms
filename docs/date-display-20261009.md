# Fechas visibles en Maran

Las fechas de calendario se muestran como `DD/MM/AAAA` sin convertirlas a otra zona horaria. Los instantes con zona horaria se muestran en `America/Argentina/Buenos_Aires`; por ejemplo, `2026-10-09T01:30:00Z` corresponde al `08/10/2026 22:30`.

El formateador compartido `shared/date-display.ts` se aplica únicamente a presentación. Los valores de formularios, filtros, ordenamiento, API y base de datos conservan ISO. Los archivos fiscales destinados a ARCA/SIRCAR mantienen sus formatos reglamentarios.

Se revisaron vistas de Compras, Facturación, Cuentas Corrientes, Caja/Night Audit, Reportes, Planning, Grupos, Huéspedes, Empresas/Agencias, Housekeeping, Mantenimiento, Hospitalidad, OTA, Desayunos, Producción, comparación de precios y vencimientos de vouchers. También se corrigieron CSV, impresiones HTML, recibos PDF de grupos y avisos de fechas. Los PDF fiscales y planillas fiscales ya utilizaban día/mes/año para lectura humana.

El documento HTML y los inputs compartidos solicitan español de Argentina. Los controles nativos `date`/`datetime-local` conservan su contrato ISO; su apariencia final depende del navegador y la configuración regional del dispositivo. Forzar su apariencia en todos los dispositivos exigiría reemplazar esos controles y verificar por separado navegación, accesibilidad y validación.

Validación: suite de cliente (591 pruebas), pruebas finales de fechas/folios y componentes (19), chequeo de TypeScript, compilación y controles de patrones de fecha (27 casos). Suite general del servidor: 524 pruebas aprobadas y 65 fallidas, por mocks de autenticación de grupos incompletos y una validación del registro de migraciones. Se reprodujeron ambas clases de fallo contra main sin los cambios de fechas (3 fallidas, 4 aprobadas en las dos suites representativas). No se ejecutaron integraciones PostgreSQL ni pruebas sobre producción.
