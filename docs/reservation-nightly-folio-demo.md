# Folio por noche: implementación y demo aislada

## Integración para el demo remoto

La publicación solicitada para `demo.maranpms.com.ar` se prepara sobre el
commit `1a62c192e3fbd3ae96b7607bc11d3cf0a39b788a` de su rama efectivamente
configurada, `fix/assistant-diagnostic-format`, preservando el asistente ya
presente. No se cambia el servicio origen ni la rama `main` del hotel.

Se resolvieron dos diferencias de contexto sin importar funcionalidades ajenas:
el build de este demo no tiene el instalador SPA de la rama principal, y su
registro de rutas no tiene el middleware de financiación añadido posteriormente
en main. La integración agrega el registro nocturno sin traer esos cambios.

Validación de esta combinación concreta: TypeScript y build completos correctos;
17 pruebas nocturnas, 13 pruebas PostgreSQL en copia descartable y las 7
regresiones de tarifa cero existentes en esta base, todas aprobadas.
No se usó la base remota para ejecutar pruebas financieras.

La migración no activa automáticamente el esquema ni convierte reservas
existentes. La activación para altas nuevas sigue requiriendo la confirmación
del administrador desde el Folio.

## Entrega y límites

- Rama: `feature/reservation-nightly-folio`, desde main remoto actualizado
  `41eb2ac3984c054671d2ca3e266d17e232d97ce1`; revisión previa en
  `reservation-nightly-folio-audit.md`.
- Sin integración, push a main ni publicación. La aplicación operativa y sus
  datos no se usan para las pruebas.
- Diseño amplio con Datos / Folio / Historial, cabecera y acciones persistentes,
  alojamiento nocturno, consumos/cobros existentes y resumen lateral adaptable.
- Las operaciones de cargos, origen, anulación, transferencia y Prefactura
  permanecen en sus componentes y circuitos originales.
- Planning conserva su editor rápido de datos. Para el esquema nuevo bloquea
  sus antiguos campos de tarifa/fechas y dirige al mismo Folio completo.

## Contrato de precios y compatibilidad

Tres columnas nuevas en `reservations`:

| Columna | Valor / propósito |
| --- | --- |
| `pricing_scheme` | `legacy` por defecto; `nightly_v1` sólo al crear después de activación |
| `nightly_pricing` | JSON de fecha nocturna, tarifa en centavos y descuento en centavos |
| `pricing_revision` | Revisión entera para rechazar una edición obsoleta |

DDL idempotente en `migrations/20261019_reservation_nightly_pricing.sql` y en el
runner incremental de `server/migrate.ts`. No hay backfill de tarifas ni
activación implícita.

La activación se persiste en `system_settings` como
`reservation_nightly_activation_at`, un instante del servidor. Se informa en
la zona del hotel, `America/Argentina/Buenos_Aires`, no en el día del navegador.
Un administrador/manager puede activarla desde la ficha de una reserva anterior;
el POST de activación requiere confirmación y es idempotente. La identidad de
reservas existentes no cambia al consultar, modificar datos o cambiar estado.

Al contratar una reserva nueva se guarda el detalle a partir de los valores
explícitos de esa alta. No se reconstruyen reservas históricas. Las ediciones
posteriores se hacen desde **Editar tarifas** o **Modificar estadía**:

- Vacío conserva; cero elimina el descuento; un descuento nuevo reemplaza.
- Una tarifa común debe ingresarse expresamente para reemplazar las diferentes.
- Porcentaje sobre cada tarifa; importe fijo por noche o por selección.
- El total de selección se distribuye proporcionalmente, con mayores restos y
  desempate por orden de fecha. La suma conserva cada centavo.
- Las noches que permanecen conservan sus valores; una agregada exige tarifa
  explícita. Al quitar una noche se retira también su descuento, sin repartirlo.
- Se exige motivo, vista previa del servidor y revisión vigente.
- El editor mantiene una fotografía de su revisión; un refresco de consultas
  no acepta silenciosamente cambios de otro operador.

