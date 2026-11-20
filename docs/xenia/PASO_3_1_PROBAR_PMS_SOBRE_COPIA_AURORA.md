# Paso 3.1: probar el PMS sobre la copia recuperada de Aurora

Fecha: 20 de noviembre de 2026. Versión 1. Responsable de la ejecución en Railway: Marcelo. Estado: **preparado; cambio de conexión todavía no ejecutado**.

## Objetivo y alcance

Comprobar que el PMS QA de Aurora puede iniciar sesión, consultar y operar sobre la copia recuperada por PITR, y después volver a su base original. La revisión manual de la reserva de prueba ya coincidió en fechas, tarifas, importe, habitación, huésped y observaciones. Eso no sustituye una prueba de aplicación ni una auditoría de todas las tablas.

La prueba usa el **mismo servicio xenia-aurora-pms**, con el mismo dominio, ficha, identidades y revisión de código. Se cambia temporalmente sólo su DATABASE_URL. Aurora QA tendrá un reinicio al aplicar cada cambio. Maran sigue con su configuración actual; Brisa y el panel no se reconfiguran. Se conserva un solo PMS público con la identidad de Aurora.

| Componente | Nombre |
| --- | --- |
| Proyecto Railway | observant-possibility |
| Entorno del proyecto QA | production |
| Servicio de aplicación | xenia-aurora-pms |
| Dominio del PMS | https://aurora.qa.xeniapms.com |
| Base original | xenia-aurora-pms-db |
| Copia PITR independiente | xenia-aurora-restore-db |
| Conexión de regreso esperada | ${{xenia-aurora-pms-db.DATABASE_URL}} |
| Conexión temporal de ensayo | ${{xenia-aurora-restore-db.DATABASE_URL}} |

Las referencias de la tabla son expresiones de Railway, no conexiones con contraseñas. Antes de editar se conserva la referencia que efectivamente tiene el servicio.

## 1. Registrar la configuración antes del cambio

1. Abrí **https://aurora.qa.xeniapms.com/healthz**. Guardá el resultado con status, mode, revision, propertyId y clientId. Se espera status **ok**, mode **qa**. El contenido corresponde a salud e identidad pública; no requiere publicar secretos.
2. En **xenia-aurora-pms → Deployments**, guardá el ID del despliegue activo y su commit. La revisión candidata comprobada es **f5005dc7d2a702198cb953b59df99b1d92cbbe53**. Si el servicio usa otra revisión o health devuelve unknown, se registra la revisión efectiva y se comprueba su compatibilidad antes de cambiar la conexión.
3. En **xenia-aurora-pms → Variables**, ubicá **DATABASE_URL**. Anotá privadamente su referencia actual. La esperada es **${{xenia-aurora-pms-db.DATABASE_URL}}**. Si apunta a otra base, primero se aclara el estado real.
4. Confirmá que **xenia-aurora-restore-db** sigue Online y que existe **DATABASE_URL** en sus Variables. Se usará una referencia seleccionada a esa variable real. Si el diálogo Connect propone un nombre inexistente como DATABASE_PRIVATE_URL, no se usa ese nombre.
5. Conservá la ficha y los secretos actuales de Aurora. No se genera otra ficha ni se modifica el marcador de instalación de la copia.
6. Conservá el comando de preparación existente **npm run xenia:pms:setup:production**, el arranque **node dist/index.cjs** y la salud **/healthz**. Si la configuración efectiva difiere, se registra antes del ensayo; no se aprovecha esta prueba para cambiar código o comandos.
7. Guardá el momento PITR elegido, con su zona horaria, y la referencia de la restauración que muestra Railway. Registrá también la versión o imagen PostgreSQL de origen y destino.
8. Cerrá las pestañas de edición de reservas durante los cambios. La comprobación original queda como referencia: **RES-1795097940326-24**, habitación **103**, Huesped Prueba, ingreso **20/11/2026**, egreso **24/11/2026**, cuatro noches y total **ARS 300.000**.

## 2. Conectar temporalmente el PMS QA a la copia

1. Entrá en **xenia-aurora-pms → Variables**. Es la tarjeta de la aplicación, sin el sufijo -db.
2. En **DATABASE_URL**, elegí la referencia **xenia-aurora-restore-db → DATABASE_URL**. La expresión esperada es:
   
   `${{xenia-aurora-restore-db.DATABASE_URL}}`

3. Guardá la variable.
4. Abrí **Details** de los cambios pendientes. El cambio esperado corresponde a DATABASE_URL del servicio **xenia-aurora-pms**. Conservá los demás servicios y la revisión de código actual. Si aparecen cambios adicionales de código o configuración, no se mezclan con este ensayo.
5. Aplicá el cambio de ese servicio y esperá el resultado de preparación y despliegue.
6. La preparación debe reconocer la instalación existente y conservar sus datos. Comprueba **property_id, client_id, template** y la huella **schema_digest** antes de continuar. Una incompatibilidad se resuelve por revisión o migración; no se borran tablas ni se cambian identificadores para saltar la comprobación.
7. Cuando aparezca Online, abrí **/healthz**. Debe responder **ok**, **qa**, la misma revisión y los mismos identificadores que en el paso 1. Si falla, ejecutá el regreso del apartado 5.
8. Conservá el ID del despliegue de ensayo y su hora. La variable apuntando a la copia y una escritura observada en la copia permitirán comprobar el destino efectivo; el mismo propertyId por sí solo no distingue una copia física de su origen.

