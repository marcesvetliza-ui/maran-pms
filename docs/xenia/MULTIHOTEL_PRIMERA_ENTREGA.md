# Primera entrega multihotel de Xenia

Fecha: 17 de noviembre de 2026. Base: `main` en `2301ffb6` (incluye la PR 118).

Prioridad confirmada por Marcelo: construir la base multihotel antes de retomar el asistente.

Esta entrega construye el panel central como una aplicación separada dentro del repositorio. Los comandos y el servidor actuales del PMS conservan su comportamiento. El panel administra clientes, establecimientos, usuarios y permisos y permite probar reservas ficticias en bases independientes. Todavía no conecta el selector con el PMS operativo completo.

## Qué se puede probar

- Alta de clientes o cadenas y establecimientos con módulos habilitados.
- Preparación de una base exclusiva por establecimiento. Si una conexión contiene tablas ajenas, se rechaza sin modificar ese esquema. Un alta fallida conserva su instalación reservada y permite reintentar.
- Inicio de sesión con contraseña, sesiones HTTP-only, protección de solicitudes y permisos revisados por el servidor en cada petición.
- Administración general, responsable de grupo con acceso a sus dos establecimientos sin permisos de administración de Xenia, recepción con acceso a Hotel Aurora y consulta de Apart Brisa sin permiso de escritura.
- Asignar, cambiar y revocar permisos. La revocación alcanza sesiones que ya estaban abiertas.
- Selector de establecimiento por pestaña. Las peticiones incluyen el contexto explícito y el servidor comprueba la membresía; cambiar una URL no habilita otro hotel.
- Reservas ficticias guardadas en bases diferentes, con lectura, alta y anulación. Se mantiene el historial de las anuladas.

Los módulos de restaurant, spa, eventos y grupos quedan registrados como capacidades por establecimiento. Esta entrega no afirma que sus circuitos operativos estén conectados al panel central.

## Aceptación manual del panel publicado

El 17 de noviembre de 2026, Marcelo confirmó desde su navegador el ingreso a `https://app.xeniapms.com`, el alta activa de Hotel Aurora y Apart Brisa y estas pruebas:

| Prueba | Resultado comunicado por Marcelo |
| --- | --- |
| Una reserva ficticia por establecimiento, ambas en la unidad 101 | Cada reserva aparece únicamente en su establecimiento. |
| Recarga de la página | Las reservas permanecen guardadas y separadas. |
| Responsable | Puede alternar entre ambos establecimientos y crear reservas de prueba. |
| Recepción Aurora | Opera únicamente en Aurora. |
| Consulta Brisa | Consulta únicamente Brisa; no puede crear ni anular reservas. |
| Administración de Xenia | Los tres perfiles de prueba no tienen acceso a esta sección. |

Esta es evidencia de una prueba manual realizada por el propietario, registrada en [el acta de aceptación](evidencia/multihotel-aceptacion-2026-11-17.json). Se complementa con las 24 pruebas PostgreSQL/HTTP y el recorrido automatizado de Chromium aprobados para el código funcional `02fe8c35`. La comprobación externa de `/healthz`, el SHA exacto servido por Railway y un ensayo remoto de restauración no fueron verificados desde este entorno.

La siguiente entrega se prepara en [SEGUNDA_ENTREGA_PMS_AISLADO.md](SEGUNDA_ENTREGA_PMS_AISLADO.md): una instalación completa de prueba para Aurora y su enlace de identidad con el panel. Las reservas actuales siguen siendo el ejercicio mínimo de aislamiento.

## Demostración local

Requisitos: Node 22 o superior, dependencias del repositorio (`npm ci`) y binarios locales de PostgreSQL (`initdb`, `pg_ctl` y `createdb`). Se detecta la carpeta con `pg_config`; también puede indicarse con `XENIA_PG_BIN`.

```sh
npm run xenia:demo
```

Abrir `http://127.0.0.1:4186`. El modo de demostración muestra cuatro accesos identificados. Crea un clúster nuevo y descartable, accesible sólo mediante un socket Unix, una base central y tres bases de establecimientos. Dos contienen datos ficticios; la tercera permite probar un alta. Al detener la demostración se destruye exclusivamente ese clúster temporal.

La demostración no lee `DATABASE_URL`, no copia datos de Maran y no envía facturas, tarifas, correos ni solicitudes a ARCA o Channex. El acceso por personaje se rechaza fuera del modo local de demostración y en producción.

## Instalación propia del panel

