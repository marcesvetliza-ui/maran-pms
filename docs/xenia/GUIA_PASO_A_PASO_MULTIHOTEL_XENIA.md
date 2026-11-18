# Guía paso a paso del multihotel de Xenia

Actualización: 17 de noviembre de 2026. Preparada para Marcelo. Versión 1.0.

Esta guía explica quién hace cada tarea, dónde se hace y cómo comprobar el resultado. La web comercial y el panel central ya funcionan. El siguiente trabajo es desarrollar y probar el enlace con una instalación completa del PMS para Aurora; después se repite con Brisa. Maran mantiene su instalación operativa durante este recorrido.

**Punto actual:** terminaron las pruebas básicas del panel. El código que abre el PMS completo desde el selector todavía debe implementarse. Los pasos de publicación de ese PMS se ejecutan cuando se entregue el paquete de código probado y su ficha de configuración.

## 1 Quién hace cada parte

| Trabajo | Responsable | Herramienta |
| --- | --- | --- |
| Preparar código, configuración y pruebas | Asistencia técnica desde esta conversación | GitHub y entorno de desarrollo |
| Crear y configurar servicios y bases nuevos | Marcelo, siguiendo la ficha de publicación | Railway |
| Cargar los registros del nuevo subdominio | Marcelo | Donweb |
| Probar pantallas y recorridos operativos | Marcelo con asistencia técnica | Navegador |
| Revisar resultados y documentar la versión | Asistencia técnica y Marcelo | Plan y acta de pruebas |

Ya pudiste crear servicios y bases en Railway, editar variables, conectar el repositorio y cargar DNS en Donweb. Esas acciones acreditan acceso para la configuración que hicimos. La gestión directa de Railway y Donweb sigue en tu sesión; desde esta conversación se trabaja sobre el código y se te indican los cambios concretos.

Una **rama** es la línea de trabajo del código; una **revisión o SHA** identifica su versión exacta. **Publicar o desplegar** significa instalar esa versión en un servicio. La **base de datos** guarda la información de la instalación. La ficha permitirá copiar los valores técnicos sin tener que programarlos.

## 2 Qué ya está terminado

- Web comercial de Xenia en `https://xeniapms.com`.
- Correo `contacto@xeniapms.com`: confirmaste recepción y respuesta.
- Panel central en `https://app.xeniapms.com`.
- Hotel Aurora y Apart Brisa activos en el panel.
- Reservas ficticias separadas y conservadas al recargar.
- Responsable con acceso a ambos establecimientos, recepción sólo a Aurora y consulta sólo a Brisa sin escritura.
- Perfiles de prueba sin acceso a la administración central.

Las reservas de ese panel son una prueba mínima. La siguiente etapa incorpora habitaciones, planning y reservas del PMS completo. Los demás módulos se integran y prueban después por circuito.

## 3 Qué podés revisar ahora

Estos pasos son de consulta y preparación.

1. Entrá en Railway y elegí el proyecto **observant-possibility**. Es el proyecto de pruebas de Xenia donde configuraste el panel.
2. Comprobá que ves **Xenia-Control**, **xenia-control-db**, **xenia-aurora-db** y **xenia-brisa-db**.
3. En **Xenia-Control → Deployments**, abrí el despliegue activo y anotá la revisión de GitHub que muestra, su fecha y estado. Si no encontrás la revisión, conservá una captura de los detalles sin valores de variables.
4. En **Xenia-Control → Settings → Networking**, comprobá que figura `app.xeniapms.com` con puerto **4186** y que terminó la validación del dominio.
5. Abrí `https://app.xeniapms.com/healthz`. El resultado esperado es `{"status":"ok"}`. Anotá el resultado y la hora; si aparece otro mensaje, se revisa antes de avanzar con publicaciones.
6. Guardá el usuario `marcelo.admin` y su contraseña actual en tu gestor de contraseñas.
7. Confirmá que podés entrar en Donweb y abrir **xeniapms.com → Nameservers y Zona DNS**.

**Resultado:** accesos disponibles y datos del despliegue anotados. Estas comprobaciones no requieren crear más recursos ni cambiar las variables actuales.

## 4 El paquete de desarrollo que se prepara primero

Esta parte corresponde al trabajo técnico. Vos recibís sus resultados antes de configurar la nueva instalación.