## 3. Probar ingreso y operación

1. Abrí **https://app.xeniapms.com** y elegí **Hotel Aurora → Abrir PMS**. Si la sesión anterior no sirve tras cambiar de base, ingresá nuevamente desde el panel.
2. Buscá **RES-1795097940326-24**. Comprobá huésped, habitación, fechas, cuatro tarifas, total y observaciones. Conservá esa reserva de referencia.
3. En una habitación libre y fechas futuras, creá otra reserva ficticia con la observación **ENSAYO-RECUPERACION-AURORA-20261120**. Usá datos de prueba y la tarifa QA. Anotá su código.
4. Editá una tarifa o la observación de esta reserva nueva, completá el motivo y confirmá desde la interfaz. Recargá y verificá que persiste. Guardá el resultado.
5. En **xenia-aurora-restore-db → Database → reservations**, comprobá que aparece el código de esta nueva reserva y su observación. En **xenia-aurora-pms-db → Database → reservations**, comprobá que ese código está ausente. Consultá sin editar las filas. Si aparece en el origen, el destino efectivo no queda validado y se revisa la conexión antes de seguir.
6. Ingresá con la cuenta de recepción de Aurora que ya se probó. Debe conservar el acceso a Aurora y sus operaciones permitidas, sin administración central ni acceso a Brisa.
7. Comprobá que la cuenta de consulta asignada sólo a Brisa no puede abrir Aurora. No se cambian asignaciones de establecimientos para hacer pasar esta comprobación.
8. Registrá qué cuenta y rol se probaron y los resultados. Consumos, cobros, facturación, check-in, checkout y servicios externos siguen fuera de este ensayo QA.

El ingreso central crea sesiones y concesiones de acceso normales. Esta prueba no restaura el panel ni demuestra continuidad si el panel está caído.

## 4. Registrar los resultados antes de volver

Anotá punto PITR, destino, versión PostgreSQL, revisión del PMS, despliegue de ensayo, resultado de salud, reserva nueva y comprobaciones de acceso. Registrá horas de inicio, disponibilidad y acceso con zona horaria. No se declara un tiempo de recuperación del hotel a partir de esta prueba ficticia.

La reserva nueva debe pertenecer únicamente a la copia. La reserva original de referencia se mantiene para contrastar el regreso. Las variables privadas se conservan en el gestor; el acta no incluye contraseñas, cookies, tokens ni URLs de PostgreSQL completas.

## 5. Volver siempre a la base original de Aurora QA

Este regreso se realiza al terminar la prueba o si falla cualquiera de sus comprobaciones.

1. Abrí **xenia-aurora-pms → Variables → DATABASE_URL**.
2. Restablecé la referencia original guardada en el apartado 1. La esperada es:
   
   `${{xenia-aurora-pms-db.DATABASE_URL}}`

3. Revisá **Details** y aplicá solamente el cambio de conexión de **xenia-aurora-pms**, conservando la misma revisión y el resto de su configuración.
4. Esperá Online y comprobá **https://aurora.qa.xeniapms.com/healthz**: ok, qa y la misma revisión e identidad originales.
5. Volvé a ingresar desde Xenia y comprobá que **RES-1795097940326-24** conserva fechas, habitación, huésped, observaciones y total **ARS 300.000**.
6. Comprobá que la reserva exclusiva **ENSAYO-RECUPERACION-AURORA-20261120** no aparece en el PMS que volvió a la base original. Su permanencia en la copia es esperada y no se traslada al origen.
7. Guardá el ID del despliegue de regreso, hora y resultado. Confirmá en Variables que DATABASE_URL volvió a la referencia original.
8. Conservá la base recuperada y el archivo PITR hasta cerrar el acta. La eliminación de recursos o el cambio de retención se decide después de registrar el resultado.

Si la preparación o la salud fallan, se conserva el error de ese despliegue y se vuelve a la conexión original con la misma revisión conocida. No se rota la ficha ni se modifica la identidad o los datos de la copia para forzar el arranque.

## 6. Criterio de aceptación de este ensayo

El ensayo queda aceptado cuando: el PMS inició con identidad y esquema compatibles; el acceso central y los roles comprobados funcionaron; la reserva de ensayo se creó y persistió sólo en la copia; y el servicio regresó a su conexión original con la reserva de referencia intacta.

La inspección completa de tablas y secuencias, la recuperación de las otras bases, las referencias y retenciones de las cinco copias, y la continuidad ante caída central conservan sus propios controles. Esta guía describe el ensayo; todavía no constituye evidencia de ejecución.

## Referencias de implementación revisadas

- `server/xenia-pms/config.ts`: modo QA y conexiones resueltas.
- `server/xenia-pms/binding.ts`: comprueba property_id, client_id y template.
- `server/xenia-pms/setup.ts`: conserva la instalación existente y comprueba schema_digest.
- `server/xenia-pms/runtime.ts`: /healthz consulta la identidad de la base conectada; el acceso usa el cliente y origen actuales.

Revisión de código consultada: rama **fix/xenia-pms-reservation-edit-20261119**, candidato **f5005dc7d2a702198cb953b59df99b1d92cbbe53**. La revisión efectivamente instalada se registra antes de ejecutar el cambio.
