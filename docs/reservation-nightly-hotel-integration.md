# Folio nocturno: integración propuesta para el hotel

## Estado y alcance

Preparado sobre `main` `299a8b6ca35cc7fb50a40c6b35b3c3a906d92dc6`, en
`integrate/reservation-nightly-folio-hotel`. No constituye publicación ni activación
para el hotel. No se accedió a datos operativos ni se emitieron comprobantes reales.

Se incorporan los permisos individuales de `64065c60` y `f485b953` con la herencia
del hotel, y cambios seleccionados del demo: motor `e873c6b8`, presentación
`68406c51`, diseño aprobado `ac7c04d7`, vinculación de permisos `7e455b93` y cabecera
`9f0e8fe3`. No se fusiona la rama del demo completa. Se excluyen su asistente,
política de acceso externa, datos, usuarios, activaciones y scripts de arranque/seed.
La PR de permisos #82 por sí sola no contiene este Folio; esta integración incluye
sus dos commits funcionales, evitando depender de fusionar ambas propuestas.

## Comportamiento

- Detalle amplio, cabecera y resumen de cuenta; pestañas Datos / Folio / Historial.
- Las reservas `legacy` siguen mostrando el importe contratado. No se reconstruyen
  noches ni se convierten por tener ingreso futuro o editar una nota.
- Para `nightly_v1`, tarifas y descuentos por fecha, selección múltiple, pesos por
  noche o por selección y porcentaje sobre cada tarifa. Vacío conserva; cero quita
  descuento. Distribución exacta en centavos, sin igualar tarifas distintas.
- Preview sin escritura; confirmación con motivo, revisión, actor e historial.
  Cancelar no guarda. Un cambio concurrente devuelve conflicto.
- Modificar estadía conserva noches retenidas, elimina el descuento de la noche
  retirada y exige precio para las agregadas. Revalida habitación y cupos al guardar.
- Cambios de alojamiento no escriben pagos, anticipos, facturas ni Caja. Prefactura
  sigue tomando el total guardado. Se conservan los circuitos financieros de main.
- Bloqueo ante cobertura fiscal parcial/completa, autorización pendiente o evidencia
  ambigua; facturación del grupo remite al Folio Maestro. No se sobrescribe lo fiscal.
- Edición nocturna también exige permiso individual en servidor. Un override puede
  revocar incluso a admin. Sin override se hereda el acceso existente del hotel a
  Reservas; no se importan restricciones por rol del demo. Sólo admin administra
  las excepciones. Se verifica de nuevo en cada escritura.

En la revisión se corrigió la respuesta del aviso de cupo tentativo para conservar
`code=GROUP_BLOCK_WARNING`: el cliente existente necesita ese código para ofrecer
confirmación explícita. Se agregaron pruebas sobre esa combinación.

## Activación y publicación (pendientes de autorización)

La migración sólo agrega columnas con default `legacy`. Es idempotente tanto en
SQL como en el runner incremental. No inserta
`system_settings.reservation_nightly_activation_at`, no actualiza reservas existentes
y no copia configuración del demo.

Si se autoriza la publicación, publicar primero el commit revisado y comprobar
migraciones, salud y herencia de permisos. La activación es una decisión separada:
un admin/manager confirma **Habilitar tarifas por noche**. El servidor registra una
única fecha UTC, con auditoría; una segunda confirmación no cambia esa fecha. Sólo
altas nuevas desde ese momento usan `nightly_v1`, independientemente del ingreso.
No hay corte automático por “mañana” ni conversión por fecha de estadía.

Antes de activar, revisar si la clave ya existe en el hotel; no reemplazarla
silenciosamente. Después, comprobar una nueva reserva autorizada y una anterior.
No borrar la clave ni volver a software que desconoce `nightly_v1` cuando ya existen
reservas nocturnas: cualquier suspensión de nuevas altas o reversión necesita un
plan que mantenga su lectura y edición. Esta integración no ejecuta esa operación.

## Validación de la combinación

Se migraron bases PostgreSQL locales desechables con el runner real. La suite
nocturna dejó de depender de una plantilla/socket del demo: exige consentimiento
`ALLOW_DESTRUCTIVE_PG_TESTS=true`, host local y nombre de base de pruebas; crea datos
sintéticos propios, restaura la activación y elimina sus fixtures.

- 19 pruebas PostgreSQL nocturnas: middleware, permisos heredados y revocados,
  conservación legacy con/sin activación, preview, persistencia, importe en
  Prefactura, anticipo intacto, historial, conflictos, bloqueos fiscales y grupales,
  extensión y disponibilidad, aviso tentativo, rollback y carrera con emisión.
- 9 pruebas del circuito de reservas con API y autenticación reales: idempotencia,
  pagos, transferencia, anulación y recuperación de Prefactura ante respuesta perdida.
- 7 pruebas PostgreSQL de distribución/cobros y edición de forma de pago de grupos.
- 39 pruebas de permisos, concurrencia de facturación, alcance grupal, recuperación
  de pago de grupos y notas de crédito del Folio.
- 31 pruebas de aritmética nocturna, componentes y submission de Prefactura.
- TypeScript y build del proyecto.
- Navegador Chromium local, datos y API simulados: detalle completo a 1366×960,
  820×1180 y 390×844, cuadro dentro del viewport; selección de dos noches,
  pesos → porcentaje → pesos con conservación de valores, cancelar sin guardar.

Comandos reproducibles (usar únicamente bases desechables):

```sh
npm run check
npm run build
npx vitest run shared/nightlyPricing.test.ts client/src/components/reservation-nightly-pricing.test.tsx client/src/lib/prefactura-submission.test.ts
npx vitest run --config vitest.server.config.ts server/tests/accommodation-permission.test.ts server/tests/folio-invoice-concurrency.test.ts server/tests/group-invoice-scope.test.ts server/tests/group-payment-invoice-retry.test.ts server/tests/reservation-folio-credit-note.test.ts
# DATABASE_URL debe apuntar a una base local desechable migrada.
ALLOW_DESTRUCTIVE_PG_TESTS=true npx vitest run --config vitest.server.pg.config.ts server/tests/nightly-pricing.pg.test.ts server/tests/group-invoice-cash-edit.pg.test.ts server/tests/group-distribution-payment-cash-reversal.pg.test.ts
# El circuito autenticado necesita su propia base vacía reservation_flow_test*:
# DATABASE_URL y RESERVATION_FLOW_TEST_DATABASE_URL deben ser idénticas.
npx vitest run --config vitest.server.pg.config.ts server/tests/reservation-operational-flow.pg.test.ts
```

Las comprobaciones visuales usan respuestas simuladas y no acreditan un recorrido
completo contra el hotel. No se probó ARCA real, emisión fiscal productiva ni
notificaciones externas. La revisión final y autorización de publicación siguen
pendientes.