Las bases deben ser nuevas y exclusivas. No utilizar una base del PMS operativo. Las conexiones se cargan como secretos del servicio, nunca en el navegador ni en Git.

Variables obligatorias:

| Variable                       | Uso                                                                                                     |
| ------------------------------ | ------------------------------------------------------------------------------------------------------- |
| `XENIA_CONTROL_DATABASE_URL`   | Base PostgreSQL exclusiva del panel central.                                                            |
| `XENIA_PROPERTY_DATABASES`     | Objeto JSON de referencias internas a conexiones de bases independientes. No se devuelve a la interfaz. |
| `XENIA_CONTROL_SESSION_SECRET` | Secreto aleatorio de 32 caracteres o más, independiente del PMS.                                        |
| `XENIA_CONTROL_ORIGIN`         | Origen exacto del panel; HTTPS en producción.                                                           |
| `XENIA_CONTROL_PORT`           | Puerto propio; por defecto 4186.                                                                        |
| `XENIA_INITIAL_ADMIN_USERNAME` | Usuario de la administración inicial.                                                                   |
| `XENIA_INITIAL_ADMIN_NAME`     | Nombre visible de esa cuenta.                                                                           |
| `XENIA_INITIAL_ADMIN_PASSWORD` | Contraseña inicial de 12 caracteres o más. Se utiliza en la preparación inicial.                        |

Ejemplo de estructura de `XENIA_PROPERTY_DATABASES`, completado sólo dentro del gestor de secretos:

```json
{
  "instalacion-a": "<conexión de la base exclusiva A>",
  "instalacion-b": "<conexión de la base exclusiva B>"
}
```

Una vez cargadas las variables:

```sh
npm run xenia:setup
npm run xenia:build
npm run xenia:start
```

`xenia:setup` es una acción explícita. El arranque habitual no crea tablas ni migra bases. Si ya existe una cuenta, la preparación conserva usuarios, contraseñas y datos. Los comandos no recurren a `DATABASE_URL` ni al secreto de sesión del PMS.

`Dockerfile.xenia-control` prepara una imagen independiente con el panel y su comando de inicialización compilado. Para una imagen ya construida, la preparación explícita se ejecuta con `npm run xenia:setup:production`. El servicio usa `XENIA_CONTROL_PORT` o el `PORT` asignado por el proveedor y expone `/healthz` para comprobar la conexión central.

El panel utiliza un servicio propio y nuevas bases en el proyecto de pruebas de Xenia. La instalación publicada en `app.xeniapms.com` fue probada por el propietario; el procedimiento siguiente permite reproducirla en otra instalación independiente.

## Publicación de prueba desde GitHub en Railway

Destino de trabajo identificado en la documentación de Xenia: proyecto `observant-possibility`. La instalación se realiza en servicios nuevos dentro de ese proyecto. La selección de la rama del PMS existente se conserva.

El archivo `railway.xenia-control.json` selecciona el Dockerfile del panel, su preparación previa y su comprobación de salud. El nombre separado evita convertirlo en la configuración predeterminada del PMS. Sólo se aplica al servicio que lo seleccione expresamente.

1. Dentro de Xenia, crear un **servicio vacío** llamado `xenia-control`. No conectarlo todavía al repositorio: primero se configuran las bases y las variables.
2. Crear tres bases PostgreSQL nuevas desde **New / Database / PostgreSQL** y nombrar sus servicios `xenia-control-db`, `xenia-aurora-db` y `xenia-brisa-db`. Corresponden a la administración central y a los dos establecimientos ficticios. Conservar los volúmenes persistentes creados por Railway. Esta primera instalación usa tres servicios PostgreSQL para que la configuración se pueda completar desde la interfaz, sin ejecutar SQL manual sobre una instancia existente.
3. En **Variables** de `xenia-control`, agregar las conexiones mediante referencias protegidas de Railway. Elegir las variables `DATABASE_URL` de los servicios recién creados. No copiar conexiones de los servicios anteriores de Xenia o Maran y no publicarlas por chat.

   | Variable del panel | Valor / referencia |
   | --- | --- |
   | `XENIA_CONTROL_DATABASE_URL` | `${{xenia-control-db.DATABASE_URL}}` |
   | `XENIA_PROPERTY_DATABASES` | `{"aurora":"${{xenia-aurora-db.DATABASE_URL}}","brisa":"${{xenia-brisa-db.DATABASE_URL}}"}` |
   | `RAILWAY_DOCKERFILE_PATH` | `Dockerfile.xenia-control` |
   | `NODE_ENV` | `production` |
   | `PORT` | `4186` |
   | `XENIA_CONTROL_SESSION_SECRET` | Secreto aleatorio exclusivo de al menos 32 caracteres, generado y guardado en el gestor de contraseñas. |
   | `XENIA_INITIAL_ADMIN_USERNAME` | Usuario elegido para la administración, por ejemplo `marcelo.admin`. |
   | `XENIA_INITIAL_ADMIN_NAME` | Nombre visible de la administración. |
   | `XENIA_INITIAL_ADMIN_PASSWORD` | Contraseña exclusiva, de al menos 12 caracteres y hasta 72 bytes UTF-8; guardarla en el gestor de contraseñas. |

