# Alta y administración de un cliente independiente en Xenia QA

Entrega preparada el 23/11/2026 sobre la base PMS QA `4a1f71ba4085ba1cff4d89c99bcb2de0a2e5d61f`, en la rama aislada `feat/xenia-independent-customer-qa-20261123`. Este documento describe el código de esa rama; su existencia no acredita un despliegue. La revisión exacta y los resultados de aceptación se registran en la PR y en el recibo de pruebas de la entrega.

## Qué permite esta entrega

Xenia administra clientes independientes. Cada cliente puede tener uno o más hoteles; cada hotel mantiene su PMS, base operativa e identidad propios. El administrador del cliente entra a **Mi equipo** para crear colaboradores, asignar permisos en sus hoteles y suspender su acceso en ese cliente. No recibe la administración global de Xenia.

El alta nueva usa **PMS independiente**: se prepara con nombre propio y sin habitaciones, tarifas, huéspedes ni reservas de ejemplo. Conserva los catálogos mínimos de QA, Caja de Recepción y el artículo ficticio Agua de prueba. Aurora y Brisa mantienen sus plantillas, bases, identificadores y datos anteriores. No se necesita otra base de reservas de demostración del panel por cada alta nueva.

| Persona | Puede hacer |
| --- | --- |
| Administración de Xenia | Crear clientes/hoteles, generar la ficha de instalación, crear o retirar administradores de cliente. Conserva el acceso global anterior durante esta transición. |
| Administrador del cliente | Entrar a sus hoteles, configurar su PMS y administrar su equipo dentro de ese cliente. No ve el catálogo global de usuarios. |
| Responsable / Recepción / Sólo consulta | Acceder únicamente a los hoteles asignados, según los permisos del perfil QA. Sólo consulta no escribe. |

La autoridad se vuelve a comprobar en el servidor. Retirar un acceso invalida los enlaces y sesiones operativas correspondientes; repetir un alta anterior no restituye permisos retirados. Suspender una persona se limita al cliente elegido y conserva sus accesos explícitos en otros clientes. Reactivarla requiere volver a asignar sus hoteles.

## Publicar primero la versión, conservando las instalaciones existentes

Esta secuencia corresponde al proyecto de Xenia en Railway, donde ya están Aurora, Brisa y Xenia-Control. El entorno de desarrollo no tiene acceso autorizado a ese proyecto: los cambios de Railway se realizan desde la sesión de Marcelo. La PR queda preparada para revisión; no se fusiona ni publica automáticamente en la rama conectada.

1. Registrar las revisiones, rama, ficha de configuración sin secretos y estado de salud actuales. Crear copias recientes de la central y de ambos PMS. Las cinco copias anteriores fueron confirmadas por Marcelo el 20/11; no sustituyen este registro previo a publicar.
2. Con la PR revisada y sus comprobaciones completas, publicar la revisión elegida en `xenia-aurora-pms` y después en `xenia-brisa-pms`. Se puede usar la rama aislada indicada arriba seleccionando la misma revisión comprobada en ambos servicios. Mantener `Dockerfile.xenia-pms`, `/railway.xenia-pms.json` y las variables existentes, incluida `XENIA_PMS_OPERATIONS_ENABLED=true`.
3. Mantener en Aurora y Brisa sus `DATABASE_URL`, `SESSION_SECRET`, IDs, secretos, orígenes y plantillas actuales. No cambiar a `custom` una instalación existente ni apuntarla a la copia restaurada.
4. En cada PMS esperar salud `ok`, comprobar la revisión en `/healthz` y entrar con una cuenta existente. Si falla uno, resolverlo antes de continuar. Todavía no asignar el rol nuevo a clientes sobre un PMS antiguo.
5. Publicar la misma revisión en **Xenia-Control**, manteniendo `Dockerfile.xenia-control`, `/railway.xenia-control.json` y el predeploy `npm run xenia:setup:production`. Ese comando aplica la migración central explícita; el arranque normal sólo comprueba su versión. Se conservan usuarios, contraseñas, organizaciones, membresías e identidades existentes.
6. Mantener las conexiones centrales y el JSON `XENIA_PROPERTY_DATABASES` actual. No agregar ahí el PMS nuevo ni borrar Aurora/Brisa. Esa configuración sigue siendo necesaria para las demostraciones anteriores.
7. Comprobar salud de la central, ingreso de Marcelo y acceso a ambos hoteles. Registrar los despliegues y SHA realmente servidos. En la central, `/healthz` confirma estado pero no informa revisión: registrar el SHA del despliegue en Railway. Sólo entonces avanzar con el alta siguiente.

Los servicios del asistente, `maran-pms`, `assistant-db`, `main`, DNS existentes y el clon `xenia-aurora-restore-db` no forman parte de esta publicación.

## Crear el cliente y el hotel ficticios