`total_room_amount` es siempre la suma canónica del detalle nocturno. Los
campos de tarifa única se mantienen como compatibilidad para lectores antiguos;
no se presentan como el contrato por fecha del esquema nuevo. Folio, Prefactura
y facturación siguen utilizando el total y el motor financiero existentes.

## Protección fiscal aprobada

El usuario eligió el bloqueo conservador: con alojamiento parcial/completamente
facturado o autorización en curso, no editar tarifas/descuentos/noches hasta
resolver el ajuste por el circuito fiscal existente. No se atribuye una factura
global a determinadas noches. Historial fiscal ambiguo exige revisión, no
desbloqueo por suposición.

Se distingue pendiente/parcial/facturado cuando hay evidencia suficiente.
Facturación grupal se revisa desde el Folio Maestro. Los anticipos por sí solos
no bloquean. Esta funcionalidad no emite NC, devuelve pagos ni mueve Caja.

Guardado y emisión utilizan el alcance de bloqueo fiscal existente
`folio-invoice:<reserva>`, además del alcance grupal cuando corresponde,
inventario y fila. El detalle, total, revisión, actor y changelog anterior/nuevo
se guardan en una transacción. El PATCH genérico no puede cambiar el esquema ni
saltarse la edición nocturna.

## Preparar y ejecutar sin datos operativos

Requisitos: dependencias del lockfile disponibles, Node y PostgreSQL 16
(`initdb`, `pg_ctl`, `psql`, `createdb`). Ejecutar desde esta rama/worktree:

```sh
# Antes de abrir la demo; crea una copia descartable para las pruebas.
bash scripts/nightly-folio-demo.sh --test

npx tsc --noEmit --incremental false
npx vitest run shared/nightlyPricing.test.ts
npx vitest run --config vitest.server.config.ts \
  server/tests/reservation-zero-rate-routes.test.ts
npm run build

# Aplicación completa, frontend compilado y autenticación real.
bash scripts/nightly-folio-demo.sh --serve
```

El servidor escucha en el puerto 8008. En Vista Previa, pulsar la dirección
actual y seleccionar ese puerto. No ocupa el servidor operativo.
Antes de repetir `--test`, detener el servidor de la demo: PostgreSQL
no permite clonar una base plantilla con conexiones activas. Las pruebas clonan
sólo la base sintética conocida, usan middleware y handlers reales, y eliminan
su propia copia al finalizar.
Las ediciones previas de tarifas en la demo no cambian la base del test:
se normaliza únicamente la copia descartable, nunca la demo interactiva.

La base de demo es exclusivamente `maran_nightly_folio_demo`, en el socket Unix
`/tmp/maran-nightly-folio-demo/socket`, puerto PostgreSQL 55478, sin escucha TCP.
Los scripts comprueban nombre/ubicación y rechazan una URL diferente. No
consumen el `DATABASE_URL` heredado ni credenciales fiscales o de integraciones.
El seed es idempotente: reiniciar no borra ediciones de la demo.

Usuario **exclusivamente sintético**: `demo.nightly`.
Contraseña **sólo para esta demo local**: `DemoNightly2026!`.
No reutilizar esta cuenta/configuración fuera de la base descartable.

Casos:

| Ruta de detalle | Contenido |
| --- | --- |
| `/reservations?view=nightly-demo-editable` | 3 noches: $90.000 / $95.000 / $100.000; total $285.000 y anticipo $50.000 |
| `/reservations?view=nightly-demo-partial` | Mismo alojamiento, evidencia fiscal sintética de $100.000 |
| `/reservations?view=nightly-demo-full` | Alojamiento con evidencia fiscal sintética completa |
| `/reservations?view=nightly-demo-legacy` | Reserva anterior: importe original, sin desglose inventado |

Las facturas de muestra son filas ficticias de la base descartable, nunca
autorizaciones emitidas por ARCA. No se llama a servicios fiscales para crearlas.

**Estado después de la demostración:** el primer caso conserva la edición
guardada de 10%, total **$256.500**, anticipo **$50.000** y revisión 1. Los valores
de la tabla anterior describen el estado inicial del seed, no un reinicio que
borre esa edición.

Circuito editable de ejemplo:

1. Abrir el primer caso, seleccionar las 3 noches y dejar tarifa común vacía.
2. $5.000 por noche → total $270.000.
3. Cambiar al selector real de porcentaje, ingresar 10% → $256.500,
   con descuentos $9.000 / $9.500 / $10.000.
4. Volver a pesos conserva $5.000 y su cálculo. Cancelar no escribe.
5. Guardar una propuesta con motivo, cerrar/reabrir y comprobar historial,
   cobro original y el mismo alojamiento en Prefactura, sin emitir.

## Verificación ejecutada

- TypeScript completo: sin errores.
- Build completo de frontend, servidor y assets: correcto. Conserva avisos
  heredados de tamaño/import.meta del bundler; no son errores de compilación.
- 17 pruebas de contrato/aritmética: distintas tarifas, conservar/reemplazar/cero,
  porcentajes, distribución exacta y sus propiedades, límites, fechas y estadía.
- 13 pruebas con PostgreSQL real, todas aprobadas en una ejecución aislada:
  autorización, activación sólo para altas nuevas, preview sin escritura,
  persistencia y log, anticipos intactos, facturación parcial/completa, legado,
  PATCH genérico, agregar/quitar, disponibilidad perdida tras preview,
  concurrencia de operadores, rollback si falla el historial y carrera fiscal.
- 10 regresiones del circuito anterior de tarifa cero: aprobadas.
- Navegador real, usuario y sesión reales, sin mocks del circuito:
  alternancia pesos/%/pesos, conservar tarifas, cancelación sin cambios
  comprobada por GET, preview de servidor y guardado con motivo, cerrar/reabrir,
  persistencia de revisión 1, anticipo intacto, historial con actor y antes/después,
  coincidencia de Prefactura y Folio, parcial/completa bloqueadas y legado sin
  noches inventadas. No se emitió ni cobró.
- Escritorio 1440×1000, tablet 1024×1000 y celular 390×844: controles accesibles,
  sin desborde horizontal del documento. En celular la comparación de noches
  requiere desplazamiento horizontal **dentro de su tabla**, además del
  desplazamiento vertical del editor.
- Planning: revisión de código y bloqueo del PATCH genérico comprobado en
  PostgreSQL. El acceso completo desde su editor rápido no se recorrió en
  navegador; no se declara como prueba visual realizada.

Evidencia de navegador: `i0dss6` (Folio persistido), `y8gap3` (10%),
`ijh167` (volver a pesos), `n884n3` (historial), `lgq5x5` (Prefactura),
`5mpgd4`/`jwift9` (fiscal), `q8tojx` (anterior), `hhcfl6`/`mon4dh`
(tablet/celular). Son identificadores de las capturas de esta sesión.

## Limitaciones y preparación del entorno

- No se implementó cobertura fiscal por noche: fue la alternativa descartada
  para este alcance. El bloqueo puede incluir noches potencialmente pendientes.
- No se convierten reservas anteriores ni se cambian circuitos fiscales.
- La creación de índices/columnas de esta entrega no activa el esquema.
- En una base limpia generada sólo con Drizzle se detectaron prerrequisitos
  heredados: secuencia de recibos grupales e índice único de líneas de compra.
  El bootstrap **sólo de demo** los prepara; no se repararon datos operativos.
- Restaurar todo el lockfile en este entorno fue bloqueado por la política de
  seguridad de un paquete heredado. No se esquivó el bloqueo ni se modificó
  `package.json`/lockfile; se usaron dependencias disponibles y se restauró
  aisladamente la dependencia faltante `otplib` que ya exige main.
- La demo sirve assets compilados para evitar compartir caché de Vite con el
  otro servidor de desarrollo. La opción está restringida a la URL Unix exacta
  de esta base descartable; no agrega un acceso de autenticación alternativo.
  `--serve` compila un servidor local separado en `dist/nightly-demo`, con las
  cookies normales de desarrollo para HTTP local. No sobrescribe la entrada
  productiva `dist/index.cjs`, que conserva su configuración HTTPS.
- No se probó ni autorizó integración, publicación o emisión fiscal real.
