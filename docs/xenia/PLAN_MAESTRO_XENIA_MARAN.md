---
title: "Plan maestro de Xenia y continuidad operativa de Maran"
subtitle: "Producto común, crecimiento multihotel y puesta en marcha segura"
author: "Preparado para Marcelo Svetliza"
date: "18 de noviembre de 2026 · Versión 1.4"
lang: es-AR
---

**Estado:** plan en ejecución. La web comercial está publicada, el buzón de contacto fue probado por Marcelo y el panel central multihotel tiene aceptación manual con dos establecimientos ficticios. El enlace con dos PMS ficticios de Alojamiento ya está implementado y probado localmente en la PR 130; falta publicarlo y aceptarlo en Railway.

**Prioridad actual:** publicar primero Xenia-Control con la PR 130 y sus controles aprobados y después el PMS de pruebas de Aurora; aceptar Aurora antes de incorporar Brisa y continuar por módulos. El asistente se retoma sobre esta base. Maran conserva su operación y dominio actuales durante este trabajo.

**Procedimiento para ejecutar el plan:** [Guía paso a paso del multihotel de Xenia](GUIA_PASO_A_PASO_MULTIHOTEL_XENIA.md), con las acciones de Marcelo, el desarrollo técnico y el momento de cada publicación.

**Regla de ejecución:** Maran PMS está en uso. Cada avance debe conservar la operación del hotel y las correcciones recientes. Este documento no autoriza por sí solo una migración, una compra ni una publicación en producción.

**Objetivo de referencia:** preparar la puesta en marcha oficial de Maran alrededor del **1 de diciembre de 2026**, si se mantiene el horizonte de quince días mencionado el 16 de noviembre. La fecha se confirma con Marcelo y con los criterios de aceptación, no solamente con el calendario.

# 1. Qué vamos a construir

**XENIA será la marca y el producto principal. Maran será su primera instalación oficial.** Los futuros hoteles usarán el mismo producto, con sus propios datos, configuración, usuarios, integraciones y versión instalada.

Inicialmente conviene mantener **una base de datos independiente por hotel**, acompañada de instalaciones separadas cuando simplifique el aislamiento. El acceso multihotel se construirá por encima de esas instalaciones: una persona autorizada podrá elegir entre sus hoteles y consultar información consolidada dentro de sus permisos. No hace falta concentrar todas las operaciones en una sola base para ofrecer esa experiencia.

La evolución seguirá este recorrido:

**Desarrollo de Xenia → pruebas → versión aprobada → hoteles seleccionados → seguimiento.**

Maran puede conservar su nombre y dirección actuales durante la apertura. La web comercial, la demo y el desarrollo de Xenia tendrán destinos separados. Una actualización urgente para Maran también deberá incorporarse al producto común.

## 1.1 Decisiones que ya guían el plan

| Decisión | Aplicación práctica |
|---|---|
| Una fuente de código del producto | Evitar copias permanentes por hotel y el traslado manual de archivos. |
| Datos separados al inicio | Una base por hotel; revisar cualquier consolidación futura como proyecto independiente. |
| Actualizaciones controladas | Identificar código, esquema, configuración, pruebas, aprobación y hoteles destinatarios. |
| Maran continúa funcionando | Trabajar ahora en relevamiento y preparación; publicar cambios operativos por el circuito probado. |
| Demo y pruebas con datos ficticios | Nunca convertir una copia con huéspedes reales en demo pública. |
| Asistente en el módulo de Soporte | Chat para colaboradores, permisos por hotel, propuestas revisables y aprobación humana de cambios. |
| Tope inicial del asistente | US$1 diario para todo el hotel piloto; avisos en el PMS y al correo indicado por Marcelo. |

## 1.2 Qué no necesitamos terminar antes de abrir Maran

La apertura no depende de terminar el panel central multihotel, mudar el dominio del hotel, publicar la web comercial ni habilitar el asistente a todos los colaboradores. Esos proyectos avanzan en paralelo o después de validar la operación. La prioridad de apertura es que reservas, cargos, cobros, facturación, Caja y cuentas corrientes funcionen con recuperación y soporte disponibles.

# 2. Punto de partida y trabajo ya realizado

El relevamiento del 16 de noviembre se hizo sobre las referencias actualizadas del repositorio. Se creó una rama de planificación aislada, se compararon las ramas y se revisaron fuentes de configuración y publicación. **No se modificaron servicios, DNS, datos del hotel ni parámetros fiscales.**

## 2.1 Inventario inicial

| Elemento | Evidencia o estado | Consecuencia |
|---|---|---|
| Maran operativo | Dirección conocida: `https://maranpms.com.ar`. La automatización de revisión de producción referencia ese dominio. | Conservarlo durante la preparación de Xenia. |
| Código principal de Maran | Referencia `main` consultada: `494a59cd`, que incluye la PR 112. | Usar esta referencia como punto de comparación; registrar si luego cambia. |
| Rama de Xenia | `feature/xenia-channex-staging`, revisión `0bf36df2`. | Auditar las mejoras antes de integrarlas al producto común. |
| Rama del asistente | `advance/assistant-pilot-20261114`, revisión `63b34fcc`. | Hay desarrollo para revisar; la rama no demuestra que todo esté publicado o configurado. |
| Dirección asociada a Xenia en el workflow | `https://demo.maranpms.com.ar`. | Es un destino observado en automatización; falta confirmar su función y configuración real en Railway. |
| Acceso a Xenia | Lectura del código y los archivos de marca confirmada por GitHub. La infraestructura del PMS se revisará por separado. | La marca y la home pueden avanzar sin condicionar su desarrollo al acceso de Railway. |
| Dominios de Xenia | Marcelo confirmó la compra en Donweb de `xeniapms.com`, `xeniapms.com.ar`, `xeniapms.store` y `xeniapms.online`. | Principal: `.com`; los otros tres se proponen como redirecciones. DNS, HTTPS y correo todavía requieren configuración. |
| Disponibilidad pública | La primera consulta desde este entorno falló al resolver DNS. | No permite concluir que el hotel esté caído; la comprobación externa queda separada del inventario de código. |

La consulta de salud, si se completa después, se registra con su hora en el acta de ejecución y en la evidencia JSON. Un resultado de salud correcto acredita disponibilidad puntual; no demuestra por sí solo que funcionen todos los circuitos del hotel.

## 2.2 Hallazgo principal: las ramas se separaron

La comparación actual encontró **116 commits exclusivos de `main` y 190 exclusivos de la rama de Xenia**. Entre ambas referencias hay diferencias en 530 archivos. Frente a la rama del asistente, `main` tiene 116 commits exclusivos y el asistente 254. Son conteos de historial, no cantidades de funcionalidades ni medidas de calidad.

**No corresponde reemplazar Maran por la rama de Xenia ni fusionarlas completas sin revisión.** Primero hay que armar una matriz por módulo, identificar las correcciones de cada lado, sus dependencias y las pruebas necesarias. El nombre comercial Xenia no convierte automáticamente a una rama técnica en la base más completa.

La base candidata inicial es el código estable actualizado de Maran, incorporando selectivamente los desarrollos de Xenia y del asistente que correspondan. La decisión final de integración se toma después de revisar la matriz.

## 2.3 Qué mostró el código

- La conexión principal a PostgreSQL usa un `DATABASE_URL` por instancia.
- La búsqueda en el esquema no encontró un alcance general de hotel u organización aplicado a todas las entidades. No hay evidencia de un multihotel completo listo para activar.
- Existen valores predeterminados de Maran en identidad visual, configuración fiscal y mensajes.
- El navegador conserva identificadores de punto de venta y sesión asociados a Maran. Para un selector multihotel habrá que revisar también cachés, almacenamiento local y comunicaciones entre pestañas.
- Hay automatizaciones distintas para `main`, una rama de staging y la rama de Xenia. Su existencia no acredita que todos los entornos estén correctamente aislados o funcionando.

Estas observaciones definen tareas. No se ejecuta una migración de esquema dentro del relevamiento.

## 2.4 Avance confirmado el 17 de noviembre