1. Actualizar las referencias de código y revisar las diferencias entre Maran y Xenia.
2. Elegir el código candidato conservando las correcciones recientes de Maran, especialmente sesiones, reservas, cargos, cobros y facturación.
3. Preparar un arranque del PMS con datos ficticios de Aurora. El arranque actual incluye datos predeterminados de Maran y procesos automáticos que deben adaptarse antes de usarlo como plantilla.
4. Preparar el esquema y las habitaciones de prueba de Aurora en una base operativa limpia.
5. Implementar el enlace entre la cuenta central y el usuario local del PMS, con permisos revisados.
6. Probar la compilación, la preparación de una base nueva, el ingreso, el planning, las reservas y la separación de accesos.
7. Entregar una ficha de publicación con los valores técnicos definitivos.

La ficha debe contener:

| Dato | Qué tiene que indicar |
| --- | --- |
| Repositorio | Repositorio de GitHub ya autorizado. |
| Rama y revisión | Rama aislada y SHA exacto probado. |
| Construcción | Archivo de construcción y configuración de Railway preparados para este PMS. |
| Preparación | Comando exacto para inicializar exclusivamente su base de prueba. |
| Arranque y salud | Comando de arranque, puerto y ruta de comprobación reales. |
| Variables | Lista completa de nombres, referencias y valores que Marcelo debe generar en privado. |
| Identidad | Relación entre Aurora, su instalación del PMS y sus usuarios locales. |
| Procesos externos | Qué está desactivado en esta prueba y cómo se verifica. |
| Reversión | Cómo volver al despliegue anterior y cuándo es necesaria una restauración de base. |

