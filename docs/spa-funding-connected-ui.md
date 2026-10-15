# SPA: preparación fiscal y cajas conectadas al cliente

Base: revisión R5 `6f5dc8dd`, que incorpora `9dfe0b29`.
Rama: `feature/spa-funding-connected-ui`.

## Resultado

La pantalla SPA consume las dos extensiones del backend. El recorrido completo
se probó en navegador con los bindings operativos, PostgreSQL local e inventario
real sobre fixtures sintéticos. El proveedor fiscal y la sesión son sintéticos.
No se contactó ARCA ni se activaron main/Xenia.

## Contrato revisado

Se aceptan para esta integración las extensiones aditivas de la entrega Replit:

- POST `/api/payment-funding/spa/:accountId/prepare-document`, body `{}`.
  Devuelve `{ok:true,data:{documentId,totalCents}}`.
- GET `/api/payment-funding/spa/:accountId/collection-shifts`.
  Devuelve `{ok:true,data:[{id,label}]}`.

Permisos y errores conservan el contrato existente. El servidor reconstruye
receptor, IVA, precios y cargos; el navegador no los envía ni crea snapshots.
Las cajas provienen del servidor y corresponden al cajero autenticado. El servidor
revalida turno/área antes de reservar, aunque la selección del navegador sea vieja.

## Comportamiento

- `SpaFundingConnectedPanel` consulta las cajas y entrega esa lista al panel.
- Si no existe documento draft, ofrece “Preparar comprobante” a quien tiene permiso.
  La acción es explícita; no hay POST automático al abrir la pantalla.
- Después de preparar se recarga la proyección y se comprueba que el ID exista como
  draft. Se selecciona ese documento y se muestran receptor, identificación, IVA,
  tipo y total para revisar antes de confirmar.
- Cobros existentes, dinero nuevo, UUID, previsualización y recuperación siguen
  usando el motor y el único finalizador; no hay segundo registro de pagos/Caja.
- Si la ficha está incompleta, aparece el mensaje específico del backend. Si falla
  la consulta de cajas, se deshabilita el dinero nuevo, sin inventar un turno.
- El rol de consulta no puede preparar ni confirmar. Backend conserva los controles.
- Una operación pendiente se consulta/recupera con su identidad; no prepara otro
  documento ni cambia UUID para resolver una caída.

## Gates y montaje

`VITE_SPA_FUNDING_UI` sigue desactivado por defecto. La página SPA usa ahora el
componente conectado cuando se selecciona expresamente esa interfaz.

`mountConfiguredOperationalSpaFunding(app, enabled=false, reviewedExtensions=false)`
conserva ambos defaults false. Se expone el argumento explícito de extensiones para
una habilitación futura revisada; aprobar el contrato no habilita las rutas.
`server/routes.ts` continúa llamándolo sin flags. El test verifica que true sólo en
reviewedExtensions no activa el montaje ni accede a dependencias.
No se cambió el finalizador, los DTO centrales ni la política de adopción histórica.

## Validación

Pruebas repetidas:

- 28 motor PostgreSQL.
- 19 rutas/fence, adaptador HTTP y bindings PostgreSQL.
- 4 concurrencia R4 con pool de 2.
- 4 persistencia WSAA R5 y recuperación post-CAE.
- 82 permisos, borradores, SOAP y WSAA.
- 27 cliente (22 existentes + 5 de las nuevas conexiones).
- 2 integración conectada: gate desactivada y recorrido Chromium/React/HTTP/PG.
- **Total: 166 aprobadas.**
- TypeScript completo, tsconfig.funding.json y build: correctos.

El recorrido de navegador valida tres escenarios:

1. Cobros existentes $5.000 débito + $90.000 efectivo: preparar desde fuente,
   reservar/autorizar/finalizar, sin nuevos pagos ni movimientos de Caja.
2. $5.000 existentes + faltante $90.000: usar caja autorizada, crear sólo un pago
   y un movimiento por el faltante, cerrar y consumir 2 de 10 unidades de insumo.
3. Fallo después de CAE: recargar navegador, recuperar la misma operación y
   completar sin otra emisión, pago ni movimiento de Caja.

Tres escenarios producen tres autorizaciones sintéticas totales. Se comprueba
saldo cero, una operación por cuenta, cantidades de pagos/Caja y stock. La vista
móvil de 390px no desborda la página. No hubo errores JS en navegador.

Pruebas focalizadas:

```sh
npx vitest run client/src/components/spa/spa-funding-connected-panel.test.tsx \
  client/src/components/spa/spa-funding-panel.test.tsx client/src/lib/paymentFunding.test.ts
npx vitest run --config vitest.funding-connected.config.ts
```

La integración usa la base sintética por socket Unix de las entregas previas.
Arranca y cierra sus propios servidores HTTP/Vite y Chromium. La entrada
`demo/funding/connected-client.html` exige health synthetic=true, emitter=fake y
productionEnabled=false. No es una ruta de la aplicación operativa y no sirve para
conectarse a una base real. No instala esquemas operativos ni importa historia real.

## Homologación y publicación pendientes

La validación fiscal real no se simuló como completada: falta un entorno aislado
con WSAA/WSFE de homologación y credenciales de prueba autorizadas. La configuración
usada aquí es sintética; no se consultó la configuración ni las credenciales de la
base operativa para intentar habilitarlo.

Antes de desplegar: validar identificación y reglas fiscales/catálogo/PV, definir
adopción de cuentas nuevas e históricas, grants administrables para los roles de
prueba y ejecutar el recorrido con el proveedor de homologación. Conservar los
bloqueos sobre historia ambigua/NC/reutilización que el importador aún no soporta.
Sólo después corresponde habilitar en Xenia y revisar su publicación. Main no está
incluido en esta entrega ni se solicita cambiar su marca o sus datos.