4. En **Networking**, generar un dominio de Railway para el servicio y puerto 4186. Copiar sólo su dirección pública y agregar `XENIA_CONTROL_ORIGIN` con ese origen HTTPS exacto, sin rutas. Todavía no habilitar `XENIA_CONTROL_DEMO`: el acceso remoto usa usuario y contraseña.
5. En **Settings / Source**, conectar `marcesvetliza-ui/maran-pms` y seleccionar `feat/xenia-multihotel-foundation-20261117`, con directorio raíz `/`. En **Config as Code / Railway Config File**, seleccionar `/railway.xenia-control.json`. Revisar esos datos antes de aplicar el despliegue. Si la interfaz inicia un intento de compilación al conectar el repositorio, la variable `RAILWAY_DOCKERFILE_PATH` ya dirige ese intento al panel; las variables y la configuración completa deben estar guardadas antes de darlo por instalado.
6. Aplicar el despliegue. En sus detalles, comprobar que la compilación utiliza `Dockerfile.xenia-control`, que la preparación ejecuta `npm run xenia:setup:production` y que el arranque es `node dist/xenia-control/index.js`. La preparación crea exclusivamente el esquema propio y la primera administración. Su repetición conserva cuentas y contraseñas existentes.
7. Verificar `/healthz` con resultado `{"status":"ok"}`, abrir la dirección HTTPS e ingresar con la cuenta inicial. Al principio la lista de establecimientos estará vacía: el modo publicado no crea automáticamente los personajes ni las reservas de la demostración local.
8. Desde **Administración**, crear un cliente ficticio y después **Hotel Aurora** y **Apart Brisa**, con Alojamiento habilitado. Sus bases se asignan a las dos conexiones disponibles. Crear una cuenta responsable con acceso a ambos, una de recepción para Aurora y otra de consulta para Brisa. Usar únicamente datos ficticios para las reservas de prueba.
9. Comprobar el selector, altas, anulaciones de prueba, permisos y dos pestañas abiertas. Confirmar que recepción sólo ve Aurora y que consulta no puede guardar ni anular. Conservar el commit del despliegue y el resultado de estas pruebas antes de enlazar un PMS completo.
10. Para conectar `app.xeniapms.com`, agregar ese dominio personalizado al servicio con el puerto 4186. En Donweb, zona DNS de `xeniapms.com`, el campo **Nombre** exige el dominio completo: crear el CNAME `app.xeniapms.com` con el destino exacto que indique Railway y el TXT `_railway-verify.app.xeniapms.com` con el valor completo de verificación. Comprobar ambos valores en la lista de registros guardados. Conservar los registros de la web comercial y del correo.
11. Esperar a que Railway confirme el dominio y su certificado HTTPS. Entonces cambiar `XENIA_CONTROL_ORIGIN` a `https://app.xeniapms.com`, volver a desplegar y repetir ingreso y una escritura ficticia desde ese dominio. Desde ese momento el acceso de trabajo es el nuevo dominio; las escrituras exigen ese origen exacto.
12. Después de verificar y guardar la contraseña, retirar `XENIA_INITIAL_ADMIN_PASSWORD` del servicio. La preparación detecta la cuenta existente y no necesita volver a recibir esa contraseña. Conservar el secreto de sesión y las conexiones protegidas.

La publicación de prueba queda completa al comprobar el acceso remoto y los cuatro perfiles. La integración con el PMS operativo y la incorporación de Maran tienen sus propias validaciones posteriores. Ante una incidencia de esta instalación se detiene únicamente `xenia-control`; no se sustituyen bases ni se cambia la rama de los servicios hoteleros actuales.

### Conexiones con referencias sin resolver

El proceso necesita recibir URLs PostgreSQL resueltas. En el editor de Railway, una variable de la base puede mostrar una plantilla; el contenedor debe recibir su resultado, con servidor privado, usuario, contraseña y base reales. Que el valor empiece por `postgresql://` no acredita que sus componentes estén resueltos.

