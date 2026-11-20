# Paso 3: respaldos y ensayo de recuperación de Xenia

Fecha: 20 de noviembre de 2026. Versión 2: copias confirmadas y elección del método de recuperación. Responsable: Marcelo. Alcance: Aurora, Brisa y el panel de pruebas de Xenia, en `observant-possibility`. La operación actual de Maran se conserva.

Marcelo aceptó la separación de reservas y los perfiles de recepción de Aurora y consulta de Brisa. Marcelo confirmó que las cinco copias terminaron. Este paso prepara la recuperación de esos datos y de sus accesos. Las revisiones exactas instaladas y la restauración remota todavía deben registrarse y comprobarse.

## 1. Guardar la referencia del punto de recuperación

1. Entrá a Railway y abrí **observant-possibility**, entorno **production**. Ese es el nombre del entorno del proyecto de pruebas de Xenia.
2. Abrí **Xenia-Control → Deployments**, seleccioná el despliegue activo y guardá su identificador y el commit que muestra Railway.
3. Repetí para **xenia-aurora-pms** y **xenia-brisa-pms**. La revisión candidata de edición es `f5005dc7d2a702198cb953b59df99b1d92cbbe53`; la revisión servida se confirma en el despliegue activo.
4. Abrí `https://aurora.qa.xeniapms.com/healthz` y `https://brisa.qa.xeniapms.com/healthz`. Guardá `status`, `mode` y `revision`. Se esperan salud `ok` y modo `qa`. Para el panel, comprobá también `https://app.xeniapms.com/healthz`.
5. Conservá en un gestor privado las variables de cada servicio y el acceso a las cuentas proveedoras. La base, las variables de Railway y el código son componentes diferentes de la recuperación. En el acta compartida sólo se anotan nombres y referencias, sin contraseñas ni valores de secretos.
6. Durante este punto de recuperación, dejá las reservas ficticias sin cambios y conservá las fichas de conexión actuales hasta completar las copias.

## 2. Crear las cinco copias en Railway

Usá únicamente las cinco tarjetas de base de esta tabla:

| Tarjeta | Qué conserva |
| --- | --- |
| `xenia-control-db` | Usuarios centrales, roles por establecimiento, registro de hoteles y enlaces de los PMS. |
| `xenia-aurora-db` | Datos de la demostración inicial de Aurora dentro del panel. |
| `xenia-brisa-db` | Datos de la demostración inicial de Brisa dentro del panel. |
| `xenia-aurora-pms-db` | Habitaciones, huéspedes, reservas, tarifas, historial e identidad del PMS completo de Aurora. |
| `xenia-brisa-pms-db` | Habitaciones, huéspedes, reservas, tarifas, historial e identidad del PMS completo de Brisa. |

Para cada tarjeta:

1. Abrí la tarjeta de la **base** y entrá en **Backups**.
2. Usá la opción que muestre el panel para crear una copia manual, por ejemplo **Create backup**.
3. Esperá a que la copia figure terminada; una tarea en curso no se registra como respaldo completo.
4. Guardá nombre de base, ID o referencia de copia, fecha y hora con zona horaria, estado final y retención o vencimiento que muestre el proveedor.
5. Repetí con la siguiente base de la tabla.

Si no está disponible la creación de una copia, registrá esa condición. La alternativa es una exportación lógica de PostgreSQL preparada por la parte técnica. No se registra como realizada una copia que el panel no confirmó.

Si el panel permite programar copias, anotá la frecuencia y retención efectivamente configuradas. Esos valores todavía no constituyen un compromiso de recuperación para un hotel en uso.

## 3. Completar el registro

Guardá esta tabla en el acta del punto de recuperación:

| Base | Referencia de copia | Fecha y hora con zona | Estado | Retención o vencimiento |
| --- | --- | --- | --- | --- |
| xenia-control-db | Pendiente registrar | Pendiente registrar | Terminada, según Marcelo | Pendiente registrar |
| xenia-aurora-db | Pendiente registrar | Pendiente registrar | Terminada, según Marcelo | Pendiente registrar |
| xenia-brisa-db | Pendiente registrar | Pendiente registrar | Terminada, según Marcelo | Pendiente registrar |
| xenia-aurora-pms-db | Pendiente registrar | Pendiente registrar | Terminada, según Marcelo | Pendiente registrar |
| xenia-brisa-pms-db | Pendiente registrar | Pendiente registrar | Terminada, según Marcelo | Pendiente registrar |

Registrá también los tres despliegues activos del punto 1. Conservá sus variables en el gestor privado para poder recuperar la configuración correspondiente al respaldo.

## 4. Preparar el ensayo remoto en una base nueva