1. Ingresar a `https://app.xeniapms.com` con la administración de Xenia y abrir **Administración**.
2. En el alta de cliente cargar, por ejemplo, **Cliente Hotel Norte QA**. Es un cliente comercial distinto del grupo de prueba de Aurora y Brisa.
3. En el alta de establecimiento elegir ese cliente, nombre **Hotel Norte QA**, un identificador propio y el módulo **Alojamiento**. Mantener el tipo **PMS independiente**. Crear una sola vez: aparecerá **En preparación**.
4. Seleccionar ese establecimiento y, en su conexión PMS, elegir **PMS independiente** y un origen exclusivo, por ejemplo `https://norte.qa.xeniapms.com`. No reutilizar Aurora, Brisa ni un origen de otro hotel.
5. Generar la ficha y copiarla directamente a las variables del servicio nuevo en Railway. El secreto sólo se muestra en esa ficha; no pegarla en el chat, en la PR ni en capturas. Generar otra ficha rota el secreto y retira las sesiones de esa instalación; no es el botón para consultar su estado.

El reintento de un alta con la misma solicitud conserva la identidad creada. Ante un error de conexión revisar el catálogo y repetir los mismos datos antes de iniciar otra alta distinta. Si se cambia la contraseña de un alta de persona cuyo resultado es incierto, el servidor rechaza el reintento con datos distintos; revisar **Mi equipo** antes de volver a crearla.

## Preparar los recursos de ese hotel en Railway

1. En el mismo proyecto crear un PostgreSQL exclusivo, por ejemplo `xenia-norte-pms-db`. Su base debe estar vacía. No duplicar ni reutilizar una base de Aurora, Brisa, Maran o la central.
2. Crear un servicio GitHub para el PMS, por ejemplo `xenia-norte-pms`, desde el mismo repositorio y revisión comprobada. Usar el archivo de configuración `/railway.xenia-pms.json`, `Dockerfile.xenia-pms`, predeploy `npm run xenia:pms:setup:production`, arranque `node dist/index.cjs` y healthcheck `/healthz`.
3. En **Variables** cargar la ficha emitida por Xenia. Incluye modo QA, origen, nombre, plantilla `custom`, IDs, secreto de enlace, secreto de sesión propio y operaciones habilitadas. No heredar claves externas de correo, fiscalidad, canales o modelos de otros servicios.
4. Agregar `DATABASE_URL` mediante la referencia privada que Railway ofrezca para **esa base nueva**. Verificar que se resuelva a una conexión PostgreSQL completa. No inventar un nombre de variable de Railway ni copiar una conexión de otro hotel. No cambiar `XENIA_PROPERTY_DATABASES` para esto.
5. Al pegar la ficha en el editor de variables con formato `.env`, conservar el formato de nombre entre comillas que aparece allí. Si se carga `XENIA_PMS_PROPERTY_NAME` individualmente, su valor es el nombre del hotel, sin comillas delimitadoras.
6. Agregar el dominio elegido en **Settings → Networking** del servicio PMS y dirigirlo al puerto 5000. En Donweb copiar los dos registros que Railway muestre. Donweb requiere el nombre completo: para el ejemplo serían el CNAME `norte.qa.xeniapms.com` y el TXT `_railway-verify.norte.qa.xeniapms.com`. El CNAME lleva el destino `*.up.railway.app`; el TXT lleva el texto `railway-verify=...`. Copiar los valores actuales de Railway, no los de otro hotel.
7. Publicar. El predeploy prepara la base una sola vez; repetirlo conserva datos y permisos. Una base ajena, no vacía o con otra identidad se rechaza; no corregir sus marcadores a mano para forzar el arranque.
8. Esperar DNS/certificado y salud `ok`. El PMS, después de comprobar su base y permisos al arrancar, envía una confirmación autenticada a Xenia con su revisión e identidad. La central fija la identidad de base y pasa el hotel a **Activo**. Si no hay conexión reintenta cada 15 segundos. Recargar el panel para ver el estado.

Esa confirmación acredita la preparación informada por el PMS autenticado; no sustituye una comprobación independiente de disponibilidad. No permite que un navegador marque listo el hotel ni que una ficha rotada sustituya la base vinculada. La migración o recuperación futura de una instalación requiere su propio procedimiento.

## Entregar la administración al cliente

1. En Xenia-Control, **Administración → Administrador del cliente**, seleccionar **Cliente Hotel Norte QA** y crear una cuenta nueva con nombre, usuario y contraseña inicial. No entregar la cuenta de plataforma de Marcelo.
2. Cerrar la sesión de plataforma. Entrar con esa cuenta: debe verse el hotel propio y **Mi equipo**, sin la pestaña global **Administración** ni los hoteles de otro cliente.
3. Abrir **Mi equipo**. Crear un colaborador, elegir sólo los hoteles propios y asignar Recepción o Sólo consulta. Los nombres de usuario son únicos en toda la plataforma; un nombre ocupado se rechaza sin revelar otras cuentas.
4. En la tarjeta de una persona se puede guardar otro permiso, quitar un hotel o **Suspender en este cliente**. Reactivar no recupera permisos antiguos automáticamente: hay que asignar de nuevo los hoteles deseados.
5. Abrir el PMS desde el hotel. El administrador del cliente tiene administración local de ese hotel; la autoridad central y los límites QA permanecen vigentes.

