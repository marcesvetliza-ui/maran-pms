# Estadías y Caja en los PMS de prueba de Xenia

Preparado para Marcelo el 23 de noviembre de 2026. Destinos: Aurora y Brisa en `observant-possibility`. Esta entrega continúa la versión QA `f5005dc7d2a702198cb953b59df99b1d92cbbe53`.

El recorrido es: reserva individual → check-in → consumo → cobro de prueba → checkout con saldo de cobro cero → cierre de Caja de recepción. La facturación, Cuenta Corriente, grupos, movimientos manuales de Caja e integraciones externas quedan para entregas específicas. Un pago de prueba no se registra como factura emitida.

La preparación y las pruebas automatizadas usan bases sintéticas. La publicación en Railway y la aceptación con Marcelo son comprobaciones posteriores; sus resultados deben registrarse con la revisión efectiva.

## 1. Ficha de publicación

Primero actualizar **xenia-aurora-pms**. Brisa recibe la misma versión después de aceptar el primer recorrido de Aurora.

| Campo | Valor |
| --- | --- |
| Proyecto / entorno | `observant-possibility` / `production` (proyecto de pruebas de Xenia) |
| Servicio inicial | `xenia-aurora-pms` |
| Repositorio | `marcesvetliza-ui/maran-pms` |
| Rama candidata | `feat/xenia-pms-operations-qa-20261123` |
| Construcción | Dockerfile `Dockerfile.xenia-pms`, en la raíz del repositorio |
| Preparación previa | `npm run xenia:pms:setup:production` |
| Arranque | `node dist/index.cjs` |
| Salud | `/healthz`, puerto actual del PMS, normalmente `5000` |
| Nueva variable del PMS | `XENIA_PMS_OPERATIONS_ENABLED=true` |
| Dirección de Aurora | `https://aurora.qa.xeniapms.com` |
| Dirección de Brisa | `https://brisa.qa.xeniapms.com` |

Se conservan `DATABASE_URL`, `SESSION_SECRET`, `XENIA_PMS_MODE=qa`, identidad, plantilla, orígenes y secreto de conexión de cada instalación. No se copia la ficha de Aurora a Brisa. No se cargan credenciales ARCA, correo, Channex, IA ni pagos externos.

En la interfaz de Railway se utilizan los campos manuales que ya se configuraron; no hace falta volver a activar Config-as-code. El archivo `railway.xenia-pms.json` documenta los comandos, pero no sustituye la verificación de la configuración efectiva del servicio.

El paquete no exige modificar Xenia-Control, DNS ni bases de Maran. Los usuarios entran desde el selector central con sus cuentas existentes.

## 2. Preparar y comprobar Aurora

1. Comprobar que la copia de `xenia-aurora-pms-db` prevista para esta actualización terminó. Anotar su referencia y la revisión del despliegue actual.
2. Abrir la tarjeta **xenia-aurora-pms**, cargar la variable nueva y seleccionar la rama candidata. Verificar que los cambios pendientes correspondan a este servicio.
3. Publicar y esperar construcción, preparación y estado Online. Anotar el commit que realmente quedó instalado.
4. Abrir `/healthz`. Debe informar `status: "ok"`, `mode: "qa"`, `operationsEnabled: true` y la revisión publicada. Los identificadores del establecimiento y del cliente deben conservarse.
5. Entrar nuevamente desde `app.xeniapms.com` → Aurora → Abrir PMS. Recargar la página; el aviso debe decir **Estadías y Caja** y aclarar el alcance de los cobros de prueba.

La preparación conserva habitaciones, reservas y usuarios. Agrega una Caja de recepción, un consumo ficticio de agua y permisos iniciales de la nueva etapa una sola vez. Repetir la preparación conserva cambios y revocaciones posteriores. El esquema exportado conserva sus tablas y su huella: si aparece un error de identidad o de esquema, no se cambia el marcador para forzar el arranque.

La activación aplica además una migración QA versionada para las dependencias del motor común: contador de folios de reserva, índices únicos, tabla vacía de exclusiones usada por las consultas financieras y registro de la versión aplicada. Se ejecuta después de validar la identidad de la base. Conserva los contadores existentes y no fusiona, borra ni reasigna registros históricos; una inconsistencia que impida crear los índices detiene la preparación. La salud de la etapa requiere que esta preparación haya terminado.

