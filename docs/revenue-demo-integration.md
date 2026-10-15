# Revenue Management integrado al piloto

Integración de `feature/revenue-management` hasta `0dc6f2f8` sobre el demo
`89e98d1c` (SPA). Se seleccionaron únicamente los cuatro commits de Revenue:
`40c5c97f`, `ae33bb1f`, `62cc22ba` y `0dc6f2f8`.

Se conservaron las migraciones de huéspedes/familia/vehículos/mascotas, la marca
Xenia, el asistente y los cambios de SPA. Main no se modifica.

## Ajustes de compatibilidad

- Mantener juntos `ensureGuestStaySchema()` y `ensureRevenueManagementSchema()`.
- Adaptar la prueba de permisos al catálogo del piloto, sin introducir menús
  ajenos a esta entrega.
- Incorporar `shared/date-display.ts` y sus cuatro pruebas desde la base de
  Claude: Revenue dependía de ese helper, que aún no existía en el piloto.
  No se cambiaron otras pantallas ni formatos de fechas de la aplicación.
- La siembra existente de permisos por recurso incluye el menú y las cuatro
  capacidades de Revenue, respetando las revocaciones posteriores del administrador.

## Validación realizada

- Migración completa de la aplicación en PostgreSQL local de pruebas.
- 26 pruebas PostgreSQL de Revenue; 16 de huéspedes/reservas y 5 de SPA.
- 40 pruebas puras de Revenue y 27 de permisos.
- 18 pruebas de cliente de huéspedes/SPA/receptor y 4 del helper de fechas.
- Total: 136 pruebas enfocadas, no una declaración de regresión completa.
- TypeScript y compilación de producción.
- Chromium, respuestas API sintéticas: abrir Tablero, Pace, Calendario de demanda,
  Tarifas de competencia y Sugerencias sin errores de ejecución. Las pruebas de
  PostgreSQL verifican el comportamiento real de los endpoints y cálculos.

## Prueba inicial en demo

Ingresar con administrador: Gerencia & Revenue → Revenue Management.

1. Revisar el tablero y el detalle de un día: ocupación, ADR y RevPAR. Elegir
   también una fecha con reservas de grupo; los cargos extra no deben inflar ADR.
2. En Sugerencias, configurar explícitamente el plan de referencia de cada tipo
   de habitación y confirmar si incluye desayuno. El valor inicial es no incluido.
3. Cargar una tarifa de competencia con tipo, fecha, moneda, personas, reembolso,
   desayuno e impuestos. Los datos incompletos/incompatibles no deben influir en
   las sugerencias. No hay scraping ni publicación automática de precios.
4. Revisar que las sugerencias expliquen sus motivos y no cambien Planes Tarifarios.
5. En Pace, la primera consulta del día al tablero/pace captura un snapshot. Volver
   a consultar no debe duplicarlo. La comparación interanual necesita historial real.

La captura se realiza al consultar el módulo, no mediante cron: si nadie entra un
 día no se crea ese snapshot. Los huecos se informan. La comparación de impuestos
se basa en tarifas propias con IVA incluido y datos declarados manualmente.

Esta integración no incorpora el motor financiero que Replit está diseñando para
Folio/SPA ni elimina la protección de facturación de cobros existentes en SPA.
La publicación del commit en la rama no equivale a una comprobación del despliegue
activo de Railway ni de sus datos; esa comprobación requiere acceso al entorno.