**Condición para pasar al paso 5:** ficha completa y pruebas técnicas aprobadas. La rama, comandos y variables ya están implementados en la [ficha del paso 2](https://github.com/marcesvetliza-ui/maran-pms/blob/feat/xenia-pms-integration-20261118/docs/xenia/PASO_2_PUBLICAR_PMS_AURORA.md). La PR 130 registra los controles del paquete; usar esa ficha actual para publicar los servicios nuevos.

## 5 Preparar el respaldo de la prueba

Antes de una publicación que cambie datos o esquemas:

1. Abrir el servicio de base correspondiente en Railway y entrar en **Backups**.
2. Revisar la última copia terminada, su fecha y la base a la que corresponde.
3. Si está disponible la creación de una copia, generar el punto de recuperación definido en la ficha. Si el panel pide contratar capacidad o cambiar el plan, anotar la condición y el importe antes de decidirlo.
4. Si la cuenta no ofrece ese respaldo, el paquete técnico debe incluir una exportación y una restauración probadas sobre otra base.
5. Registrar cómo se recupera la copia en una base descartable. Una copia terminada y una restauración ensayada son comprobaciones distintas.

Los datos ficticios actuales del panel se conservan mientras se prueba la transición al PMS completo.

## 6 Crear la base operativa de Aurora

**Se ejecuta después de recibir la ficha del paso 4.** Nombres propuestos para esta instalación:

- Base nueva: `xenia-aurora-pms-db`.
- Servicio nuevo: `xenia-aurora-pms`.

Las bases `xenia-aurora-db` y `xenia-brisa-db` actuales contienen el esquema de la demostración mínima. El PMS completo tiene otras tablas y procesos de preparación. La primera instalación completa se ensaya en una base nueva; el retiro de recursos de demostración se decide después de validar y respaldar la transición.

1. En Railway, abrir **observant-possibility** y usar la opción de agregar un recurso.
2. Elegir **Database → PostgreSQL** y nombrar la base `xenia-aurora-pms-db`.
3. Esperar a que el servicio indique **Online** y comprobar que tenga su volumen persistente.
4. Abrir **Variables** de esa base y comprobar el nombre de la variable de conexión que realmente existe.
5. Anotar el nombre de esa variable y del servicio. Las contraseñas y las URLs completas se conservan dentro del proveedor.

En la instalación anterior existía `DATABASE_URL`, aunque el diálogo genérico de conexión sugería otro nombre. Primero se comprueba la variable de origen y después se crea la referencia.

**Resultado:** base operativa nueva y disponible, todavía pendiente de la preparación definida en la ficha.

## 7 Crear el servicio del PMS de Aurora

1. En el mismo proyecto, crear un **servicio vacío** y nombrarlo `xenia-aurora-pms`.
2. Abrir **Variables** y cargar las variables completas de la ficha antes de iniciar la publicación.
3. Para conectar su base, usar una referencia al campo existente del servicio nuevo. Si se confirmó que se llama `DATABASE_URL`, la referencia será `${{xenia-aurora-pms-db.DATABASE_URL}}`.
4. Generar y guardar un secreto de sesión propio de Aurora. El PMS utiliza `SESSION_SECRET`; la ficha indicará el formato y los demás secretos del enlace.
5. En **Settings → Source**, conectar el repositorio y elegir la rama exacta entregada con el paquete. Copiar la revisión probada a la ficha.
6. Configurar el directorio raíz y el archivo de construcción indicados en la ficha.
7. En la configuración de despliegue, cargar el comando de preparación, arranque y comprobación de salud del paquete.
8. Revisar que los cambios pendientes correspondan a este servicio nuevo.

Variables del PMS que ya existen en el código actual:

| Variable | Uso |
| --- | --- |
| `DATABASE_URL` | Conexión a la nueva base operativa de Aurora. |
| `SESSION_SECRET` | Secreto exclusivo de sus sesiones. |
| `NODE_ENV` | `production` para la instalación remota. |
| `PORT` | Puerto elegido en la ficha de publicación. El PMS actual usa 5000 por defecto; el panel central usa 4186. |

La ficha añadirá las variables implementadas para la instalación ficticia y el enlace de identidad. La tabla anterior no es todavía una configuración completa para publicar la segunda entrega.

**Resultado:** servicio nuevo configurado con el paquete probado y su base exclusiva.

## 8 Publicar Aurora y comprobar el arranque

1. Aplicar los cambios del nuevo servicio y desplegar la revisión indicada en la ficha. Si el despliegue reutiliza una revisión anterior, usar la opción de publicar el último commit de la rama correspondiente y contrastar el SHA.
2. Revisar las fases de construcción, preparación y arranque. Cada una debe terminar correctamente.
3. Abrir los registros de preparación y comprobar que identifiquen la instalación de Aurora y el resultado, sin imprimir credenciales.
4. Confirmar que el servicio quede **Online** y que su comprobación de salud responda como indica la ficha.
5. Revisar los datos iniciales: nombre Aurora, habitaciones ficticias y usuarios previstos para la prueba.
6. Comprobar que la preparación repetida conserve sus datos y cuentas, según el ensayo documentado en el paquete.

Si falla un paso, conservar el mensaje exacto y la fase donde ocurrió. La corrección se aplica al servicio o al código identificado por ese diagnóstico.

## 9 Conectar la dirección de Aurora

Dirección propuesta: `aurora.qa.xeniapms.com`. El segmento `qa` identifica la instalación de pruebas. Se configura después de que el servicio arranque correctamente.

1. En `xenia-aurora-pms`, abrir **Settings → Networking → Public Networking**.
2. Agregar el dominio personalizado `aurora.qa.xeniapms.com` y seleccionar el puerto de la ficha.
3. Abrir los registros DNS que muestra Railway y copiar sus valores completos.
4. En Donweb, abrir **xeniapms.com → Nameservers y Zona DNS → Agregar registro**.
5. Crear el CNAME con **Nombre** `aurora.qa.xeniapms.com` y el destino exacto de Railway.
6. Agregar los registros de verificación que solicite Railway. Por ejemplo, si muestra el nombre `_railway-verify.aurora.qa`, en Donweb se utiliza `_railway-verify.aurora.qa.xeniapms.com` y su contenido completo.
7. Guardar y comprobar los valores en la lista de registros, además del formulario de edición.
8. Volver a Railway y esperar la validación del dominio y la activación de HTTPS.
9. Registrar el origen HTTPS definitivo en la configuración del servicio y del enlace según la ficha.
10. Abrir esa dirección en el navegador y comprobar el resultado esperado.

Un cambio puede tardar minutos o algunas horas. Si se corrigió un registro que estaba en caché, su valor anterior puede durar hasta su TTL. En la zona actual, 14.400 segundos equivalen a cuatro horas. La espera no reemplaza la revisión de nombres y contenidos guardados.

## 10 Enlazar Aurora con el panel central

El paquete técnico implementará este recorrido. La ficha indicará la pantalla o comando exactos de registro de la instalación.

1. Registrar la instalación del PMS de Aurora y su origen HTTPS como destino autorizado del establecimiento Aurora.
2. Vincular los usuarios centrales con las cuentas locales y el mapeo de permisos definido.
3. Publicar únicamente los servicios de pruebas que indique el paquete para habilitar el enlace.
4. Ingresar a `app.xeniapms.com` como administrador, seleccionar Aurora y abrir su PMS mediante la acción incorporada en esta entrega.
5. Comprobar que se abre el PMS completo, con la identidad y el establecimiento correctos.
6. Repetir con responsable y recepción. El recorrido debe permitir entrar con la identidad autorizada sin compartir una cookie general entre todos los hoteles.
7. Marcelo prueba cierre de sesión y acceso revocado; la asistencia técnica verifica también códigos de acceso vencidos y reintentos de códigos ya utilizados.

Las URLs operativas se configuran en sus servicios del PMS. La variable actual `XENIA_PROPERTY_DATABASES` corresponde al ejercicio de reservas de demostración; su transición se hará con el desarrollo previsto, respetando sus comprobaciones de esquema e identidad.

## 11 Probar el PMS completo de Aurora

Usar datos ficticios y registrar el resultado de cada prueba:

1. El nombre Aurora está visible en el espacio de trabajo.
2. Las habitaciones y sus categorías corresponden a la plantilla de Aurora.
3. Se puede crear una reserva desde el planning y volver a abrirla.
4. La reserva conserva sus fechas, habitación y huésped al actualizar la página.
5. Se puede modificar y anular una reserva de prueba conservando el historial previsto.
6. Recepción puede realizar las operaciones de prueba autorizadas.
7. Marcelo confirma que Consulta sólo permite leer las pantallas habilitadas; la asistencia técnica comprueba que el servidor también rechace los intentos de escritura.
8. Revocar un acceso impide volver a utilizarlo dentro del plazo de vigencia establecido en el diseño.
9. Una caída del panel central se comporta según la política de continuidad ensayada y documentada en el paquete.

La aceptación de Alojamiento precede a los ensayos específicos de cobros, Caja y facturación. Cada circuito posterior tendrá sus propios datos, configuración y resultados.

## 12 Incorporar Brisa

Después de aprobar Aurora, repetir los pasos 5 a 11 con los datos de Brisa:

| Elemento | Brisa |
| --- | --- |
| Base operativa propuesta | `xenia-brisa-pms-db` |
| Servicio propuesto | `xenia-brisa-pms` |
| Dominio propuesto | `brisa.qa.xeniapms.com` |
| Datos iniciales | Habitaciones o unidades ficticias de Brisa. |
| Sesión y credenciales | Propias de Brisa. |

Compartir la versión del producto no implica compartir la base ni copiar la configuración privada de Aurora.

Después probar los dos establecimientos:

1. Responsable abre Aurora y Brisa desde el panel.
2. En cada uno se crean registros ficticios con nombres y números de habitación similares.
3. Cada registro aparece sólo en su establecimiento, también después de recargar y abrir dos pestañas.
4. Recepción de Aurora sólo puede operar Aurora; consulta de Brisa sólo puede consultar Brisa.
5. La asistencia técnica verifica que cambiar una URL o un identificador manualmente no permita acceder al otro establecimiento.
6. Marcelo contrasta los puntos de venta y documentos; la asistencia técnica comprueba además la separación de archivos, trabajos y valores almacenados en el navegador.

## 13 Completar los módulos y las versiones

Una vez aprobados los dos PMS de pruebas:

1. Incorporar las mejoras del producto común por módulo, contrastando el comportamiento con los arreglos de Maran.
2. Probar cargos, cobros, Caja, cuentas corrientes y anticipos de grupos con datos ficticios y conciliación de importes.
3. Probar facturación, notas de crédito y débito y recuperación de operaciones pendientes en el ambiente fiscal de prueba definido, con configuración exclusiva del ensayo.
4. Probar restaurant, spa, eventos y grupos con los permisos y circuitos que correspondan a cada establecimiento.
5. Probar Channex, correo y otras integraciones con sus destinos de prueba y credenciales separadas.
6. Publicar una versión de prueba sólo en Aurora y confirmar que Brisa conserva la versión anterior.
7. Ensayar restauración sobre otra base y registrar qué recupera y cuánto tarda.
8. Definir el alta repetible del próximo cliente, sus módulos, administración, costos, respaldo y baja.

El asistente se incorpora después sobre la identidad y los permisos del hotel, conservando el presupuesto y las condiciones definidos en el plan maestro.

## 14 Incorporar Maran cuando corresponda

La incorporación de Maran es una entrega posterior y concreta, revisada con su operación real.

1. Identificar la versión y la base efectivas de Maran en ese momento.
2. Preparar un respaldo y restaurarlo en una instalación aislada con acceso restringido.
3. Probar allí el enlace de identidad y las migraciones, conservando huéspedes, reservas, cobros, comprobantes, numeración e historial.
4. Verificar la configuración por entidad fiscal, punto de venta, correo y Channex.
5. Ensayar continuidad y recuperación con las personas que van a operar.
6. Preparar una ventana de publicación, responsables, versión, comprobaciones posteriores y reversión.
7. Publicar el cambio revisado para Maran después de la decisión sobre esa entrega concreta.

Las pruebas de Aurora y Brisa no trasladan automáticamente una versión a Maran.

## 15 Si una opción no aparece o algo falla

| Situación | Próximo paso |
| --- | --- |
| Railway no permite crear o editar | Confirmar cuenta y proyecto. Revisar con quien administra ese proyecto los permisos para crear servicios o modificar configuración. |
| El nombre de una variable existe pero el proceso la recibe vacía | Comprobar que la referencia apunte a una variable real del servicio correcto y que el despliegue tenga los cambios aplicados. |
| Aparece un servidor literal que contiene `${{` | Railway entregó una referencia sin resolver. Revisar la referencia y su origen antes de volver a publicar. |
| El diálogo Connect sugiere una variable que no existe | Usar el nombre verificado en Variables de la base. En el panel se resolvió con `DATABASE_URL`. |
| Railway muestra Waiting for DNS update | Comparar los registros guardados en Donweb con los que pide ese dominio en Railway. |
| Donweb muestra Nombre inválido | Usar el nombre completo terminado en `.xeniapms.com`. |
| El formulario tiene el valor correcto pero la lista conserva otro | Guardar la edición y comprobar la fila persistida. |
| Aparece el 404 de Railway | Revisar dominio, estado de DNS, provisión y puerto del servicio. |
| Una base se rechaza por no ser exclusiva | Revisar la conexión asignada y el esquema esperado; conservar los datos hasta resolver la asignación. |
| Se olvidó la contraseña del administrador | Revisar la credencial guardada. Cambiar `XENIA_INITIAL_ADMIN_PASSWORD` no restablece una cuenta ya creada; una recuperación requiere su procedimiento específico. |

Para revisar un problema, enviar el mensaje exacto y una captura de la pantalla pertinente, con los valores de contraseñas y conexiones ocultos.

## 16 Cómo sabemos que cada etapa terminó

Registrar para cada entrega: fecha, responsable de la prueba, código publicado, esquema, servicios afectados, configuración identificada, resultado y punto de recuperación. Conservar los valores secretos en el proveedor o en el gestor de contraseñas.

| Etapa | Evidencia de cierre |
| --- | --- |
| Panel central | Pruebas de Aurora, Brisa y perfiles ya confirmadas por Marcelo. |
| Paquete técnico de Aurora | Código, ficha completa y pruebas automatizadas aprobadas. |
| PMS de Aurora | Ingreso desde el selector y pruebas funcionales registradas. |
| PMS de Brisa | Mismo paquete preparado para su instalación y pruebas de aislamiento aprobadas. |
| Versiones y recuperación | Actualización de un hotel y restauración ensayadas sin modificar los demás. |
| Maran | Pruebas sobre copia aislada, aceptación operativa y publicación de su entrega específica. |

**Acción actual, 18 de noviembre:** revisar los controles de la PR 130 y seguir la [ficha actual de publicación de Aurora](https://github.com/marcesvetliza-ui/maran-pms/blob/feat/xenia-pms-integration-20261118/docs/xenia/PASO_2_PUBLICAR_PMS_AURORA.md). Primero se actualiza únicamente Xenia-Control; después se generan las variables privadas y se crean la base y el servicio nuevos del PMS.

## Documentos del proyecto

- [Plan maestro actualizado](https://github.com/marcesvetliza-ui/maran-pms/blob/plan/xenia-product-multihotel-20261116/docs/xenia/PLAN_MAESTRO_XENIA_MARAN.md).
- [Aceptación de la primera entrega](https://github.com/marcesvetliza-ui/maran-pms/blob/feat/xenia-multihotel-foundation-20261117/docs/xenia/evidencia/multihotel-aceptacion-2026-11-17.json).
- [Preparación técnica de la segunda entrega](https://github.com/marcesvetliza-ui/maran-pms/blob/feat/xenia-multihotel-foundation-20261117/docs/xenia/SEGUNDA_ENTREGA_PMS_AISLADO.md).