## 3. Recorrido manual en el navegador

Usar una cuenta con rol de propietario, encargado o recepción de Aurora y datos ficticios.

1. Abrir **Caja**. Elegir **Abrir turno**, el tipo de turno y la propia cuenta como responsable; confirmar. Si ya hay un turno de la prueba, comprobar quién lo tiene y usar la acción de tomarlo cuando corresponda.
2. Crear una reserva individual de prueba en una habitación libre, por ejemplo la 102. Ingreso hoy, egreso mañana, una noche a ARS 50.000. Completar los datos ficticios que solicite la pantalla.
3. Ir a **Check in**, abrir la reserva y usar **Confirmar Check-in**. Comprobar que la estadía quedó ingresada y la habitación ocupada.
4. Abrir la reserva → **Folio** → **Agregar consumo**. Elegir **Agua de prueba**, cantidad 1, ARS 1.000. Confirmar y recargar: el consumo debe aparecer una sola vez y el total ser ARS 51.000.
5. Usar **Registrar pago**, ARS 51.000, medio Efectivo, y confirmar. Verificar que el pago figure una sola vez y el saldo pendiente de cobro sea cero. La cuenta puede seguir indicando un pendiente de facturación: esta prueba no emite documentos fiscales.
6. Desde el **Folio**, usar **Check-out** y confirmar **Salida de prueba**. Este caso ensaya una salida anticipada, porque la reserva termina mañana; por eso todavía no figura en la lista de salidas de hoy. El servidor vuelve a calcular el saldo. Si aparece deuda nueva, se revisa el folio antes de cerrar.
7. Verificar que la estadía quedó con checkout, que la habitación dejó de estar ocupada y que se conserva la cuenta. El estado de limpieza que corresponda sigue siendo una tarea distinta.
8. Volver a **Caja**. Debe aparecer un cobro de ARS 51.000 asociado a la reserva. Cerrar el turno, ingresar el conteo ficticio correspondiente y elegir la propia cuenta como responsable. El total de cobros debe coincidir y la diferencia de efectivo ser cero.
9. Registrar los resultados y la revisión. Si se usa Transferencia en otra prueba, ese importe suma a transferencias y no al efectivo físico contado.

Ante una respuesta perdida, actualizar el folio y revisar si el consumo o pago ya quedó guardado. Si ya aparece, no se vuelve a cobrar. Los intentos pendientes conservan un identificador para que un reintento idéntico pueda recuperar el resultado sin duplicarlo; cambiar los datos constituye otra operación.

## 4. Aceptación con Brisa y permisos

Después de aceptar Aurora, aplicar la misma rama y la variable en **xenia-brisa-pms**, conservando su base, plantilla e identidad propias. Repetir el recorrido con los datos ficticios de Brisa.

- La cuenta con ambos hoteles puede abrirlos en pestañas distintas; cada folio y cada Caja deben mostrar sólo sus registros.
- Recepción de Aurora continúa limitada a Aurora.
- Consulta de Brisa conserva lectura sin operaciones: no puede registrar ingresos, consumos, pagos ni cierres, tampoco mediante peticiones directas.
- Revocar la membresía central invalida el acceso del PMS. En esta entrega se mantiene la verificación central por petición.

Las pruebas automáticas de fallo de ledger se realizan exclusivamente en el clúster local descartable. No se crean triggers de fallo ni se ejecutan scripts de diagnóstico sobre las bases de Railway.

## 5. Reversión y pendientes

`XENIA_PMS_OPERATIONS_ENABLED=false`, seguido del despliegue del PMS, vuelve a bloquear las operaciones nuevas. Conserva las reservas, cobros y movimientos ya registrados; desactivar la opción no anula pagos ni restaura datos.

Para volver a una revisión anterior se comprueba su compatibilidad con la misma identidad y esquema. Una restauración de datos es un procedimiento separado, con su propio punto de recuperación; no se usa como primera respuesta a un error de interfaz.

Siguen pendientes la recuperación remota completa desde la aplicación, continuidad ante caída central, fiscalidad e integraciones de prueba, consolidación gerencial y alta repetible de otros hoteles. El caso del asistente sobre las mesas BIS continúa separado de esta entrega.