Este MVP crea cuentas con contraseña inicial. Todavía no ofrece invitaciones a identidades existentes, edición global de nombres ni recuperación/cambio de contraseña por el administrador del cliente. Un fallo de acceso global requiere intervención de la administración de Xenia.

## Aceptación que realiza Marcelo después de publicar

1. Con el administrador nuevo confirmar nombre, configuración propia y ausencia de reservas/huéspedes de ejemplo. Configurar tipo de habitación, habitación y tarifa ficticios.
2. Con Recepción abrir Caja, crear una reserva, hacer check-in, agregar un consumo, cobrar el saldo, hacer check-out y cerrar Caja con diferencia cero. Son pruebas QA, sin facturación real.
3. Con Sólo consulta verificar lectura y rechazo de escrituras. Quitar su acceso desde **Mi equipo** y comprobar que también se invalida la sesión PMS que ya estaba abierta.
4. Mantener sesiones separadas de dos clientes: no deben verse hoteles, personas ni datos ajenos. Intentar abrir un enlace de otro cliente debe denegarse.
5. Volver a Aurora y Brisa con cuentas anteriores y comprobar acceso y conservación de datos. No crear ni reparar datos reales de Maran durante esta aceptación.
6. Registrar SHA servido de central y PMS, IDs de cliente/hotel/instalación, migraciones, fecha, resultados y cualquier parcial. Esos IDs no son secretos; conexiones y contraseñas sí. La aceptación remota permanece pendiente hasta completar estos pasos.

## Verificación reproducible en desarrollo

Usar PostgreSQL local de pruebas y Chromium. Las fixtures crean y destruyen sus propios clústeres y no aceptan una `DATABASE_URL` operativa. Si los binarios no están en PATH, usar `XENIA_PG_BIN`; para Chromium instalado usar `XENIA_BROWSER_PATH`. `XENIA_SCREENSHOT_DIR` conserva las capturas y recibos.

```bash
npm ci --no-audit --no-fund
npm run check
npm run xenia:check
npm run xenia:pms:build
npm run xenia:build
node --check server/xenia-control/public/app.js
npm run xenia:test
npm run xenia:customers:test
npm run xenia:pms:test
npm run xenia:pms:customer:test
npm run xenia:test:browser
npm run xenia:customers:browser
npx vitest run client/src/lib/xenia-qa-operation.test.ts client/src/components/xenia-qa-checkout.test.tsx
npx vitest run --config vitest.server.config.ts server/tests/cash-user-access.test.ts server/tests/cash-user-access-middleware.test.ts
npm run lint:dates
npm run lint:workflows
```

El test del cliente nuevo usa PMS compilado y HTTPS local, comprueba la revisión real compilada, configuración propia, confirmación de arranque, SSO, permisos y el recorrido de estadía/Caja en navegador. La creación de habitaciones/tarifa/huésped en ese test se hace mediante APIs autorizadas; no acredita los formularios nativos de esas configuraciones. **Mi equipo**, el alta de catálogo y el circuito de estadía/Caja sí se ejercitan mediante la UI. Las pruebas propuestas en documentos históricos no se cuentan como resultados ejecutados de esta entrega.

## Reversión y trabajo pendiente

Conservar la revisión anterior y las copias. Una reversión no borra columnas ni datos nuevos, no altera los IDs, no regenera secretos y no intercambia bases. El código anterior no entiende el administrador de cliente ni el catálogo PMS nuevo: revertir la central implica pausar ese acceso nuevo hasta recuperar una versión compatible. Registrar y resolver el incidente antes de abrir nuevos clientes.

C02–C04 quedan implementados en la rama de esta entrega. C05 incluye verificación sintética automatizada; su aceptación remota sigue pendiente. Antes de clientes operativos faltan promoción controlada de versiones, recuperación integral, continuidad ante caída central, perfil de producción/fiscalidad/integraciones, soporte temporal auditado y capacidad/costo por hotel. El asistente conserva su piloto y presupuesto separados; no se realizaron inferencias pagas ni se trasladaron sus aprobaciones a estas funciones.

Antecedente de producto: [especificación C01–C06, commit documental d4e3d1a](https://github.com/marcesvetliza-ui/maran-pms/blob/d4e3d1a7a09ebf7e3705a23a60187564d8e3b858/docs/xenia/PROXIMA_ENTREGA_HOTEL_INDEPENDIENTE.md). Esa especificación conserva su estado histórico; este documento y la PR registran la implementación posterior.
