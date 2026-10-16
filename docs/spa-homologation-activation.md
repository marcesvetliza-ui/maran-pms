# Probar el nuevo circuito SPA en MARAN

La autorización posterior de Marcelo incluye probar en main/MARAN, cuya
configuración fue cambiada a homologación. Este documento reemplaza, para esta
prueba, la restricción de las entregas anteriores que sólo contemplaba Xenia.
No convierte los informes de pruebas sintéticas en una homologación fiscal real.

Corrección posterior al chequeo en MARAN: `pos_configs.tipo` guarda
`electronico`, no `online` (este último corresponde a otra configuración fiscal).
El instalador y la preparación usan ahora el valor real del catálogo. No requiere
modificar el PV 0023. Verificados 22 casos SQL/HTTP, 8 del instalador empaquetado y
14 de validación; se rechazan PV manuales y varios electrónicos activos en SPA.

## Estado y límites

El código permite habilitar explícitamente el circuito, instalar su esquema y
vincular una cuenta por vez. El servicio y su base no son accesibles desde el
workspace de esta entrega: no se verificó su configuración ni se ejecutaron estos
pasos allí. No se contactó WSAA/WSFE real.

Homologación afecta al proveedor fiscal. **Los cobros, Caja y consumos de stock
se registran en la base del servicio donde se confirma la operación.** No se
vuelven ficticios por cambiar ARCA a homologación. Usar una cuenta de prueba
identificada y revisar sus importes e insumos antes de confirmar.

Se mantienen dos configuraciones independientes:

- `SPA_FUNDING_HOMOLOGATION_ENABLED=true`: monta backend y extensiones revisadas.
  Requiere esquema instalado y configuración fiscal completa de homologación.
- `VITE_SPA_FUNDING_UI=true`: muestra la opción en SPA. Requiere rebuild del cliente;
  también se declara como ARG en Docker. No habilita el backend por sí sola.

Sin flags, permanece el circuito anterior. Con flags, las cuentas no vinculadas
conservan sus controles anteriores y la opción explícita de vincular. Las ya
vinculadas usan únicamente el motor nuevo; si no se puede verificar su estado,
la pantalla bloquea las acciones hasta volver a consultar.

## Activación en el servicio correcto

1. Desplegar el commit de esta entrega en el servicio MARAN autorizado, todavía
   sin ambos flags. No copiar conexiones, secretos ni configuración desde Xenia.
2. Desde la consola del mismo servicio, ejecutar el chequeo sin escrituras:

   ```sh
   node dist/install-spa-funding.mjs
   ```

   Usa la conexión existente del servicio. Sólo informa disponibilidad de
   configuración/esquema; no imprime claves, certificados, CUIT ni conexión.
   Verifica homologación, CUIT emisor, PV homologación positivo, presencia de
   certificado/clave y un único PV SPA electrónico activo. **No valida autenticación
   contra ARCA ni cambia esa configuración.**
3. Si el chequeo es correcto, instalar explícitamente:

   ```sh
   node dist/install-spa-funding.mjs --install
   ```

   Crea sólo `payment_funding` en una transacción. No importa cuentas ni modifica
   pagos, Caja, stock o permisos. Repetirlo en una instalación completa no vuelve
   a ejecutar DDL; una instalación parcial se rechaza para revisión.
4. En permisos de rol, sección **Financiación Folio/SPA**, asignar al operador de
   prueba `funding:read`, `funding:write` y, para vincular cuentas,
   `funding:historical`. No hay grants automáticos. Los usuarios de consulta no
   necesitan permisos de operación/conciliación.
5. Configurar ambos flags anteriores en ese servicio y hacer rebuild/redeploy.
   El servidor rechaza el arranque del circuito si falta esquema/configuración o
   si el ambiente fiscal es ficticio/producción.

## Recorrido de prueba

1. Crear una cuenta directa SPA de prueba, sin facturas/NC anteriores. Completar
   la ficha fiscal del cliente y los cargos antes de vincularla. Se admiten
   FA/FB, ARS, cargos al 21% y medios monetarios soportados. CC, vouchers,
   cargo a habitación y condiciones fiscales no soportadas conservan su circuito.
2. Abrir el folio y pulsar **Vincular cuenta al nuevo circuito**. Sólo se importan
   los cobros cuyos IDs, montos y medios concilien con Caja y folio. No se cobra,
   factura ni descuenta stock en este paso. No se importa historia fiscal por
   este endpoint; se rechaza para conciliación específica.
3. Pulsar **Preparar comprobante** y revisar receptor, documento y total.
4. Seleccionar los cobros existentes. Si cubren todo, no agregar dinero nuevo.
   Si falta, cargar sólo la diferencia y elegir una caja SPA propia abierta.
5. Previsualizar y confirmar. Revisar factura de homologación, pagos, Caja y stock.
   Repetir/recuperar conserva el UUID; un pendiente no habilita otra factura.
6. Recargar y verificar que la misma cuenta siga vinculada, y que no aparezcan
   pagos, movimientos o consumos duplicados. Probar también otra cuenta sin
   vincular para confirmar que mantiene el circuito anterior.

La vinculación es persistente; no es un tilde de vista. No quitar flags ni borrar
el esquema para volver al circuito anterior cuando existan cuentas vinculadas u
operaciones pendientes. El cambio posterior de ARCA a producción necesita una
revisión de transición: este transporte nuevo sigue rechazando producción.

## Contrato adicional

- GET `/api/payment-funding/spa/:accountId/enrollment`: permiso `funding:read`,
  `{ok:true,data:{adopted:boolean}}`.
- POST `/api/payment-funding/spa/:accountId/adopt-unbilled`: body `{}`, permisos
  `funding:write` y `funding:historical`. Respuesta
  `{ok:true,data:{accountId}}`. Repetir una vinculación confirmada es idempotente.
  Usa el mismo lock de cuenta del fence legacy y del motor. Cada vinculación
  genera un evento auditado con operador. No admite snapshots ni importación
  histórica enviados por el navegador.

Los endpoints y el finalizador financiero existentes conservan su contrato.

## Verificación reproducible

En el PostgreSQL sintético local, sin conexión operativa y sin ARCA real:

Resultado de esta entrega: 655 pruebas cliente, 709 servidor, 22 de integración
funding/SPA, 5 del comando empaquetado de instalación y 2 de navegador/SQL:
**1393 aprobadas**. TypeScript de la aplicación y del instalador, y build con la
interfaz habilitada, correctos. El navegador valida cobros existentes, cobro sólo
del faltante y recuperación posterior al CAE simulado. La suite de instalación
verifica dry-run sin DDL, repetición sin pérdida de auditoría, rechazo de producción,
credenciales incompletas e instalación parcial. No acreditan emisión ARCA real.

```sh
npx vitest run --config vitest.server.config.ts server/tests/spa-funding-homologation.test.ts
npx vitest run client/src/components/spa/spa-funding-gate.test.tsx client/src/components/spa/spa-funding-connected-panel.test.tsx client/src/components/spa/spa-funding-panel.test.tsx client/src/lib/paymentFunding.test.ts
npx vitest run --config vitest.funding-isolated.config.ts
npx vitest run --config vitest.funding-connected.config.ts
npm run check
VITE_SPA_FUNDING_UI=true npm run build
# Necesita el artefacto real del build anterior, no correr en paralelo al build:
npx vitest run --config vitest.funding-installation.config.ts
```
