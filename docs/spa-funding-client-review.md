# SPA: revisión y cliente de financiación aislado

## Estado

- Base revisada: `aa93bdb` (centavos de NC) y `ce3fb29` (protección legacy SPA).
- R1 y R2 de `docs/folio-funding-codex-review.md`: resueltos en los casos reproducidos.
- No se modificó el motor, el finalizador, sus DTO ni las rutas operativas.
- Rama de integración de cliente: `feature/spa-funding-client`.
- **Sin habilitación operativa, merge ni despliegue a main/demo Railway.**

## Evidencia repetida

Se ejecutaron en PostgreSQL 16 local, base `folio_funding_synthetic`, socket Unix
`/tmp/folio-funding-isolated/socket`, sin utilizar `DATABASE_URL`:

- 28 pruebas del motor: NC de 10.000 y 10.001 centavos, reintentos, NC sucesivas,
  restauraciones, capacidad, concurrencia, recuperación y conservación de fondos.
- 8 pruebas sobre rutas/almacenamiento SPA reales con conexión sintética: PATCH/DELETE
  rechazados para cuentas adoptadas, conservación del comportamiento no adoptado,
  coordinación con adopción y desconexión del cliente.
- Reproductor original: libera exactamente 10.000 / 10.001 centavos; PATCH al ítem
  devuelve 409 y el handler legacy ejecuta cero escrituras.
- 2 pruebas adicionales del **adaptador cliente HTTP real** contra las rutas del motor
  y PostgreSQL: cobros existentes y modo mixto, repetir reserva/finalización, deuda cero;
  diferencia en movimientos de Caja: cero en existing_only y uno por el faltante mixto.

La pasarela y el cierre de stock de esta evidencia son sintéticos. No acredita el
binding ARCA, la importación histórica ni el callback de inventario operativo.

## Validación del cliente

- 22 pruebas de cliente: centavos, respuestas inválidas, conflictos, selección,
  sólo consulta, confirmación perdida + refresh con el mismo UUID, 202 y recuperación,
  modo mixto, rechazo de proyecciones inconsistentes, plan vencido sin operación persistida y conteo no verificable.
- Navegador Chromium contra React + API + PostgreSQL sintéticos: seleccionar dos
  cobros, reservar, autorizar y finalizar; fallo after_cae, recargar y recuperar la
  misma operación; cierre mixto de $5.000 existentes + $90.000 nuevos, sin deuda restante; vista móvil de 390 px sin desbordamiento de página ni errores JS.
- TypeScript y build de la aplicación: correctos.
- El adaptador de HTTP se probó contra el motor real aislado, no sólo con mocks.

## Cliente implementado

`client/src/lib/paymentFunding.ts` valida los DTO de respuesta, trata HTTP 202 como
operación pendiente, conserva códigos de conflicto, usa centavos enteros y no
importa módulos del servidor. Comprueba la identidad de la operación en las respuestas.

`client/src/components/spa/spa-funding-panel.tsx` permite:

- Consultar cobros por ID con aplicado/reservado/libre, deuda y revisiones de cierre.
- Seleccionar cobros y cantidades sin seleccionarlos automáticamente.
- Elegir solamente documentos draft devueltos por el servidor. No prepara documentos,
  receptor, CAE ni totales fiscales desde el navegador.
- Previsualizar y reservar; persistir UUID/hash/request antes del primer POST.
- Consultar, autorizar, finalizar o recuperar la misma operación según flags del servidor.
- Recuperar después de refresh o pérdida del primer POST: GET por UUID y, sólo ante
  NOT_FOUND, reenviar la misma confirmación. No crea otro UUID para resolver un error.
- Un plan rechazado por disponibilidad/vencimiento se puede revisar sólo tras un rechazo
  explícito del servidor y GET por UUID que confirme NOT_FOUND. La revisión exige otra
  confirmación del usuario; no aborta ni libera fondos de una operación existente.
- Bloquear nuevos planes mientras hay una operación pendiente. No hay fallback a
  emisión legacy, ni llamadas de registro de pagos/Caja, ni botón de abort genérico.
- Mostrar conteo físico null como “No verificable”.
- Limitar dinero nuevo a turnos provistos mediante `collectionShifts`, con IDs verificados
  por el backend. Sin esa lista, el formulario mixto queda deshabilitado.

El registro de recuperación usa sessionStorage particionado por usuario y cuenta.
No contiene receptor fiscal, CAE ni documentos completos. Si falla su persistencia,
no se envía la reserva; si está dañado, se bloquea la confirmación. Si el registro
local no existe, se buscan operaciones pendientes en la proyección del servidor.
La recuperación durable sigue siendo responsabilidad del motor, no del almacenamiento local.

## Unión con SPA y bloqueos pendientes

La pantalla `spa.tsx` incorpora el componente bajo **VITE_SPA_FUNDING_UI=true**.
Por defecto es false: no cambia el SPA publicado. Al optar por la pantalla nueva,
se reemplaza el formulario de liquidación legacy; un error/404 de financiación
muestra bloqueo, nunca vuelve al cierre viejo.

**No activar ese flag en producción ni en la demo operativa todavía.** El flag sólo
selecciona la interfaz, no declara que el backend esté listo ni sustituye permisos.
El código actual no monta el motor en `server/routes.ts`.

Replit debe completar antes de habilitar:

1. Preparación fiscal validada, pasarela persistente y recuperación del mismo comprobante.
2. Adopción/importación histórica verificada por identidades, sin adivinar vínculos.
3. Cierre/stock real transaccional con el PoolClient recibido.
4. Sesión y permisos reales: mapear read/write del contrato. El cliente no otorga permisos;
   `funding:write` debe venir de la sesión y las rutas deben comprobarlo nuevamente.
5. Fuente de turnos SPA abiertos autorizados para poblar `collectionShifts`. La integración
   operativa actual no la provee: el modo mixto se demuestra sólo en el cliente sintético.
6. Pruebas conjuntas con esos bindings antes de solicitar habilitación/despliegue.

No se integran en este cliente cargo a habitación, cuenta corriente, vouchers,
retenciones ni correcciones de cobro: son circuitos separados que no deben simular dinero nuevo.

## Revisar la pantalla sintética

Con la base sintética preparada según `docs/folio-funding-api.md`:

```sh
node --import tsx demo/funding/server.ts /tmp/folio-funding-isolated/socket 8099
npx vite --config vite.spa-funding-demo.config.ts
```

Entrada `demo/funding/spa-client.html`, servida por Vite en el puerto 8100.
La pantalla exige que `/api/demo/health` declare synthetic=true, productionEnabled=false
emitter=fake antes de ofrecer escenarios. Esta comprobación es sólo para la demo;
no habilita ni se incorpora al servidor operativo.

Los escenarios conservan estado tras reiniciar. No reseedear dinero para repetir una
operación completada: consultar su historial. El servidor de demo tiene permisos
sintéticos explícitos; nunca se utiliza como binding operativo.
