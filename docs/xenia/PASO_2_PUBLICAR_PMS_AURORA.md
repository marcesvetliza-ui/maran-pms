# Paso 2: abrir el PMS de Aurora desde Xenia

Fecha: 18 de noviembre de 2026. Responsable: Marcelo. Alcance: instalaciones ficticias de Alojamiento. Esta guía corresponde al paquete `feat/xenia-pms-integration-20261118`; su publicación en Railway todavía debe realizarse.

El resultado será: **panel Xenia → Hotel Aurora → Abrir PMS → planning**, con la cuenta y los permisos que ya tenés. Maran mantiene su servicio, dominio, configuración y base actuales.

## 1. Qué vamos a publicar

| Componente | Uso |
| --- | --- |
| `Xenia-Control`, existente | Agregar la ficha de conexión y el acceso al PMS. Conserva cuentas y establecimientos. |
| `xenia-aurora-pms-db`, nuevo PostgreSQL | Base operativa nueva y exclusiva de Aurora. |
| `xenia-aurora-pms`, nuevo servicio GitHub | PMS completo con Alojamiento habilitado para pruebas. |
| `aurora.qa.xeniapms.com` | Dirección exclusiva del PMS de Aurora. |

Los tres PostgreSQL del panel que ya creaste siguen cumpliendo su función. **No usar `xenia-aurora-db`, `xenia-brisa-db`, `xenia-control-db` ni el PostgreSQL de Maran como base operativa nueva.** Las reservas de demostración del panel y las reservas del PMS pertenecen a bases distintas; esta entrega no las migra ni las sincroniza.

La instalación limpia crea tres habitaciones —101, 102 y 103—, una categoría, una tarifa, un huésped ficticio y una reserva de ejemplo. No importa datos del hotel. En despliegues posteriores conserva lo registrado.

## 2. Actualizar únicamente Xenia-Control

1. Abrí Railway → proyecto **observant-possibility** → entorno **production**.
2. Entrá en la tarjeta **Xenia-Control**. Las siguientes instrucciones son de esa tarjeta.
3. Guardá la referencia del último despliegue que funciona. En `xenia-control-db → Backups`, generá una copia si está disponible en tu plan. Conservá el servicio y su volumen.
4. En **Settings → Source**, mantené el repositorio `marcesvetliza-ui/maran-pms`, directorio raíz `/`, y elegí la rama `feat/xenia-pms-integration-20261118`.
5. En **Config-as-code / Railway Config File**, indicá `/railway.xenia-control.json`. Si Railway conserva ajustes manuales, comprobá estos valores:

   | Ajuste | Valor |
   | --- | --- |
   | Dockerfile | `Dockerfile.xenia-control` |
   | Pre-deploy command | `npm run xenia:setup:production` |
   | Start command | `node dist/xenia-control/index.js` |
   | Healthcheck path | `/healthz` |

6. Conservá las variables actuales de Xenia-Control, sus tres conexiones y las credenciales del administrador. No copies las variables del futuro PMS en esta tarjeta. La preparación agrega las tablas necesarias sin restablecer tu contraseña ni reemplazar las cuentas.
7. Revisá **Details** de los cambios pendientes. Aplicá los de **Xenia-Control**. Si hay cambios de otros servicios, separalos antes de usar el botón general.
8. Usá **Deploy latest commit** si hace falta iniciar la compilación del código nuevo. **Redeploy** de una ejecución vieja puede repetir su imagen anterior.
9. Esperá `Online` y comprobá `https://app.xeniapms.com/healthz`: debe responder `status: ok`.
10. Ingresá en `https://app.xeniapms.com` con `marcelo.admin` y tu contraseña actual. Deben seguir apareciendo Aurora y Brisa, las cuentas y las reservas ficticias previas.

## 3. Obtener la ficha desde el panel

1. Seleccioná **Hotel Aurora** en “Establecimiento activo”.
2. Abrí la pestaña **Administración**.
3. Buscá **Conexión del PMS de pruebas / PMS de Hotel Aurora**.
4. En “Dirección del PMS”, escribí exactamente `https://aurora.qa.xeniapms.com`, sin rutas.
5. Pulsá **Generar ficha de conexión** una sola vez.
6. Guardá el contenido de la ficha en un gestor de contraseñas o documento privado. Incluye un secreto de sesión de 64 caracteres y el secreto de conexión entre servidores. No los envíes por chat ni en capturas.

La ficha incluye los nombres y los valores de estas variables:

```text
XENIA_PMS_MODE
NODE_ENV
PORT
RAILWAY_DOCKERFILE_PATH
SESSION_SECRET
XENIA_PMS_TEMPLATE
XENIA_CONTROL_ORIGIN
XENIA_PMS_ORIGIN
XENIA_PMS_PROPERTY_ID
XENIA_PMS_CLIENT_ID
XENIA_PMS_CLIENT_SECRET
```