El primer destino del ensayo será una base nueva llamada **xenia-aurora-restore-db**, sin aplicación ni dominio conectados. Si se usa PITR, lo creará Railway al recuperar; si se usa exportación lógica, se provisiona vacío. Antes de restaurar se comprueban las versiones de PostgreSQL de origen, herramientas y destino. Una copia nativa del volumen y una exportación lógica son procedimientos distintos.

La documentación de Railway distingue el **Restore** de volumen, que cambia el volumen montado en el servicio existente, de **PITR**, que recupera un punto en un servicio nuevo. [Copias de volumen](https://docs.railway.com/volumes/backups) · [PITR](https://docs.railway.com/volumes/point-in-time-recovery).

La captura del 20 de noviembre muestra PITR desactivado en Aurora. El siguiente paso es **Enable PITR** y aguardar su primer respaldo y un rango de recuperación disponible. Esta activación reinicia esa base y agrega almacenamiento facturado por uso. Las copias manuales no generan un archivo PITR retroactivo. Con PITR el proveedor crea el destino; para la alternativa lógica se prepara una base vacía. Ambos ensayos se registran por separado.

Para la alternativa lógica, el procedimiento previsto es:

1. Confirmar el punto de recuperación, la versión de PostgreSQL y las referencias privadas de origen y destino. La versión se puede consultar técnicamente con `SHOW server_version;`.
2. Crear el destino vacío y comprobar que corresponde a una base nueva del proyecto de pruebas.
3. Exportar una copia lógica consistente del PMS de Aurora con `pg_dump`, o usar una copia nativa sólo si el proveedor ofrece y confirma un destino independiente.
4. Restaurar la copia lógica con `pg_restore`, con detención ante errores y dentro de una transacción, sobre el destino vacío. Las conexiones reales se administran por un canal privado; no se pegan en el acta ni en el chat.
5. Comparar tablas, cantidades, relaciones, secuencias, fechas, tarifas, observaciones e identidad de instalación con el punto respaldado.
6. Comprobar que la base original conserva sus datos posteriores al punto de recuperación.
7. Registrar duración, versiones, resultado y componentes pendientes. El tiempo de un ensayo local pequeño no se usa como tiempo de recuperación del hotel.

Estas instrucciones preparan el ensayo remoto; no declaran que haya sido ejecutado. La ejecución técnica en Railway se concreta una vez confirmadas las copias y la compatibilidad de versiones.

## 5. Conservar la identidad al recuperar el PMS

La copia de Aurora conserva su `propertyId`, `clientId` y plantilla. La preparación comprueba esa identidad y la huella del esquema; una configuración de Brisa debe ser rechazada. No se cambia el marcador para hacer que la copia arranque como otro hotel.

La restauración de datos se valida primero sin conectar una aplicación al destino. El arranque completo y el acceso desde Xenia requieren después un procedimiento de ensayo que conserve o sustituya coordinadamente el origen, los clientes y las sesiones. No se conecta una segunda aplicación pública usando a la vez la identidad de Aurora.

Un respaldo lógico de una base no contiene las variables de Railway, los roles globales del servidor ni archivos externos. La recuperación completa debe cubrirlos por separado cuando corresponda.

## 6. Qué ya se ensayó localmente

Se ejecutó `pg_dump` y `pg_restore` con PostgreSQL 17, en un clúster nuevo por socket Unix y con datos ficticios del PMS de Aurora. Se compararon todas las filas y secuencias, la reserva editada, precios, observaciones, relaciones con huésped y habitación e identidad del hotel. Se comprobó también que el origen conserva un cambio realizado después de la copia.

- [Resultado del ensayo local](evidencia/recuperacion-local-2026-11-19.json).
- [Herramienta reproducible, sin conexiones operativas](evidencia/ensayo_recuperacion_local_20261119.mjs).

La herramienta se ejecuta desde un checkout de la entrega QA `f5005dc7` o compatible, con dependencias instaladas, el esquema QA compilado y PostgreSQL local. Recibe la carpeta de binarios locales y la ruta de su acta de salida; crea y elimina su propio clúster. No acepta conexiones de Railway ni utiliza `DATABASE_URL`.

El resultado valida el procedimiento lógico en el entorno local. Las cinco copias fueron confirmadas por el propietario. Permanecen pendientes sus referencias y la restauración de Railway, el acceso de una aplicación al destino recuperado, el panel central, Brisa, los componentes externos y la medición de recuperación del hotel.

## 7. Criterio para cerrar el paso

El paso se cierra cuando estén registradas las copias remotas y sus configuraciones, se haya restaurado una copia en un destino independiente y se haya verificado un flujo operativo y el acceso con sus permisos en el entorno recuperado. La continuidad ante una caída central y la actualización independiente de cada hotel siguen como hitos separados antes de incorporar un hotel en uso.
