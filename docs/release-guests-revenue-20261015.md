# Publicación MARAN: huéspedes/reservas y Revenue

Autorización del usuario: trasladar las funcionalidades aprobadas en demo a main.
Base de producción: `9630a06e`. Integración selectiva; no merge de la rama piloto.

## Alcance

- Formulario de huésped amplio/adaptable, nacimiento opcional, agenda de vehículos,
  familiares y mascotas. No crea clientes separados para el grupo familiar.
- Selección explícita por reserva, acompañantes sincronizados y cantidad de
  personas actualizada; persistencia por el endpoint de huéspedes correcto.
- Revenue: tablero, pace, eventos de demanda, competencia manual y sugerencias.
  Incluye las cuatro rondas de implementación/corrección hasta `0dc6f2f8` de Claude.
- Botón de guía PDF junto a Sugerencias; el documento fue adaptado a MARAN.

No incluye Xenia, asistente piloto, rol externo, cambios de SPA ni el motor de
financiación Folio en revisión. La marca y título del navegador de producción
permanecen como MARAN. No se cambian tarifas ni se publican precios automáticamente.

## Migraciones y datos

El arranque agrega tres columnas de perfiles/selecciones y el índice de familiares,
y crea las tablas de Revenue. Las migraciones son aditivas e idempotentes: no
borran huéspedes, reservas, pagos, tarifas ni tablas. No se copian datos del demo.
Las selecciones previas no se inventan ni se marcan al abrir una reserva.
Los cambios del perfil habitual no reescriben las selecciones de estadías pasadas.

Los permisos de Revenue se siembran con el mecanismo existente por recurso, sin
restaurar permisos revocados por el administrador. Admin/manager pueden configurar;
resp_administracion/jefe_recepcion disponen de las capacidades asignadas por Claude.
No se agregan permisos de visitante del demo.

## Primera configuración

- Gerencia & Revenue → Revenue Management.
- Seleccionar planes de referencia por tipo de habitación y confirmar desayuno.
- Competencia se carga manualmente con moneda, ocupación, reembolso, desayuno e
  impuestos. Sin condiciones compatibles, la tarifa no influye en sugerencias.
- Pace comienza con historial real desde sus capturas: se ejecutan al consultar
  tablero/pace y no se duplican el mismo día. No existe un cron diario ni un año
  anterior inventado.
- En huéspedes, guardar datos habituales no confirma presencia; marcar por reserva.

## Verificación y reversión

Validación en base PostgreSQL local de pruebas, nunca sobre producción. Se comprueba
migración, suite cliente/servidor, regresiones PostgreSQL enfocadas y compilación.
La publicación de main no prueba por sí sola que Railway haya activado esa versión.
Si se revierte código, conservar las columnas y tablas nuevas para no perder datos.


Resultado de esta integración: 622 pruebas cliente y 643 servidor completas;
72 pruebas PostgreSQL enfocadas (63 en la base local general de pruebas y 9 del
circuito autenticado en reservation_flow_test_release_20261015). Sin fallos.
TypeScript y build de producción completados. PDF MARAN de 3 páginas, incluido
como recurso con hash en la compilación; la cabecera de producción conserva
Maran Suites System. No se modificaron las rutas financieras de SPA ni Folio.