Todavía faltará agregar la conexión de la base nueva. El botón “Abrir PMS” aparecerá al registrar la dirección, pero recién funcionará después de publicar el servicio y verificar su DNS.

**Generar otra ficha rota el secreto e invalida las sesiones anteriores del PMS.** Si necesitás hacerlo, reemplazá también sus valores en Railway. No hay que regenerarla para cada despliegue.

## 4. Crear la base operativa nueva

1. Volvé al mismo proyecto de Railway.
2. Pulsá **+ New / Add → Database → PostgreSQL**.
3. Renombrá el nuevo servicio como **xenia-aurora-pms-db**.
4. Aplicá solamente su creación si Railway la deja pendiente y esperá `Online`.
5. En sus **Variables**, verificá que exista **DATABASE_URL**. Ese es el nombre que usaremos para referenciar la conexión.

No hace falta copiar una URL con contraseña a mano. Tampoco habilitar una conexión pública de PostgreSQL. Si el diálogo “Connect” propone `DATABASE_PRIVATE_URL` pero esa variable no existe, usá la variable real `DATABASE_URL` que aparece en la base.

## 5. Crear el servicio del PMS de Aurora

1. En el proyecto, pulsá **+ New / Add → GitHub Repo**.
2. Elegí `marcesvetliza-ui/maran-pms` y renombrá **esa nueva tarjeta** como **xenia-aurora-pms**.
3. En su **Settings → Source**, elegí la rama `feat/xenia-pms-integration-20261118` y directorio raíz `/`.
4. En **Config-as-code / Railway Config File**, indicá `/railway.xenia-pms.json`.
5. En **Variables → Raw Editor**, pegá las líneas de la ficha privada que generaste para Aurora. Son líneas `NOMBRE=valor`; no son un JSON. Guardá los cambios.
6. Agregá otra variable mediante **New Variable**:

   - Nombre: `DATABASE_URL`.
   - Valor: seleccioná la referencia a **xenia-aurora-pms-db → DATABASE_URL**.
   - La referencia esperada es `${{xenia-aurora-pms-db.DATABASE_URL}}`.

7. No agregues claves ARCA/AFIP, Channex, correo, IA ni otros servicios reales a esta tarjeta.
8. Antes de publicar, comprobá que los ajustes efectivos sean:

   | Ajuste | Valor |
   | --- | --- |
   | Dockerfile | `Dockerfile.xenia-pms` |
   | Pre-deploy command | `npm run xenia:pms:setup:production` |
   | Start command | `node dist/index.cjs` |
   | Healthcheck path | `/healthz` |
   | Puerto | `5000`, igual que `PORT` en la ficha |

9. Revisá los cambios pendientes de esa tarjeta y publicá el **nuevo PMS de Aurora**.
10. En los registros, la preparación debe indicar que se creó el PMS con datos ficticios o que ya estaba preparado y se conservaron sus datos. Después debe aparecer `Online`.

Si se rechaza la base por contener tablas ajenas o una identidad diferente, **no borres tablas para forzar el arranque**. Revisá la referencia de `DATABASE_URL`: la base correcta es la nueva `xenia-aurora-pms-db`. Si una actualización informa que cambió la versión del esquema, hay que preparar una migración explícita.

## 6. Conectar el dominio de Aurora

1. Abrí **xenia-aurora-pms → Settings → Networking → Custom Domain**.
2. Agregá `aurora.qa.xeniapms.com`, apuntando al puerto `5000`.
3. Abrí **Show DNS records**. Copiá los valores completos que entregue Railway para **este servicio**.
4. En Donweb → `xeniapms.com` → Nameservers y Zona DNS → Agregar registro, cargá:

   | Tipo | Nombre completo en Donweb | Contenido |
   | --- | --- | --- |
   | CNAME | `aurora.qa.xeniapms.com` | El destino `….up.railway.app` que indique este servicio nuevo. |
   | TXT, si Railway lo solicita | `_railway-verify.aurora.qa.xeniapms.com` | El valor completo `railway-verify=…` de esta configuración. |

5. Guardá cada registro y comprobá la fila que quedó guardada. El CNAME recibe el destino de Railway; el TXT recibe el texto de verificación.
6. No hace falta un registro adicional para `qa.xeniapms.com`. No modifiques los registros de `app`, `www`, el dominio raíz ni el correo.
7. Volvé a Railway y esperá a que desaparezca `Waiting for DNS update` y quede emitido el certificado HTTPS. El tiempo depende de los registros y las cachés; evitá cambiar los valores correctos mientras se propagan.
8. Abrí **https://aurora.qa.xeniapms.com/healthz**. Debe responder `status: ok`, `mode: qa` y los identificadores de Aurora y de su instalación. También muestra `revision`, que debe corresponder al código publicado.