- Web comercial de hospitalidad publicada en `https://xeniapms.com`. Marcelo confirmó que `.store` y `.online` redirigen al dominio principal. La activación de `.com.ar` quedó pendiente en el último estado comunicado por Donweb.
- Buzón `contacto@xeniapms.com`: Marcelo confirmó recepción y respuesta desde Webmail.
- Panel central publicado en `https://app.xeniapms.com`, servicio `Xenia-Control` del proyecto de pruebas `observant-possibility`, con una base central y dos bases ficticias independientes.
- Hotel Aurora y Apart Brisa activos; reservas ficticias guardadas, separadas y conservadas después de recargar la página, según la prueba manual de Marcelo.
- Perfiles de responsable, recepción de Aurora y consulta de Brisa probados por Marcelo con el alcance esperado y sin acceso a la administración central.
- La entrega del panel parte de `main` en `2301ffb6` y tiene 24 pruebas PostgreSQL/HTTP, navegador y construcción Docker aprobados para su revisión funcional `02fe8c35`. La [PR 119](https://github.com/marcesvetliza-ui/maran-pms/pull/119) sigue en borrador y no está integrada en Maran.

El acta distingue confirmación manual del propietario, verificaciones automatizadas y comprobaciones todavía pendientes: [aceptación multihotel](https://github.com/marcesvetliza-ui/maran-pms/blob/feat/xenia-multihotel-foundation-20261117/docs/xenia/evidencia/multihotel-aceptacion-2026-11-17.json). La comprobación externa de salud, el SHA exacto servido por Railway y la restauración remota siguen pendientes. El siguiente paquete está definido en [Segunda entrega: PMS aislado](https://github.com/marcesvetliza-ui/maran-pms/blob/feat/xenia-multihotel-foundation-20261117/docs/xenia/SEGUNDA_ENTREGA_PMS_AISLADO.md).

## 2.5 Paso 2 implementado el 18 de noviembre

La [PR 130](https://github.com/marcesvetliza-ui/maran-pms/pull/130) implementa PMS separados de Aurora y Brisa con datos ficticios y acceso desde Xenia, manteniendo Maran fuera de los cambios publicados. Las pruebas locales cubren la preparación limpia, el ingreso, el planning, la reserva desde el formulario, la edición y la revocación de permisos. Las cinco verificaciones de GitHub y ambas imágenes están aprobadas para `73f85093`; la [evidencia](evidencia/pms-qa-2026-11-18.json) conserva el alcance. La publicación remota y su aceptación siguen pendientes.

La [ficha de publicación](https://github.com/marcesvetliza-ui/maran-pms/blob/feat/xenia-pms-integration-20261118/docs/xenia/PASO_2_PUBLICAR_PMS_AURORA.md) entrega los pasos de Railway y Donweb. El modo QA bloquea operaciones si el panel central no puede verificar el acceso; la continuidad ante caídas, los otros circuitos operativos y la restauración remota siguen siendo condiciones pendientes para un hotel en uso.

# 3. Organización, responsables y forma de seguimiento

**Hoy Marcelo concentra la dirección del producto, la responsabilidad técnica, infraestructura, revisión fiscal y contable y soporte de apertura.** Los roles describen funciones; no requieren contratar una persona para cada una. El crecimiento del equipo se decidirá al incorporar más establecimientos y medir la carga real.

| Rol | Responsabilidad | Responsable actual y apoyo |
|---|---|---|
| Dueño del producto | Prioridades, presupuesto, alcance comercial y decisiones finales. | Marcelo. |
| Responsable técnico | Arquitectura, cambios, pruebas, publicaciones y evidencia. | Marcelo, con asistencia de IA y herramientas de desarrollo. |
| Infraestructura | Dominios, cuentas, Railway, DNS, respaldos y recuperación. | Marcelo; automatizaciones verificadas y accesos recuperables. |
| Validación de la operación | Confirmar casos reales de Recepción, Administración, Grupos, Restaurante y SPA. | Marcelo, con la devolución de los colaboradores que usan cada circuito. |
| Revisión fiscal y contable | Revisar conciliaciones, configuración fiscal, comprobantes y novedades aplicables. | Marcelo, apoyado por controles automáticos e IA; consultas profesionales puntuales cuando correspondan. |
| Soporte diario y de apertura | Atender consultas, registrar incidentes, investigar y escalar lo que requiere una decisión. | Asistente piloto como primera línea, una vez validado; Marcelo como responsable de escalamiento y aprobación. |

## 3.1 Trabajo diario con asistencia de IA

El colaborador consulta dentro de Soporte, con texto y capturas. El asistente orienta con documentación y evidencia autorizada, conserva el caso y prepara propuestas cuando corresponde. Marcelo recibe los asuntos que requieren aprobación, los incidentes sin resolver y las alertas de presupuesto. La comunicación rutinaria puede automatizarse; la responsabilidad y las decisiones de publicación permanecen identificadas.

El control contable combina comprobaciones programadas de saldos, cobros, comprobantes e imputaciones con explicaciones de la IA. La vigilancia normativa revisa fuentes oficiales de ARCA y el Boletín Oficial, registra fechas y advierte posibles impactos. Cada hallazgo debe indicar qué observó, su fuente, el alcance y el siguiente paso; no se presenta una hipótesis como diferencia confirmada.

La primera implementación será de lectura. Las correcciones de datos, alícuotas, reglas de emisión, publicaciones y presentaciones fiscales pasan por una propuesta revisable y el circuito autorizado correspondiente. Una interpretación dudosa o una gestión que requiera intervención profesional se deriva en ese caso concreto. Esta organización permite comenzar con Marcelo e IA y delegar funciones a medida que crezca Xenia.

Cada tarea tendrá identificador, responsable, dependencia, estado y evidencia de cierre. Estados: **pendiente, en curso, verificada, bloqueada por acceso o decisión**. Una tarea no pasa a verificada solamente porque su código está escrito.

Antes de la apertura, Marcelo revisará diariamente un tablero breve de circuitos críticos: incidentes abiertos, controles pendientes, cambios del día y decisiones requeridas. Las comprobaciones y los resúmenes se automatizarán progresivamente; el tablero debe mostrar la última revisión exitosa y los controles que no pudieron completarse. Se documentarán cuentas, recuperación y procedimientos para poder delegarlos sin depender de conocimiento informal.

# 4. Arquitectura objetivo del multihotel

## 4.1 Dos niveles con responsabilidades claras

| Nivel | Contenido | Condición de funcionamiento |
|---|---|---|
| Panel central de Xenia | Clientes, cadenas, hoteles, usuarios habilitados, módulos, versiones, consumo y estado de servicios. | Administra accesos y distribución; no debe ser necesario para cada cobro o emisión del hotel. |
| Operación de cada hotel | Reservas, huéspedes, folios, cargos, Caja, comprobantes, stock, grupos e integraciones locales. | Usa su propia base, configuración y permisos validados. |
| Servicios compartidos | Identidad, notificaciones, métricas y distribución de versiones, según diseño final. | Aislamiento por cliente y hotel; degradación controlada ante fallas. |

Una caída del panel central o del proveedor de inteligencia artificial no debería detener la operación habitual de un hotel que conserva acceso y configuración válidos. El mecanismo concreto se diseñará con vencimientos y revocaciones definidos. Esto no implica funcionamiento sin Internet ni autorización fiscal fuera de línea.

## 4.2 Modelo de clientes y hoteles

El modelo debe distinguir **cliente o cadena**, **hotel**, **usuario**, **membresía y rol**, **entidad fiscal**, **instalación** y **versión**. Un dueño puede acceder a tres hoteles; una recepcionista puede quedar limitada a uno. Una entidad fiscal puede operar varios hoteles y un hotel puede requerir circuitos fiscales particulares.

El servidor resolverá el hotel autorizado desde la sesión, el dominio y la membresía. No aceptará que un parámetro enviado por el navegador habilite otra base o el acceso a un hotel ajeno. El selector mostrará claramente el hotel activo; al cambiarlo deberán reiniciarse o separarse cachés, formularios, punto de venta, Caja y operaciones pendientes del contexto anterior.

No se compartirán entre hoteles, por defecto, fichas de huéspedes, documentos, saldos, conversaciones, archivos ni datos personales. Cualquier función de clientes compartidos o reportes consolidados necesitará alcance y permisos expresos.

## 4.3 Aislamiento que también hay que implementar

Una base independiente es una parte del aislamiento. También se separarán credenciales, sesiones, archivos, colas, trabajos programados, claves de caché, logs, correos, respaldos, webhooks y documentos del asistente. Las métricas centrales podrán consolidar estados y consumos sin exponer contenido operativo innecesario.

Se probarán dos hoteles ficticios con usuarios y datos deliberadamente parecidos. Desde el hotel A se intentará acceder a identificadores, archivos, búsquedas, exportaciones y conversaciones del hotel B. El resultado esperado es rechazo sin filtración de información. También se probarán usuarios con acceso legítimo a ambos hoteles y cambio de contexto entre pestañas.

## 4.4 Numeración fiscal e integraciones

La serie fiscal se identifica por **CUIT, ambiente, tipo de comprobante y punto de venta**. Si dos instalaciones comparten exactamente la misma serie, dos contadores independientes podrían competir. Se debe usar una autoridad coordinada de emisión o asignar puntos de venta distintos cuando corresponda y Administración lo confirme.

No se adelantan numeradores para evitar borradores pendientes. Los reintentos deben conservar idempotencia, consultar el estado ante ARCA cuando sea necesario y ofrecer recuperación con trazabilidad. Los cambios de cargos y estadías deben permitir trabajar a Recepción mediante los ajustes correspondientes, conservando comprobantes autorizados, cobros e historial.

En Channex se inventariarán cuenta, propiedad, credenciales, mapeos y límites de API. Una cuenta compartida exige coordinar cuota, recepción de revisiones y confirmaciones, además de resolver correctamente a qué hotel pertenece cada evento. Revisar una integración no autoriza activar canales, enviar tarifas o ejecutar una sincronización completa.

# 5. Etapas y criterios para avanzar

Las etapas comerciales y multihotel dependen de resultados, accesos y capacidad del equipo. No se promete terminar toda la transformación dentro de los quince días de preparación de Maran.

| Etapa | Trabajo y entrega | Condición para cerrar |
|---|---|---|
| 0 · Relevamiento, iniciada | Referencias de código, entornos, accesos, integraciones, riesgos y matriz de diferencias. | Inventario contrastado; vacíos y responsables identificados. |
| 1 · Preparación de Maran | Circuitos críticos, recuperación, contingencia, capacitación y versión de apertura. | Conformidad de áreas y evidencia de los criterios de la sección 11. |
| 2 · Marca y home de Xenia | Identidad existente, web comercial, dominios y primera vista previa. | Home revisada; contacto y publicación pública definidos. El asistente se retoma después. |
| 3 · Producto común y demo | Integración por módulo, configuración por instalación, versiones y demo aislada. | Una versión común probada conserva los arreglos de Maran y usa datos ficticios en la demo. |
| 4 · Fundamentos multihotel | Identidad, membresías, selector y alta repetible del segundo hotel ficticio. | Pruebas de aislamiento y recuperación superadas. |
| 5 · Piloto comercial | Un cliente adicional, alcance acotado, formación y seguimiento. | Operación y costos medidos; incidencias resueltas. |
| 6 · Crecimiento | Aprovisionamiento, versiones por grupos, soporte y facturación del servicio. | Procedimientos repetibles y capacidad operativa demostrada. |

## 5.1 Los próximos quince días de Maran

| Ventana orientativa | Prioridad | Resultado esperado |
|---|---|---|
| Días 0 a 2 | Completar inventario y responsables; revisar incidentes y pendientes conocidos. | Lista única de riesgos y definición de la versión candidata. |
| Días 3 a 7 | Validar circuitos de Recepción y Administración; corregir defectos prioritarios por el circuito habitual. | Evidencia por caso y regresiones cubiertas. |
| Días 8 a 11 | Ensayar restauración aislada y contingencia; formar al personal por rol. | Recuperación medida y colaboradores capaces de operar los casos habituales. |
| Días 12 a 14 | Revisar cambios finales, conciliaciones, accesos y cobertura de soporte. | Decisión de apertura documentada con pendientes aceptados o resueltos. |
| Día 15, tentativo | Puesta en marcha oficial y seguimiento reforzado. | Responsables disponibles, monitoreo y criterio de reversión activo. |

El hotel ya usa el sistema: la apertura oficial se prepara mediante comprobaciones y mejoras acotadas. Las pruebas que emitan comprobantes o generen movimientos se harán en un entorno aislado; cualquier validación necesaria en producción se coordinará con el área responsable.

# 6. Unificación del código sin perder arreglos

## 6.1 Matriz que hay que completar

Por cada módulo se anotará: versión en Maran, diferencia en Xenia, diferencia en el asistente, dependencias de esquema, configuración, pruebas, conflicto potencial y forma propuesta de integración. La presencia de un archivo o un commit no significa que un circuito esté completo.

| Área | Qué preservar o contrastar primero | Validación necesaria |
|---|---|---|
| Sesiones y límites de solicitudes | Recuperación de sesión, reintentos y reducción de consultas repetidas. | No perder trabajo ni repetir escrituras después de reconectar. |
| Facturación y folios | Borradores, CAE, numeración, NC y ND, cargos editables y extensión de estadía. | Reintentos sin duplicación y ajustes fiscales trazables. |
| Caja y cuentas corrientes | Saldos al checkout, cobros, imputaciones y correcciones recientes. | Conciliación entre folio, deuda, recibos y movimientos de Caja. |
| Grupos | Anticipos, cobros, facturación y filtros de consulta. | Rastrear un anticipo desde el grupo hasta Caja y comprobante, si fue emitido. |
| Restaurante y SPA | Punto fiscal, notas de crédito, consumos y stock. | Origen correcto, permisos y efecto financiero esperado. |
| Compras y Administración | PV y número en resúmenes, liquidaciones y retenciones. | Compatibilidad de documentos anteriores y nuevos. |
| Channex y OTAs | Mapeos, bandeja de reservas, eventos, filtros y revisiones. | Enrutamiento, idempotencia, cuotas y disponibilidad sin envíos no solicitados. |
| Soporte y asistente | Chat, aprobaciones, presupuestos, notificaciones y evidencia. | Permisos, calidad de respuestas, interrupciones y aislamiento. |

## 6.2 Secuencia de integración

1. Fijar las referencias comparadas y guardar su evidencia.
2. Clasificar diferencias por módulo y conservar por separado lo experimental.
3. Elegir un módulo pequeño, integrar sus dependencias y ejecutar verificaciones pertinentes.
4. Contrastar el comportamiento con los casos reales ya resueltos en Maran.
5. Publicar primero en pruebas; registrar revisión de código, esquema y configuración.
6. Aprobar una versión candidata y definir los hoteles que la reciben.
7. Vigilar la publicación y registrar resultado y cambios pendientes.

Hasta validar el nuevo circuito, se conserva la ruta actual de correcciones urgentes de Maran. Más adelante, el desarrollo de Xenia y la publicación del hotel deberán quedar desacoplados: un commit de producto no debe actualizar automáticamente todos los hoteles.

La marca común se extraerá a configuración: nombre comercial, logo, colores, CUIT, datos de contacto, textos, plantillas, zonas horarias y módulos. La interfaz y el servidor validarán los módulos habilitados. Las diferencias específicas se resolverán en componentes compartidos o adaptadores acotados.

# 7. Direcciones web y estructura propuesta

**Dominios adquiridos en Donweb, según confirmación de Marcelo:** `xeniapms.com`, `xeniapms.com.ar`, `xeniapms.store` y `xeniapms.online`. Se establece `xeniapms.com` como principal. Los otros tres tendrán redirecciones al principal cuando se configure la publicación. Las direcciones de app, demo, QA y ayuda son destinos previstos, no servicios ya conectados.

## 7.1 Mapa de direcciones

| Dirección definida o prevista | Función | Destino y acceso |
|---|---|---|
| `xeniapms.com` | Web comercial principal. | Servicio del sitio, contenido público. |
| `www.xeniapms.com` | Variante de la web. | Redirección a la dirección principal elegida. |
| `app.xeniapms.com` | Acceso al producto y selector de hoteles. | Portal autenticado; puede incorporarse después del sitio. |
| `demo.xeniapms.com` | Demostración comercial estable. | Instalación con datos ficticios, permisos limitados y reinicio controlado. |
| `qa.xeniapms.com` | Pruebas de versiones candidatas. | Acceso restringido; integraciones de prueba. |
| `dev.xeniapms.com` | Desarrollo, si se necesita una URL pública. | Preferentemente privado o restringido. |
| `ayuda.xeniapms.com` | Documentación pública o portal de ayuda. | Puede comenzar como `/ayuda` en el sitio. |
| `estado.xeniapms.com` | Estado de servicio e incidentes. | Preferentemente hospedado de forma independiente del PMS. |
| `maran.xeniapms.com` | Alias opcional futuro de Maran. | Se evalúa después de la apertura; no exige retirar `maranpms.com.ar`. |
| `xeniapms.com.ar` | Dominio alternativo adquirido. | Redirección al principal, con HTTPS. |
| `xeniapms.store` | Dominio alternativo adquirido. | Redirección al principal, con HTTPS. |
| `xeniapms.online` | Dominio alternativo adquirido. | Redirección al principal, con HTTPS. |

No hay que crear todos los subdominios el primer día. El primer objetivo comercial puede ser **web, www y demo**; `app` se activa cuando esté listo el acceso común. Cada dirección tendrá un registro en el inventario, responsable, servicio de destino y fecha de validación.

Un subdominio no crea por sí solo otra base ni otro hotel. Varias direcciones pueden llegar al mismo servicio; el diseño de sesiones y enrutamiento debe impedir que una configuración de host equivocada mezcle contextos.

## 7.2 Secciones de la web y rutas del producto

En la web comercial se proponen `/producto`, `/modulos`, `/planes`, `/solicitar-demo`, `/contacto`, `/ayuda`, `/privacidad` y `/terminos`. Cada ruta puede ser una sección o una página según el tamaño del sitio. Los precios y promesas comerciales se publican después de su revisión.

Dentro de cada hotel se conservarán las rutas del PMS que correspondan, como `/planning`, `/billing` y `/ota-channels`. **Una ruta web no constituye una autorización**: todas las consultas y acciones deben verificar permisos en el servidor.

Si un cliente solicita su propio dominio, por ejemplo `pms.hotelcliente.example`, se comprobará su control mediante el registro indicado por el proveedor, se emitirá el certificado y se asociará ese host a la instalación correcta. La baja del cliente también debe retirar esta asociación para evitar que un dominio abandonado apunte a otro servicio.

# 8. Paso a paso para obtener y publicar la web de Xenia

La compra de los cuatro dominios ya fue confirmada por Marcelo en Donweb. La guía conserva el procedimiento de registro para futuras altas; ahora corresponde revisar la home y preparar DNS, HTTPS, contacto y redirecciones. Los registros reales se copiarán desde el alojamiento elegido, sin inventar IP, CNAME o servidores de nombres.

## 8.1 Elegir y registrar el dominio

1. **Anotar el nombre exacto.** Registrar dominio completo, extensión, variantes deseadas y uso previsto. Verificar que sea fácil de escribir y pronunciar; distinguir el nombre de marca del dominio disponible.
2. **Comprobar disponibilidad en el momento de contratar.** Una consulta previa no reserva el dominio. Revisar también posibles conflictos de marca con asesoramiento cuando corresponda.
3. **Elegir titular.** El dominio debe quedar en una cuenta controlada por Marcelo o la empresa que comercialice Xenia. Registrar razón del titular y personas con acceso; evitar que dependa de una cuenta personal de un proveedor externo.
4. **Comparar registradores.** Ver precio inicial, renovación, moneda, impuestos, transferencia, privacidad del titular y recuperación de cuenta. Para `.ar`, revisar el circuito de NIC Argentina; para otras extensiones, un registrador compatible.
5. **Preparar la cuenta.** Correo de recuperación que ya funcione y no dependa del dominio que se está comprando, contraseña única y autenticación de dos factores. Guardar recuperación en un gestor seguro.
6. **Revisar el gasto concreto.** Dejar dominio, titular, precio del primer período, renovación y medio de pago listos para aprobación de Marcelo.
7. **Comprar y conservar comprobante.** Confirmar que aparezca como registrado en la cuenta correcta. Registrar vencimiento y activar renovación automática si se decide así.
8. **Proteger la continuidad.** Activar bloqueo de transferencia si el registrador lo ofrece; documentar cómo recuperar el acceso y programar una revisión antes del vencimiento.

**Estado del registro:** compra confirmada por Marcelo. Falta anotar titular, vencimientos, renovación y recuperación de cuenta con evidencia del panel de Donweb. No se da por verificado ese detalle por el solo hecho de haber comprado.

## 8.2 Preparar DNS sin afectar Maran

9. **Confirmar quién administra DNS.** Revisar la gestión de los dominios comprados en Donweb. Mantener allí la zona si permite los registros necesarios; si se elige otro proveedor, documentar la delegación y preservar los servicios existentes. Registrar por separado registrador, DNS y alojamiento.
10. **Crear la zona de Xenia.** Agregar exclusivamente el dominio nuevo a la cuenta empresarial elegida. Revisar qué registros existen antes de cambiar nada. Si ya tuviera servicios, exportar su zona y preservarlos.
11. **Configurar responsables y acceso.** Asignar permisos mínimos, 2FA y respaldo de recuperación. Guardar el identificador de cuenta y zona sin publicar tokens.
12. **Configurar la delegación.** Copiar los servidores de nombres que indique el proveedor DNS y cargarlos en el registrador. Si el registrador ya gestiona esa delegación automáticamente, seguir su procedimiento.
13. **Verificar la delegación pública.** Consultar NS desde más de un resolvedor y comprobar que la zona figure activa. La propagación varía; no anunciar la web hasta verificarla.
14. **Revisar DNSSEC.** Si se habilita, seguir el orden de activación del proveedor y registrar correctamente el DS donde corresponda. Una delegación inconsistente puede impedir la resolución.

Durante estos pasos **no se cambia la zona ni los servidores de nombres de `maranpms.com.ar`**. El nuevo dominio puede ponerse en marcha de forma independiente.

## 8.3 Preparar servicios y direcciones de destino

15. **Elegir alojamiento del sitio.** Puede ser un servicio estático o una aplicación independiente. La web comercial no necesita acceso a la base operativa del hotel. Documentar proveedor, cuenta, repositorio y costo.
16. **Crear el entorno del sitio.** Configurar compilación, salida, variables estrictamente necesarias y publicación de prueba. Los secretos no se incorporan al código del navegador.
17. **Identificar cada destino.** El código de Xenia se consulta por GitHub. La home tiene una publicación independiente; el servicio operativo del PMS se verifica por separado con su revisión, base y configuración. Auditar Railway cuando corresponda a ese servicio, sin bloquear el desarrollo de la marca o la web.
18. **Separar demo y QA.** Crear o validar servicios y bases distintos. Revisar correo, tareas programadas, archivos, proveedores y credenciales para que una prueba no actúe sobre Maran.
19. **Añadir cada dominio personalizado en su servicio.** Ejemplo: web raíz y www al sitio; demo al servicio de demostración. El proveedor devolverá las instrucciones de validación y DNS.
20. **Copiar los valores reales al inventario.** Tipo de registro, nombre, destino, prioridad si aplica, TTL, modo proxy y servicio de origen. Verificar que el puerto del dominio coincida con el que atiende la aplicación cuando el proveedor lo requiera.
21. **Crear los registros DNS.** Usar los valores exactos del alojamiento. En el dominio raíz, seguir su solución compatible de ALIAS, aplanamiento de CNAME o A/AAAA; no improvisar una IP. No mantener registros incompatibles para el mismo nombre.
22. **Esperar validación del proveedor y certificado.** Comenzar en modo de resolución directa cuando el alojamiento lo necesite. Activar proxy después de comprobar compatibilidad y HTTPS en origen.

### Plantilla de registro DNS

| Nombre de ejemplo | Tipo previsto | Valor real y validación |
|---|---|---|
| `@` | Según alojamiento del sitio. | Pendiente: copiar instrucciones del proveedor. |
| `www` | CNAME u opción indicada. | Pendiente: destino de la web y redirección canónica. |
| `demo` | CNAME u opción indicada. | Pendiente: servicio de demo aislado. |
| `app` | CNAME u opción indicada. | Crear cuando exista el portal autenticado. |
| `qa` | CNAME u opción indicada. | Acceso restringido; sin credenciales productivas. |
| Validación de dominio | TXT o CNAME. | Nombre y contenido exactos del proveedor. |
| Correo | MX y TXT/CNAME. | Crear solamente según proveedor de buzón y de envío. |

## 8.4 HTTPS, redirecciones, caché y sesiones

23. **Validar HTTPS en cada nombre.** Comprobar certificado, nombre de dominio y renovación. Si se usa proxy de Cloudflare, preferir cifrado completo con validación del certificado de origen una vez que esté listo.
24. **Elegir la dirección canónica.** Por ejemplo, raíz para la web y www redirigido a raíz. Probar redirecciones temporales; usar permanentes cuando el destino sea definitivo. Conservar ruta y parámetros útiles.
25. **Separar reglas web de rutas de integración.** No aplicar redirecciones comerciales o desafíos interactivos indiscriminados a webhooks. Cada integración tendrá autenticación, validación y controles de tráfico propios.
26. **Revisar caché.** El sitio público puede usar CDN. APIs autenticadas, datos personales, sesiones y respuestas financieras no deben quedar en una caché pública. Verificar comportamiento después de una publicación.
27. **Revisar cookies y origen.** Evitar una cookie compartida por todos los subdominios que permita a demo o QA afectar sesiones reales. Definir dominios, SameSite, Secure, CSRF, CORS y flujos de acceso comunes según la arquitectura elegida.
28. **Comprobar rutas directas.** Abrir una ruta del PMS desde un enlace y recargarla; verificar que el alojamiento resuelva la aplicación sin errores de página inexistente. Probar también cierre de sesión y recuperación de acceso.

## 8.5 Correo de Xenia y notificaciones

29. **Definir direcciones.** Propuesta inicial: contacto y soporte; administración o facturación si se necesitan. Son ejemplos de buzones o alias, no cuentas ya creadas.
30. **Contratar o configurar buzones.** Elegir un proveedor de correo y cargar sus MX. Un proveedor de envío como Resend no crea por sí solo una casilla para recibir mensajes.
31. **Configurar envío transaccional.** Verificar el dominio o subdominio que indique el proveedor, cargar DKIM y los registros SPF que correspondan. Mantener una sola política SPF por nombre y combinar mecanismos válidos cuando haga falta.
32. **Añadir DMARC de forma progresiva.** Comenzar con monitoreo y una dirección válida de reportes; endurecer la política después de verificar todos los emisores legítimos. No copiar registros de otra marca sin revisión.
33. **Separar remitente y respuesta.** Definir quién recibe solicitudes comerciales, soporte y alertas. Evitar una dirección sin atención para asuntos que necesitan respuesta.
34. **Hacer pruebas de punta a punta.** Enviar y responder desde proveedores distintos, comprobar autenticación y revisar rebotes o spam. Confirmar que demo y QA no envíen correos de huéspedes reales.

Los avisos del piloto del asistente irán a **Msvetliza@maran.com.ar** y a una bandeja del PMS, según lo solicitado. Los futuros clientes tendrán sus propios destinatarios configurables. No se modifica el correo de Maran para poner en marcha el dominio de Xenia.

## 8.6 Contenido y publicación de la web

35. **Aprobar el contenido.** Presentar Xenia, módulos disponibles, público objetivo, modo de pedir demo, datos de contacto y alcance de soporte. Distinguir funciones disponibles de funciones en desarrollo.
36. **Preparar marca y diseño.** Logo, colores, tipografía, capturas con datos ficticios y versiones móviles. Revisar legibilidad, navegación con teclado, etiquetas de formularios y contraste.
37. **Crear el circuito de contacto.** Formulario con campos mínimos, validación, protección contra abuso y destino confirmado. Incluir información de privacidad y consentimiento cuando corresponda. No solicitar datos financieros sensibles en un formulario comercial.
38. **Revisar textos legales.** Privacidad, términos, tratamiento de datos, responsabilidades y canal de contacto con revisión profesional según el alcance comercial. Evitar prometer disponibilidad o certificaciones todavía no demostradas.
39. **Preparar descubrimiento y medición.** Títulos, descripciones, iconos, mapa del sitio y herramientas de búsqueda si se eligen. Medir visitas o contactos respetando privacidad; no indexar la demo autenticada ni QA. La restricción de acceso se hace en el servidor, no mediante `robots.txt`.
40. **Publicar primero una vista previa.** Marcelo revisa textos, enlaces, formularios y móvil. Registrar la versión aprobada antes de asignar el dominio definitivo.
41. **Ejecutar la lista de aceptación web.** DNS, HTTPS, raíz y www, formularios, correo, enlaces de demo, permisos, privacidad y ausencia de datos reales. Confirmar desde al menos dos conexiones diferentes.
42. **Activar y documentar.** Publicar el dominio definitivo, guardar evidencia y revisar errores y contactos recibidos. Dejar procedimiento de reversión del sitio sin tocar la aplicación del hotel.

## 8.7 Registro de direcciones que debe quedar completo

Para cada dirección se guardará: URL, propósito, dueño de cuenta, registrador, proveedor DNS, proyecto, servicio, entorno, repositorio, rama o versión, destino DNS, certificado, correo asociado, vencimiento, costo, responsable y fecha de última comprobación. Las claves se almacenarán en un gestor de secretos; el registro contendrá solamente su ubicación y responsable.

# 9. Versiones, publicaciones y correcciones urgentes

La meta es construir una vez una versión identificada y promover el mismo artefacto probado a los hoteles elegidos. La configuración de cada instalación se inyectará en el entorno y se validará; no se recompilarán variantes manuales sin trazabilidad. Las migraciones de base se ejecutarán por instalación con su estado registrado.

## 9.1 Ficha mínima de cada publicación

- Versión y revisión de código; identificador del artefacto y resultado de verificaciones.
- Cambios visibles, módulos afectados y hoteles destinatarios.
- Migraciones y versión de esquema, compatibilidad con el código anterior y duración estimada.
- Configuración o secretos nuevos, sin sus valores; responsable de cargarlos.
- Respaldo o punto de recuperación comprobado y estado de procesos en curso.
- Responsable de aprobación, horario, verificación posterior y señales de reversión.

Se ensayará primero en QA. Un piloto controlado permite observar una versión antes de ampliarla al resto de hoteles. Maran no tiene que recibir cada experimento del producto. Un interruptor de función puede ayudar a retirar una mejora, pero no reemplaza las pruebas ni los permisos del servidor.

## 9.2 Migraciones y reversión

Se priorizarán cambios compatibles: agregar estructuras, desplegar código que tolere ambas versiones, completar datos y retirar lo viejo en otra publicación. Evitar cambios destructivos junto con un lanzamiento urgente.

Si falla una publicación, se detendrá su expansión y se aplicará el procedimiento comprobado: deshabilitar la función, volver al artefacto anterior si sigue siendo compatible o corregir hacia adelante. **Restaurar una base antigua después de nuevos cobros o CAE puede perder operaciones válidas.** La recuperación de datos requiere detener y conciliar las operaciones afectadas con responsables identificados.

La automatización actual que vincula `main` con producción se revisará después de probar un camino alternativo. Cambiarla será un hito explícito; mientras tanto, una fusión a `main` se trata como potencial publicación del hotel, incluso si el cambio parece pequeño.

# 10. Asistente piloto dentro de Soporte

El piloto debe ofrecer a los colaboradores un chat donde describan problemas, adjunten capturas y reciban asistencia clara. La calidad se verificará con conversaciones reales anonimizadas: qué entendió, qué evidencia utilizó, qué puede resolver y qué debe elevar.

## 10.1 Alcance inicial

Puede explicar circuitos, consultar documentación autorizada, recopilar contexto y preparar un diagnóstico o propuesta de cambio. Las respuestas deben distinguir hechos observados, hipótesis y datos que faltan. No presentará como realizado un cambio que solamente recomendó.

Los cambios de código o configuración se convertirán en propuestas revisables, con efecto esperado y validaciones. Su aprobación humana no sustituye permisos operativos ni dispara una ejecución ilimitada. El piloto inicial no obtiene acceso general a SQL, todos los hoteles o emisiones fiscales.

Cada conversación, captura, documento y búsqueda pertenecerá a un hotel y respetará los permisos del colaborador. Las herramientas de lectura estarán acotadas; si más adelante se habilitan acciones sobre reservas o finanzas, cada una tendrá autorización, idempotencia y auditoría específicas.

## 10.2 Presupuesto y avisos

El presupuesto inicial es **US$1 por día para todo el hotel piloto**, con día de corte propuesto en `America/Argentina/Buenos_Aires`. Es un techo de consumo del proveedor de IA, no un gasto fijo ni una tarifa que incluya alojamiento, correo o impuestos. El modelo, los precios vigentes y cualquier otra herramienta facturada se registrarán antes de activarlo.

Ese mismo techo incluye el chat, las investigaciones y los futuros resúmenes contables o normativos que llamen a un modelo. No se habilita otro presupuesto paralelo. Los controles deterministas y la descarga de fuentes no necesitan tokens de IA, aunque usan infraestructura y pueden tener otros costos. Si se agota el cupo, los controles ya implementados y el registro de incidentes continúan; se pausan las nuevas interpretaciones pagas y se informa su estado.

El control reservará el costo máximo permitido antes de iniciar una consulta y conciliará el consumo real. Debe contemplar solicitudes simultáneas. Si hay una interrupción y no puede confirmarse el consumo, se pausarán nuevos gastos hasta revisar esa incertidumbre. El presupuesto de otros hoteles será independiente y podrá existir además un límite global de la empresa.

Se propone aviso preventivo al 80% y aviso de agotamiento al llegar al límite, junto con el estado visible en el chat. Al agotarse, seguirán disponibles el historial y el circuito de soporte sin nuevas consultas pagas hasta el reinicio o una decisión autorizada.

Los pedidos de aprobación y alertas se registrarán en la bandeja del PMS y se enviarán a **Msvetliza@maran.com.ar** para este piloto. Tendrán estado y enlace al caso; si falla el correo se reintentará con límite y el aviso seguirá visible dentro del sistema. Evitar duplicados por cada recarga o solicitud rechazada.

## 10.3 Criterios antes de llevarlo a Maran

Probar respuestas sobre casos conocidos, permisos, capturas, conversaciones largas, límites simultáneos, día de corte, proveedor caído, consumo incierto, correos fallidos y aprobación rechazada. El usuario debe poder entender la recomendación y su siguiente paso. Medir costo y utilidad; no prometer respuestas idénticas a este chat sin evaluar modelo, herramientas, contexto y reglas concretas.

## 10.4 Control contable y seguimiento de ARCA

Se agregarán como capacidades del módulo de Soporte, con hallazgos en la misma bandeja y permisos por hotel. Son dos circuitos distintos:

| Circuito | Primera implementación | Resultado visible |
|---|---|---|
| Control contable de la operación | Comprobar en lectura relaciones entre folio, cargos vigentes, cobros, Caja, cuentas corrientes y comprobantes; contemplar anticipos, transferencias y ajustes válidos. | Diferencia sustentada, evidencia mínima y circuito de revisión. Una diferencia entre total facturado y cobrado no constituye por sí sola un error. |
| Vigilancia normativa y técnica | Revisar publicaciones y documentación oficiales, comparar contenido relevante y verificar aplicación al perfil fiscal del hotel. | Fuente, publicación, vigencia, cambio observado, posible impacto y propuesta de revisión. |

El primer paso para acceder a datos del hotel serán consultas de diagnóstico específicas y de solo lectura, con validación del usuario y hotel en el servidor. Se devolverán los datos mínimos necesarios, sin habilitar SQL libre ni acceso a otros hoteles. La IA no recibirá claves fiscales, certificados ni credenciales de proveedores.

Se propone comenzar con un control contable diario y una revisión normativa cada 24 horas, complementados por investigación manual de incidentes y las señales operativas disponibles. La periodicidad se ajustará después de medir carga y utilidad. El estado mostrará última ejecución correcta, fuentes cubiertas, fallas y próxima revisión. “Seguimiento continuo” significa un proceso programado verificable; no una garantía de detectar instantáneamente cualquier publicación.

Fuentes iniciales: documentación de webservices de factura electrónica de [ARCA](https://www.arca.gob.ar/ws/documentacion/ws-factura-electronica.asp), [Biblioteca Electrónica de ARCA](https://biblioteca.arca.gob.ar/) y [Boletín Oficial](https://www.boletinoficial.gob.ar/). Antes de activar el proceso se validarán los mecanismos de consulta de cada fuente y el perfil fiscal aplicable. Se guardará una referencia y huella de la versión revisada. El cambio de contenido de una página no se tratará automáticamente como un cambio normativo aplicable.

Una novedad genera un caso para Marcelo con fuente completa, fechas, alcance, pruebas propuestas y decisión pendiente. Los cambios aceptados se implementan en pruebas, se verifican contra la norma y se publican por el circuito de versiones. La detección y las explicaciones no modifican automáticamente impuestos, comprobantes, numeradores ni declaraciones.

La revisión inicial del código del piloto encontró chat con capturas, control de presupuesto, avisos y flujo de revisión. Sus reglas actuales excluyen acceso a movimientos reales del hotel y a ARCA; por eso el control contable y la vigilancia normativa requieren desarrollo y validación adicionales. La existencia del código no demuestra que la configuración publicada esté habilitada o use el presupuesto correcto.

# 11. Preparación operativa y aceptación de Maran

Las verificaciones automáticas del repositorio son una base. La apertura también exige aceptación de los circuitos por quienes los usan. Se registrarán caso, resultado esperado, resultado observado, responsable, entorno, fecha y evidencia.

| Circuito | Casos mínimos | Aceptación |
|---|---|---|
| Reservas y estadías | Alta, modificación, extensión, cambio de habitación y reservas con cargos transferidos. | Disponibilidad correcta e historial; lo facturado se ajusta por el circuito correspondiente sin inmovilizar la operación. |
| Folio y cargos | Carga, edición y anulación de cargos, incluidos early y late checkout. | Total correcto, motivo y trazabilidad; tratamiento fiscal guiado cuando corresponda. |
| Cobros | Efectivo, transferencias, tarjetas, pagos parciales y reconexión. | Caja y recibos consistentes; ninguna escritura duplicada por reintentar. |
| ARCA | Emisión, rechazo, estado incierto, recuperación, NC y ND. | CAE y numeración consistentes; corrección de pendientes sin saltar contadores ni repetir cobros. |
| Checkout y cuenta corriente | Saldo pendiente, centavos residuales y titular huésped o empresa. | Informar saldo y permitir el cierre por el circuito autorizado de cuenta corriente; sin simular un cobro. |
| Grupos y anticipos | Registrar anticipo, imputar, consultar por grupo, ver comprobante emitido y conciliar Caja. | Todo cobro registrado debe poder rastrearse; si se facturó, el comprobante debe encontrarse en Facturación con filtros adecuados. |
| Restaurante y SPA | Consumos, transferencias, PV, notas de crédito y stock relevante. | Origen, permisos, comprobantes y movimientos correctos. |
| Administración | Compras, resúmenes bancarios, liquidaciones, retenciones y PV/número. | Registro y búsqueda consistentes con documentos anteriores. |
| Sesiones | Trabajo prolongado, muchas reservas, error temporal, pestañas y salida voluntaria. | Recuperación comprensible y datos protegidos; no repetir automáticamente escrituras. |
| Channex | Mapeos, reservas entrantes, modificaciones, cancelaciones, reintentos y cuotas. | Cada evento llega al hotel correcto una sola vez y muestra su estado; envíos activados sólo con autorización correspondiente. |
| Recuperación | Restaurar respaldo en entorno aislado, revisar archivos y comprobar un flujo básico. | Tiempo medido, integridad verificada y procedimiento que otra persona pueda ejecutar. |

La captura de Channex con muchos eventos pendientes e intentos en cero es un antecedente para investigar. No demuestra el estado actual de la cola ni identifica por sí sola la causa. Su diagnóstico debe consultar configuración, trabajadores y evidencia reciente antes de reintentar o enviar datos.

**Decisión de apertura:** Marcelo, responsable técnico y referentes operativos revisarán defectos bloqueantes, conciliaciones y recuperación. Un pendiente no crítico puede aceptarse con responsable y fecha; un riesgo de duplicar cobros, perder datos o emitir con serie incorrecta requiere resolución o contención comprobada.

# 12. Respaldos, continuidad y manejo de incidentes

## 12.1 Qué debe poder recuperarse

Respaldar base de datos, archivos y adjuntos, configuración recuperable, referencia de versión y acceso a claves necesarias para restaurar. Separar los respaldos por hotel, controlar permisos y conservar una copia en una ubicación con fallas y acceso independientes cuando el diseño elegido lo permita.

Antes de fijar un compromiso comercial se definirán **RPO** —cuántos datos recientes se tolera perder— y **RTO** —cuánto tiempo se tolera para recuperar— con el hotel y según costo y capacidades reales del servicio. Quedan pendientes los valores; no se ofrecen tiempos de recuperación todavía no medidos.

La restauración se ensaya en una base nueva aislada, sin correos, webhooks ni trabajos productivos. Se verifican conteos y relaciones relevantes, acceso a archivos y un circuito operativo. Registrar fecha, duración, resultados y quién podría repetirla. Un archivo de backup existente no acredita recuperación posible.

## 12.2 Procedimiento ante incidente

1. Registrar hora, hotel, usuario, acción, pantalla y mensaje, evitando copiar datos sensibles innecesarios.
2. Clasificar impacto: operación financiera o datos, trabajo de un área, o función secundaria.
3. Contener: detener una función o publicación problemática conservando el resto de la operación cuando sea posible.
4. Revisar versión, logs con acceso restringido, estado de servicios y operaciones pendientes.
5. Aplicar la corrección o recuperación revisada; no borrar evidencias ni reintentar emisiones o cobros a ciegas.
6. Verificar con el área afectada y conciliar los registros comprometidos.
7. Comunicar resolución y dejar acción preventiva y responsable.

Antes de la apertura habrá un canal y responsables para reportes urgentes, un registro de incidentes y un procedimiento de contingencia operativo acordado con el hotel. El asistente será un canal adicional; su presupuesto o disponibilidad no limitará la posibilidad de reportar un problema.

# 13. Alta, operación y baja de futuros hoteles

## 13.1 Alta repetible

1. Confirmar cliente, hoteles, responsables, país, zona horaria, moneda, módulos y condiciones comerciales.
2. Crear identificadores y membresías autorizadas en el panel central.
3. Aprovisionar servicio, base vacía y almacenamiento desde una plantilla limpia, con migraciones versionadas.
4. Configurar marca, habitaciones, tarifas, impuestos, Caja, permisos e integraciones específicas.
5. Registrar entidad fiscal, ambiente, puntos de venta y coordinación de series antes de permitir emisiones.
6. Configurar dominio, certificado, correo y credenciales del hotel; verificar aislamiento.
7. Importar datos sólo por un procedimiento revisado, con validación, conciliación y recuperación prevista.
8. Capacitar, ejecutar aceptación y fijar versión inicial y responsables de soporte.

No se da de alta otro hotel clonando la base real de Maran. Las plantillas incluyen estructuras y datos de ejemplo seguros; los datos reales se importan de manera explícita y controlada.

## 13.2 Gestión y costos

El panel mostrará versión, módulos, estado de respaldo, incidencias y uso relevante de cada hotel. Los costos se medirán por alojamiento, base, almacenamiento, respaldo, correo, integraciones, IA y soporte. Antes de fijar precios de venta se estimarán margen, impuestos, crecimiento y costo de atención.

Definir qué funciones forman parte de cada plan, qué límites son comerciales y cómo se avisa al acercarse a ellos. Un problema de cobro del servicio o una dependencia central debe tener un tratamiento definido que evite cortar de manera improvisada una operación crítica.

## 13.3 Acceso de soporte y salida

El acceso de soporte tendrá motivo, hotel, alcance, duración y auditoría. No se comparte una cuenta administrativa entre técnicos. Al terminar, se retiran accesos y se conserva la evidencia necesaria.

La baja incluirá exportación de datos acordada, retiro de dominios y credenciales, retención definida en contrato y eliminación verificable cuando corresponda. Las obligaciones legales y fiscales se revisarán con asesoramiento; el plan técnico no las reemplaza.

# 14. Tablero inicial de tareas

Las fechas se asignan al confirmar responsables. **P0** protege la operación y la apertura; **P1** habilita la base común y comercial; **P2** amplía el producto. “Hecha” corresponde a la evidencia de esta sesión, no a una validación integral del sistema.

## 14.1 Relevamiento y continuidad

| ID | Tarea y evidencia de cierre | Responsable propuesto | Estado / dependencia |
|---|---|---|---|
| A01 · P0 | Crear rama aislada y fijar referencias de código. | Técnico | Hecha; base `494a59cd`. |
| A02 · P0 | Comparar historial y tamaño de diferencias. | Técnico | Hecha; inventario JSON. |
| A03 · P0 | Revisar conexión, alcance del esquema, marca y automatizaciones. | Técnico | Hecha a nivel inicial; falta auditoría integral. |
| A04 · P0 | Completar inventario real de Railway y dependencias de Maran/Xenia. | Infraestructura | En curso; panel y tres bases nuevas identificados por la sesión del propietario; inventario del PMS pendiente. |
| A05 · P0 | Confirmar salud externa, revisión servida y configuración por entorno. | Infraestructura | En curso; contraste externo pendiente. |
| A06 · P0 | Completar matriz funcional de diferencias por módulo. | Técnico y áreas | Pendiente; A01 a A04. |
| A07 · P0 | Registrar a Marcelo como responsable actual y definir delegación progresiva. | Marcelo | Hecha; roles confirmados en la versión 1.1. |
| A08 · P0 | Confirmar fecha, alcance y criterios de apertura. | Marcelo y hotel | Pendiente; sección 11. |
| A09 · P0 | Inventariar respaldos, adjuntos y recuperación de claves. | Infraestructura | Pendiente; A04. |
| A10 · P0 | Restaurar en entorno aislado y medir recuperación. | Infraestructura y hotel | Pendiente; A09. |

## 14.2 Preparación de Maran

| ID | Tarea y evidencia de cierre | Responsable propuesto | Estado / dependencia |
|---|---|---|---|
| M01 · P0 | Validar reservas, extensiones y movimientos entre habitaciones. | Recepción y técnico | Pendiente; entorno de prueba. |
| M02 · P0 | Validar edición y anulación de cargos con trazabilidad. | Recepción y Administración | Pendiente. |
| M03 · P0 | Validar emisión, pendientes, CAE, NC y ND. | Administración y técnico | Pendiente; configuración fiscal. |
| M04 · P0 | Validar checkout con saldo y cuenta corriente. | Recepción y Administración | Pendiente. |
| M05 · P0 | Rastrear anticipos de grupos a Caja y comprobantes. | Grupos y Administración | Pendiente; elegir un caso de prueba y luego un caso real. |
| M06 · P0 | Revisar Restaurante, SPA y documentos de compras. | Referentes de áreas | Pendiente. |
| M07 · P0 | Validar sesiones, reconexión y ausencia de duplicados. | Recepción y técnico | Pendiente. |
| M08 · P0 | Diagnosticar colas, trabajadores y mapeos de Channex sin enviar. | Técnico y comercial | Pendiente; A04. |
| M09 · P0 | Capacitar por rol y ensayar contingencia. | Hotel y soporte | Pendiente; resultados M01 a M08. |
| M10 · P0 | Revisar versión de apertura y decidir inicio oficial. | Marcelo y responsables | Pendiente; aceptación y recuperación. |

## 14.3 Producto y versiones

| ID | Tarea y evidencia de cierre | Responsable propuesto | Estado / dependencia |
|---|---|---|---|
| P01 · P1 | Elegir base común con matriz de diferencias revisada. | Técnico y Marcelo | En curso; revisión inicial de identidad, sesiones, conexión y arranque; matriz funcional completa pendiente. |
| P02 · P1 | Integrar mejoras por módulo con verificaciones. | Técnico | Pendiente; P01. |
| P03 · P1 | Extraer identidad y parámetros por instalación. | Técnico | Pendiente; P01. |
| P04 · P1 | Definir versiones, artefactos, migraciones y compatibilidad. | Técnico e infraestructura | Pendiente. |
| P05 · P1 | Ensayar promoción y reversión en QA. | Técnico e infraestructura | Pendiente; P04. |
| P06 · P1 | Desacoplar desarrollo y publicación de hoteles. | Técnico y Marcelo | Pendiente; P05 y publicación revisada. |
| P07 · P1 | Documentar circuito de hotfix y retorno al producto. | Técnico | Pendiente; P04. |

## 14.4 Dominio, web y correo

| ID | Tarea y evidencia de cierre | Responsable propuesto | Estado / dependencia |
|---|---|---|---|
| W01 · P1 | Registrar nombres, titular y administración de los dominios. | Marcelo | En curso; cuatro nombres confirmados, titular y recuperación por verificar. |
| W02 · P1 | Registrar la compra de los dominios y el proveedor. | Marcelo e infraestructura | Hecha; compra de cuatro dominios en Donweb confirmada por Marcelo. |
| W03 · P1 | Configurar recuperación, 2FA y renovación. | Infraestructura | Pendiente; W02. |
| W04 · P1 | Crear zona DNS y verificar delegación. | Infraestructura | En curso; zona principal utilizada para web, correo y panel; inventario de los cuatro dominios pendiente. |
| W05 · P1 | Aprobar mapa de URLs y propietarios de servicios. | Marcelo y técnico | En curso; web principal y panel definidos; direcciones del PMS de pruebas propuestas. |
| W06 · P1 | Preparar sitio comercial y vista previa. | Diseño y desarrollo | Hecha; home comercial aprobada, con logos originales y revisión responsive. |
| W07 · P1 | Preparar demo estable sin datos reales. | Técnico | Pendiente; A04 y aislamiento. |
| W08 · P1 | Configurar destinos DNS y certificados reales. | Infraestructura | En curso; web principal y acceso al panel confirmados; `.com.ar` pendiente y verificación integral por completar. |
| W09 · P1 | Configurar buzones, remitentes y autenticación de correo. | Infraestructura | En curso; contacto recibe y responde; autenticación y remitentes del producto por revisar. |
| W10 · P1 | Probar formularios, móvil, privacidad, HTTPS y accesos. | Marcelo y técnico | En curso; home responsive y perfiles del panel probados; aceptación comercial integral pendiente. |
| W11 · P1 | Publicar web aprobada y registrar evidencia. | Marcelo e infraestructura | Verificada para la web comercial principal; publicación pública autorizada por Marcelo. |
| W12 · P2 | Crear portal común, ayuda y estado según necesidad. | Técnico | En curso; panel central publicado; ayuda y estado pendientes. |

## 14.5 Multihotel y asistente

| ID | Tarea y evidencia de cierre | Responsable propuesto | Estado / dependencia |
|---|---|---|---|
| H01 · P1 | Diseñar cliente, hotel, entidad fiscal y membresías. | Técnico y Administración | En curso; cliente, establecimientos y membresías probados en el panel; entidad fiscal pendiente. |
| H02 · P1 | Resolver identidad y continuidad ante caída central. | Técnico | En curso; identidad central-PMS y revocación probadas en QA; continuidad ante caída central pendiente. |
| H03 · P1 | Automatizar alta limpia de un hotel ficticio. | Infraestructura y técnico | En curso; alta limpia del PMS probada en QA local para Aurora y Brisa; publicación y aceptación pendientes. |
| H04 · P1 | Implementar selector, permisos y contexto del servidor. | Técnico | En curso; verificados en panel y PMS de QA local; aceptación remota pendiente. |
| H05 · P1 | Separar archivos, colas, cachés, tareas e integraciones. | Técnico | Pendiente; H03. |
| H06 · P1 | Probar aislamiento con dos hoteles y sesiones cruzadas. | Técnico | En curso; panel y dos PMS probados localmente; aceptación remota y otros circuitos pendientes. |
| H07 · P1 | Ensayar alta, exportación y baja documentadas. | Técnico y Administración | Pendiente; H06. |
| H08 · P2 | Medir costos y preparar piloto comercial adicional. | Marcelo y equipo | Pendiente; H06 y H07. |
| I01 · P1 | Auditar estado real del asistente en Xenia. | Técnico | Pendiente; código revisado, retomar después del enlace de identidad multihotel. |
| I02 · P1 | Validar presupuesto US$1, concurrencia e incertidumbre. | Técnico | Pendiente; I01. |
| I03 · P1 | Validar aprobaciones, bandeja y correo de Marcelo. | Técnico y Marcelo | Pendiente; I01. |
| I04 · P1 | Evaluar calidad con casos reales anonimizados. | Marcelo y colaboradores | Pendiente; I02 e I03. |
| I05 · P1 | Habilitar piloto acotado en Xenia y medir resultado. | Marcelo y técnico | Pendiente; I04 y publicación revisada. |
| I06 · P2 | Llevar módulo validado a Maran con permisos y límites. | Marcelo y técnico | Pendiente; I05 y aceptación del hotel. |
| I07 · P1 | Preparar consultas de diagnóstico de solo lectura por hotel y usuario. | Técnico | Pendiente; I01, permisos y casos de prueba. |
| I08 · P1 | Implementar controles contables con hallazgos y evidencia, sin modificar operaciones. | Técnico y revisión contable | Pendiente; I07 y reglas de conciliación revisadas. |
| I09 · P1 | Implementar vigilancia de ARCA y Boletín Oficial con fuentes, vigencia y aprobación. | Técnico y revisión fiscal | Pendiente; fuentes verificadas, perfil fiscal e integración con el presupuesto. |

# 15. Decisiones pendientes y próximos pasos

## 15.1 Decisiones concretas

| Decisión | Información necesaria | Quién resuelve |
|---|---|---|
| Administración de los dominios adquiridos | Confirmar titular, vencimientos, renovación y recuperación en Donweb. Principal y alternativas ya identificados. | Marcelo. |
| Cuenta empresarial y responsables de infraestructura | Titularidad, accesos recuperables y reemplazos. | Marcelo e infraestructura. |
| Base técnica y orden de integración | Matriz funcional y dependencias, no sólo conteos de commits. | Técnico con Marcelo. |
| Objetivos de recuperación y soporte | Impacto aceptable, costo del servicio y resultado del ensayo. | Marcelo, hotel e infraestructura. |
| Versión y fecha de apertura | Aceptación de circuitos, incidentes y contingencia. | Marcelo y referentes. |
| Alcance y precios comerciales | Módulos reales, costos medidos, soporte y condiciones legales. | Marcelo. |

## 15.2 Primer paquete de ejecución

**Ya realizado:** relevamiento inicial, revisión del piloto, compra de cuatro dominios, home comercial pública, buzón de contacto probado y primera entrega del panel multihotel con aceptación manual. Las evidencias y sus límites están resumidos en la sección 2.4.

**Siguiente trabajo:** preparar el arranque reproducible de un PMS ficticio para Aurora, conservar las verificaciones recientes de sesión de la base estable y definir el enlace entre identidad central y usuario local. Después se ensaya Brisa y se completa la integración por módulos. Los esquemas de las actuales reservas de demostración y del PMS operativo requieren una transición explícita.

**Direcciones actuales:** web comercial en [xeniapms.com](https://xeniapms.com) y panel central en [app.xeniapms.com](https://app.xeniapms.com). El buzón `contacto@xeniapms.com` está activo según la prueba de Marcelo. La dirección privada inicial se conserva como referencia histórica en los anexos de preparación.

**Próximo hito del producto:** desde el selector central, abrir una instalación completa del PMS de Aurora con datos ficticios, identidad local y permisos revisados. Las direcciones propuestas de QA se crean cuando el código y su configuración estén preparados. La incorporación de Maran requiere sus propios ensayos de continuidad, recuperación y aceptación operativa.

# 16. Fuentes, alcance y mantenimiento del plan

Se incorporaron las decisiones de esta conversación, la propuesta pegada por Marcelo y el relevamiento del repositorio del 16 de noviembre de 2026. La recomendación previa aportada por Replit se tomó como estrategia; los detalles verificados se contrastaron con código actualizado.

Referencias de código:

- Repositorio: [marcesvetliza-ui/maran-pms](https://github.com/marcesvetliza-ui/maran-pms).
- Base consultada: [revisión 494a59cd](https://github.com/marcesvetliza-ui/maran-pms/commit/494a59cd39ea84ba0d6fcad56f3d30d8d0c43315).
- Archivos revisados: `server/db.ts`, `shared/schema.ts`, `client/src/App.tsx`, `client/src/components/app-sidebar.tsx` y automatizaciones de `.github/workflows/`.
- Xenia: `feature/xenia-channex-staging` en `0bf36df28b1f77e28e247cb44581da6775a5e713`.
- Piloto: `advance/assistant-pilot-20261114` en `63b34fcc6d3e3bc94d04c8e71a76d48102625ebe`.
- Evidencia de esta etapa: `docs/xenia/evidencia/inventario-2026-11-16.json` y `docs/xenia/ESTADO_EJECUCION.md`.

Las referencias son una fotografía con fecha: no fijan lo que Railway sirve indefinidamente ni impiden que el equipo siga corrigiendo Maran. Antes de integrar o publicar, se revisará la versión vigente y se conservarán los cambios posteriores.

Este plan se actualizará por hitos. Cada revisión anotará qué cambió, qué se verificó y qué queda pendiente; el tablero operativo tendrá la fecha del último resultado. No contiene secretos, datos de huéspedes ni instrucciones para modificar manualmente operaciones fiscales.