Si un registro muestra un servidor literal como `${{servicio.RAILWAY_PRIVATE_DOMAIN}}`, revisar el valor renderizado de la conexión en Railway. El panel rechaza estos marcadores durante la validación, antes de abrir conexiones, e identifica el campo central o la entrada de `XENIA_PROPERTY_DATABASES` que falla. Las URLs y sus credenciales no se imprimen en ese diagnóstico.

Comprobar el nombre existente en **Variables** de cada base antes de referenciarlo. En esta instalación el campo es `DATABASE_URL`: su plantilla utiliza `PGUSER`, `POSTGRES_PASSWORD`, `RAILWAY_PRIVATE_DOMAIN` y `PGDATABASE` de la propia base. El diálogo **Connect → Private Network** ofrecía `DATABASE_PRIVATE_URL`, pero ese nombre no aparecía entre las variables del servicio. No utilizar una referencia sólo porque la sugiera el diálogo si el campo de origen no existe.

El 17 de noviembre de 2026, el propietario confirmó que el despliegue pasó al usar las tres referencias a `DATABASE_URL` indicadas en la tabla. El JSON se pega completo en el valor de `XENIA_PROPERTY_DATABASES`, conservando las referencias; Railway debe entregar al proceso las URLs resueltas. Después de vincular el subdominio, el propietario confirmó el ingreso remoto como `marcelo.admin`, conservó su contraseña y completó las pruebas manuales de establecimientos y perfiles registradas en el acta de aceptación.

En otra instalación, verificar el campo y el servidor privado de su plantilla en lugar de asumir estos nombres. Para `XENIA_PROPERTY_DATABASES`, el valor recibido debe ser un objeto JSON cuyos valores sean las URLs completas y distintas de los establecimientos. Reemplazar sólo el servidor no alcanza si el usuario o la contraseña también conservan marcadores sin resolver. Las conexiones privadas completas se manipulan únicamente dentro del proveedor o del gestor de secretos, nunca por chat ni en Git.

## Validación

```sh
npm run xenia:check
npm run xenia:test
npm run xenia:test:browser
npm run xenia:build
```

Para la prueba de navegador, instalar Chromium con `npx playwright install chromium` o indicar un ejecutable ya disponible en `XENIA_BROWSER_PATH`. Las pruebas crean y destruyen su propio clúster PostgreSQL; no aceptan una URL operativa. Se ejercitan solicitudes HTTP autenticadas, IDs iguales en dos hoteles, lecturas concurrentes, intentos de acceso cruzado, permisos de consulta, escritura y revocación, rotación de sesión, protección de solicitudes, conexiones intercambiadas y recuperación de un alta que no pudo prepararse. La prueba de interfaz ejecuta dos pestañas, cambios de cuenta, respuestas tardías del hotel anterior, formularios pendientes, alta de establecimiento, creación de usuario y vista móvil.

Las lecturas anónimas no crean cookies de sesión. El ingreso exige origen exacto y JSON; las escrituras autenticadas requieren además el token de protección de la sesión. Las cookies tienen un vencimiento de 12 horas y no se renuevan con lecturas, para evitar que una respuesta antigua de otra pestaña reemplace la sesión recién iniciada. Los cambios de cuenta se comunican a las demás pestañas y borran sus datos de la cuenta anterior.

## Siguiente integración

1. Conservar el acta de aceptación de esta primera entrega y completar el inventario de revisión servida, salud y recuperación del servicio.
2. Preparar la primera instalación completa de prueba para Aurora siguiendo la segunda entrega. Antes de incorporar cambios de Xenia, completar la matriz funcional y conservar los arreglos recientes de Maran.
3. Implementar el enlace de identidad con las instalaciones completas del PMS y sus usuarios locales. Cada instalación tendrá su sesión propia y validará usuario, establecimiento y permisos.
4. Extender la validación a archivos, cachés, procesos, tareas e integraciones por establecimiento.
5. Resolver continuidad y revocación cuando el panel central no esté disponible antes de incorporar hoteles operativos. Esta primera aplicación central falla cerrada y no implementa todavía el mecanismo de continuidad del PMS.
6. Validar la configuración fiscal por CUIT, ambiente, comprobante y punto de venta. Una serie fiscal compartida necesita coordinación de emisión.
7. Probar recuperación y distribución de versiones antes de incorporar Maran. El asistente se retoma sobre esta estructura de permisos.