No reutilices el destino ni el TXT del dominio `app.xeniapms.com`: el PMS tiene su propia configuración en Railway.

## 7. Probar Aurora desde el acceso central

1. Abrí `https://app.xeniapms.com` e ingresá con tu cuenta.
2. Elegí **Hotel Aurora → Mi operación → Abrir PMS**.
3. Debe abrirse el planning con la identidad de tu cuenta y una franja que diga **Hotel Aurora · Alojamiento · Pruebas con datos ficticios**.
4. Revisá las habitaciones 101, 102 y 103. La reserva de ejemplo ocupa la 101 durante dos noches a partir del día siguiente a la preparación inicial.
5. En una habitación libre, creá una reserva con un nombre ficticio. Modificá una observación, recargá y comprobá que siga registrada.
6. Volvé al panel, ingresá con la cuenta de recepción de Aurora que ya creaste y repetí el ingreso. No debe obtener administración central ni acceso a Brisa.
7. Quitá temporalmente el permiso de esa cuenta desde Administración, con tu cuenta administradora. La siguiente consulta del PMS debe rechazar el acceso. Después podés volver a asignarle recepción.
8. Cerrá sesión desde el panel. El acceso previo al PMS de esa cuenta debe quedar invalidado al consultar nuevamente.

La sesión del PMS dura como máximo una hora. Si vence, volvé a ingresar desde Xenia. Abrir una pestaña nueva también puede requerir ese ingreso; no necesitás crear ni recordar otra contraseña para Aurora.

## 8. Repetir con Brisa después de aceptar Aurora

El mismo paquete ya admite Brisa. Repetí los pasos seleccionando **Apart Brisa** en el panel y usando:

| Elemento | Valor |
| --- | --- |
| Base nueva | `xenia-brisa-pms-db` |
| Servicio nuevo | `xenia-brisa-pms` |
| Dirección | `https://brisa.qa.xeniapms.com` |
| Plantilla en la ficha | `XENIA_PMS_TEMPLATE=brisa` |
| Referencia de base | `${{xenia-brisa-pms-db.DATABASE_URL}}` |
| CNAME en Donweb | `brisa.qa.xeniapms.com` |
| TXT, si se solicita | `_railway-verify.brisa.qa.xeniapms.com` |

Cada ficha tendrá IDs y secretos propios. Cada dominio tendrá sus valores reales de CNAME y verificación. No copies la ficha de Aurora para Brisa.

Probá ambos PMS en pestañas distintas: una reserva nueva de Aurora no debe aparecer en Brisa. La cuenta de consulta de Brisa debe poder leer y recibir un rechazo al intentar escribir, incluso mediante una petición directa a la API.

## 9. Límites de esta entrega y recuperación

- Se usa el código completo del PMS, con las pantallas y API de Alojamiento habilitadas para estas pruebas. Caja, comprobantes fiscales, correos, OTAs, asistente y otros módulos operativos se incorporan en entregas posteriores. Check-in y checkout también quedan fuera de esta primera validación.
- El servidor verifica el acceso con Xenia en cada consulta autenticada. **Si el panel central no responde, el PMS de pruebas bloquea temporalmente las operaciones.** Resolver la continuidad ante una caída central es una condición pendiente antes de incorporar un hotel en uso.
- El arranque de QA no ejecuta los datos iniciales de Maran, la actualización de datos reales ni sus tareas programadas. La base nueva tiene un marcador que impide inicializarla como otro hotel. No hay almacenamiento de archivos ni trabajos externos habilitados para este ensayo.
- Si falla el servicio nuevo, detené su despliegue o conservá la última versión compatible con su esquema. No borres la base ni su volumen. El panel y las demostraciones previas pueden seguir utilizándose.
- La recuperación del panel requiere conservar su base y los valores anteriores de configuración. No revierte las tablas agregadas a mano ni restablece contraseñas.
- Una copia de seguridad no equivale a una restauración probada. El ensayo de restauración, la actualización independiente de cada hotel y la eventual incorporación de Maran siguen pendientes.

## 10. Registrar la aceptación

Anotá fecha, persona que probó, commit publicado en cada servicio, resultado de `/healthz`, nombres de bases, dominios y resultados de los pasos 7 y 8. No registres contraseñas ni conexiones completas en el acta.

El cierre de este paso es **Aurora publicada y aceptada desde Xenia**. La instalación local automatizada de Aurora y Brisa permite revisar el código antes de publicar; no reemplaza la aceptación en Railway.
