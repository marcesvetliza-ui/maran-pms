# Estado de ejecución de Xenia y continuidad de Maran

Actualización: 20 de noviembre de 2026. Frentes activos: **continuidad de Maran; registro de aceptación de Alojamiento en Aurora y Brisa; respaldos y recuperación de Xenia**. Se conserva la evidencia histórica de las entregas anteriores.

## Primer hito: panel multihotel probado

Marcelo confirmó el ingreso remoto a `app.xeniapms.com`, dos establecimientos activos y las pruebas de reservas y perfiles. Aurora y Brisa conservan reservas distintas después de recargar. Responsable opera ambos; recepción sólo Aurora; consulta sólo Brisa sin escritura. Los tres perfiles de prueba no acceden a la administración central.

El panel usa un servicio independiente y tres bases nuevas en `observant-possibility`. La [PR 119](https://github.com/marcesvetliza-ui/maran-pms/pull/119) conserva el código de esta entrega, sus 24 pruebas PostgreSQL/HTTP y las verificaciones de navegador y Docker. Sigue en borrador, sin integrarse en Maran. El [acta](https://github.com/marcesvetliza-ui/maran-pms/blob/feat/xenia-multihotel-foundation-20261117/docs/xenia/evidencia/multihotel-aceptacion-2026-11-17.json) identifica lo probado por el propietario y lo pendiente.

La web comercial ya está pública en `xeniapms.com`; Marcelo confirmó las redirecciones de `.store` y `.online` y la recepción y respuesta de `contacto@xeniapms.com`. El registro de `.com.ar` seguía pendiente en el último estado comunicado. La comprobación externa de salud, la revisión exacta servida y la recuperación remota no están cerradas.

## Paso 2 implementado en revisión

La [PR 130](https://github.com/marcesvetliza-ui/maran-pms/pull/130), en la rama `feat/xenia-pms-integration-20261118`, conecta los PMS ficticios de Aurora y Brisa con el panel. Conserva la primera entrega y las correcciones de `main` hasta `8a6e98cb`, sin fusionar ni publicar en Maran. Marcelo informó que el panel tiene buena salud; la revisión remota exacta sigue pendiente de registrar.

El paquete agrega preparación limpia de bases operativas nuevas, ingreso central con códigos de un uso y sesiones locales, permisos comprobados por el servidor, ficha privada de variables y marca/contexto visibles. Se verificaron localmente dos PMS compilados por HTTPS, planning, creación desde el formulario real, edición, consulta sin escritura, revocación y cierre central. GitHub aprobó las cinco verificaciones del código `73f85093`: PMS aislado, fundamentos multihotel, suite general con PostgreSQL, fechas y workflows. Incluyen la construcción de ambas imágenes. La [evidencia de la entrega](evidencia/pms-qa-2026-11-18.json) registra los resultados y sus límites.

La [ficha con el paso a paso de Railway y Donweb](https://github.com/marcesvetliza-ui/maran-pms/blob/feat/xenia-pms-integration-20261118/docs/xenia/PASO_2_PUBLICAR_PMS_AURORA.md) contiene los nombres, comandos, puerto, variables y dominios reales previstos. El orden de publicación es: actualizar sólo Xenia-Control; generar la ficha de Aurora; crear su base operativa y servicio nuevos; conectar su dominio; aceptar Aurora; repetir con Brisa.

## Corrección de la ficha de Railway, 18 de noviembre

La captura de Settings aportada por Marcelo informa la retirada de Config as Code el 1 de diciembre y la imposibilidad de activarlo en servicios que no lo usaban. La guía de publicación versión 2 utiliza ajustes manuales: `RAILWAY_DOCKERFILE_PATH` en Variables y los comandos de preparación, arranque y salud en Settings → Deploy. Se deja Railway Config File sin ruta personalizada. Esto corrige los puntos 2.5 y 5 de la guía; no cambia el código probado ni administra servicios desde esta conversación.

## Edición de reservas: corrección preparada el 19 de noviembre

Marcelo confirmó que pudo crear una reserva en Aurora y moverla de habitación. Informó que no pudo editar fechas, tarifas ni consumos. La revisión del código encontró dos omisiones de QA: faltaba el permiso de edición de alojamiento y el filtro bloqueaba su consulta y las rutas de revisión y confirmación de precios por noche. Los consumos continúan fuera del alcance habilitado de esta entrega.

La [PR 146](https://github.com/marcesvetliza-ui/maran-pms/pull/146), revisión `f5005dc7`, corrige la edición en las instalaciones existentes y añade un aviso sobre los circuitos pendientes. Se probaron actualización sin borrar datos, conservación de revocaciones, edición desde el navegador de fechas, tarifas y observaciones, persistencia al recargar, consulta sin escritura e aislamiento. Las cuatro verificaciones de GitHub y ambas imágenes de despliegue aprobaron. La publicación en los servicios **xenia-aurora-pms** y **xenia-brisa-pms** y su aceptación con la reserva existente siguen pendientes. Se conserva la ficha de cada instalación; el comando de preparación incorpora el permiso una sola vez. El [acta de esta corrección](evidencia/pms-edicion-2026-11-19.json) distingue el código probado del servicio publicado.

## Alojamiento aceptado por el propietario y recuperación preparada

Después de la corrección de edición, Marcelo confirmó «Perfecto todo». Luego respondió «Si anda bien» a la prueba de reservas separadas entre Aurora y Brisa, recepción exclusiva de Aurora y consulta de Brisa sin escritura. La [acta de aceptación funcional](evidencia/pms-aceptacion-funcional-2026-11-19.json) registra esas confirmaciones. Se avanza al respaldo y recuperación de Xenia. Permanecen pendientes las revisiones exactas instaladas, la comprobación específica de revocación y cierre central remotos y los demás circuitos operativos.

La [guía del paso 3](PASO_3_RESPALDOS_Y_RESTAURACION_XENIA.md) distingue la base central, las dos de demostración del panel y las dos operativas de los PMS de prueba. Conserva el registro de las cinco copias y el ensayo en una base nueva. El apartado del 20 de noviembre distingue la restauración de volumen de la recuperación PITR efectivamente realizada por el propietario.

Se ejecutó un [ensayo lógico local](evidencia/recuperacion-local-2026-11-19.json) de exportación y restauración de un PMS ficticio con PostgreSQL 17: igualdad de todas las filas y secuencias, relaciones de reserva, fechas, precios, observaciones, identidad y conservación de un cambio posterior del origen. Es evidencia local; no cierra la recuperación remota ni el arranque de una aplicación restaurada.

## Antecedente de publicación del 19 de noviembre

Marcelo confirmó el ingreso al PMS de Aurora y comunicó que Brisa continúa validando su DNS. La [evidencia del 19 de noviembre](evidencia/pms-publicacion-2026-11-19.json) registra el ingreso como prueba manual del propietario; las consultas DNS/HTTPS desde este entorno no pudieron resolver los tres dominios y no permiten concluir que estén caídos. El SHA servido por cada servicio sigue sin registrar.

La [PR 139](https://github.com/marcesvetliza-ui/maran-pms/pull/139), revisión `e6551f02`, corrige la ficha para **Hotel brisa** sin depender de su identificador textual. Las cuatro verificaciones de GitHub aprobaron las pruebas y las imágenes. La [guía corregida](https://github.com/marcesvetliza-ui/maran-pms/blob/fix/xenia-brisa-pms-connection-20261118/docs/xenia/PASO_2_PUBLICAR_PMS_AURORA.md) conserva los ajustes manuales de Railway y la selección de la plantilla Brisa.

## Cinco respaldos y recuperación PITR de Aurora, 20 de noviembre

Marcelo confirmó «Sí, las cinco están terminadas» para las bases central, Aurora y Brisa del panel y Aurora y Brisa de los PMS completos. Se registra como confirmación del propietario; los IDs, horarios con zona confirmada, retención y despliegues asociados todavía no fueron aportados al acta. La [evidencia del reporte](evidencia/respaldos-reportados-2026-11-20.json) conserva esos campos pendientes y distingue la creación del destino de la validación de sus datos.

Se contrastó la documentación oficial de Railway: [restaurar una copia de volumen](https://docs.railway.com/volumes/backups) vuelve a montar la copia en el servicio existente; [PITR](https://docs.railway.com/volumes/point-in-time-recovery) recupera el punto elegido en un servicio nuevo. La primera captura de Aurora muestra una copia manual del 20 de noviembre a las 08:32, de 872 MB, PITR desactivado y ninguna programación de copias de volumen visible.

Marcelo activó PITR en Aurora de pruebas. Una captura intermedia mostró la espera del primer respaldo y los archivos de cambios. Después realizó la recuperación: la captura con reloj 10:22 muestra **xenia-aurora-restore-db Online**, **xenia-aurora-pms-db Online** y **xenia-aurora-pms Online**, con el enlace del PMS a la base original visible. Se registra la recuperación PITR en un servicio independiente; el punto elegido y la validación integral de los datos del destino siguen pendientes. Este resultado no acredita la restauración de las cinco copias manuales ni un flujo operativo desde una aplicación recuperada.

Las cinco capturas posteriores de la tabla **reservations** muestran la reserva **RES-1795097940326-24** del 20 al 24 de noviembre, cuatro noches y total **300.000**. El detalle contiene tres noches de 50.000 y una de 150.000, sin descuento; la suma y el promedio de 75.000 coinciden con los importes almacenados. Se observan el identificador de huésped y **room_id xenia-qa-room-103**, pero todavía no se consultaron esas filas relacionadas ni las observaciones. La captura posterior del Folio en el PMS original de Aurora muestra el mismo código, ingreso, egreso, cuatro noches, detalle de tarifas, total **ARS 300.000** y estado confirmado. También muestra **Habitación 103** y **Huesped Prueba**. Marcelo confirmó después «si perfecto» a la comprobación de habitación 103, huésped Huesped Prueba y observaciones en la copia. Queda aceptada la muestra manual de esa reserva; siguen pendientes el punto exacto de PITR, la identidad de instalación, el conjunto completo de datos y la prueba de operación de una aplicación sobre el destino.

La [guía del paso 3](PASO_3_RESPALDOS_Y_RESTAURACION_XENIA.md), versión 4, conserva la comprobación de la muestra e indica cómo abrir la base recuperada en modo lectura y comprobar reservas, habitación, huésped, precios, observaciones e identidad. Las acciones remotas de Railway fueron realizadas por Marcelo. El asistente no modificó servicios, volúmenes, conexiones o datos remotos. Maran continúa fuera del ensayo.

## Ensayo operativo sobre la copia de Aurora preparado

Se preparó el [paso 3.1](PASO_3_1_PROBAR_PMS_SOBRE_COPIA_AURORA.md): registrar salud, revisión e identidad actuales; conectar temporalmente **xenia-aurora-pms** a **xenia-aurora-restore-db**; comprobar ingreso, una reserva de prueba y permisos; y volver a **xenia-aurora-pms-db**. Usa el mismo servicio y origen QA, sin una segunda aplicación pública con la identidad de Aurora. La preparación valida identidad y esquema; /healthz consulta la identidad de la base conectada.

El procedimiento es una preparación y todavía no se ejecutó el cambio de conexión. Conserva la revisión, ficha, dominio, configuración central y demás servicios. El acceso público de salud no fue consultable mediante la herramienta web; se pidió a Marcelo el resultado de Aurora para registrar la versión previa. Esa limitación de lectura no prueba una caída.

## Próximos hitos

1. Registrar los despliegues activos y las revisiones servidas de panel, Aurora y Brisa.
2. Completar las referencias de las cinco copias confirmadas por Marcelo, la configuración recuperable y el momento PITR seleccionado.
3. Completar los controles del conjunto de datos recuperado y ejecutar el paso 3.1, con salud, ingreso central, reserva, permisos y regreso confirmado a la conexión original de Aurora QA.
4. Comprobar específicamente revocación y cierre central remotos, ensayar actualización independiente y resolver continuidad ante una caída central antes de incorporar un hotel en uso.
5. Incorporar los demás circuitos por módulo. El asistente continúa después de esta base.

El modo QA verifica el acceso central en cada API y bloquea temporalmente las operaciones si el panel no responde. Caja, fiscalidad, correo, OTAs, IA, check-in y checkout no están habilitados en este ensayo. Las reservas de demostración del panel se conservan separadas de las del PMS; no hay una migración de esos datos.

## Completado en esta etapa

- Se creó el checkout aislado `plan/xenia-product-multihotel-20261116` y se actualizó por avance rápido a `494a59cd39ea84ba0d6fcad56f3d30d8d0c43315`, que incorpora la PR 112.
- Se consultaron las referencias remotas de Maran, Xenia y el piloto; se guardaron revisiones, ancestro común y estadísticas en `evidencia/inventario-2026-11-16.json`.
- La comparación Maran/Xenia muestra 116 y 190 commits exclusivos, respectivamente, y diferencias en 530 archivos. Son métricas de historial, no un diagnóstico de integridad funcional.
- Se revisaron inicialmente conexión de base, esquema, identificadores del navegador, identidad visual y automatizaciones de publicación.
- Se elaboró el plan maestro con arquitectura, apertura de Maran, dominio y web, integración, multihotel, recuperación, piloto y 53 tareas.
- Se preparó una matriz automática de diferencias por área como insumo del análisis funcional. **No acredita que una corrección esté completa o falte.**

## Lecturas que quedaron limitadas

Las consultas públicas a `maranpms.com.ar` y `demo.maranpms.com.ar` fallaron en la resolución DNS desde este entorno, incluso después de solicitar acceso de red en la ejecución. Se registró `gaierror`. Esto no demuestra una caída pública: falta contraste desde otra conexión o herramienta autorizada.

Hay presencia de `RAILWAY_TOKEN`; no hay presencia de `RAILWAY_XENIA_TOKEN` en este entorno. No se leyeron ni guardaron valores de secretos. El acceso de otro chat no se da por compartido automáticamente.

Las direcciones observadas en workflows no prueban por sí solas la rama realmente vinculada, la revisión servida ni la separación de bases y servicios. Esas verificaciones pertenecen a A04 y A05.

## Paquete previsto en el corte inicial del 16 de noviembre

1. Revisar con Marcelo la home comercial privada y completar el contacto real y el destino de acceso al PMS.
2. Preparar la conexión de `xeniapms.com` y las redirecciones de sus tres dominios alternativos desde Donweb, con valores reales del alojamiento.
3. Completar el inventario y la matriz del producto común conservando los arreglos recientes de Maran.
4. Continuar la aceptación operativa, la cobertura y la recuperación de Maran en paralelo.
5. Retomar el asistente después de esta primera base de marca y web.

## Continuación de soporte y control con IA

Marcelo confirmó que hoy concentra los roles de dirección, técnica, infraestructura, revisión fiscal y contable y soporte. La versión 1.1 del plan incorpora esta organización, la IA como primera línea una vez validada y tres tareas adicionales para lectura operativa, control contable y vigilancia normativa: el tablero pasa de 53 a 56 tareas.

Se realizó la primera revisión de código del piloto en `63b34fcc`. Hay chat con capturas, presupuesto persistido, avisos y revisión de propuestas. El alcance actual excluye movimientos reales del hotel y ARCA; las nuevas capacidades requieren herramientas de lectura y seguimiento específicas. El presupuesto predeterminado no demuestra el presupuesto efectivo de una base ya inicializada.

La nueva consulta de referencias remotas encontró `main` en `1aa45fb9`, con PR 113 y PR 114. Se conserva ese corte en una evidencia separada del inventario inicial. Las consultas públicas siguieron fallando por resolución DNS local. El estado del entorno confirmó únicamente un secreto del proyecto Maran; sigue pendiente el acceso de Railway de Xenia.

Se preparó un catálogo de fuentes oficiales y cinco casos anonimizados para aceptar el soporte. El catálogo es documentación de preparación: no se activó vigilancia periódica, acceso a datos reales ni gasto de IA. Los controles automáticos y el chat compartirán el techo de US$1 diario cuando se implementen.

Se verificaron 18 pruebas existentes de chat, límites y avisos con proveedores simulados. Pasaron las 18, sin llamadas pagas ni envíos reales. Las verificaciones del servicio publicado, persistencia y entrega real siguen pendientes.

## Continuación de marca y home

Marcelo priorizó la marca y la home antes del asistente. Confirmó la compra de `xeniapms.com`, `xeniapms.com.ar`, `xeniapms.store` y `xeniapms.online` en Donweb. El plan pasa a versión 1.2; se conserva el tablero de 56 tareas y se actualizan registro y primera entrega web.

Se confirmó el acceso al código de Xenia por GitHub y se encontraron sus tres logos originales. Se preparó y publicó una home privada en https://xenia-pms-home.chalky-yak-9675.chatgpt.site, con datos ficticios y contacto propuesto pendiente de activar. No fue necesario acceso de Railway para este trabajo.

Se verificaron controles y disposición responsive en cinco anchos de pantalla. El código quedó preparado para una rama separada de GitHub, sin fusionar a `main`. La publicación privada fue confirmada por el alojamiento. No se modificaron los DNS de los dominios comprados ni la aplicación de Maran.

## Preparación de la conexión en Donweb

Marcelo aceptó la propuesta de diseño. Se dieron de alta los nombres `xeniapms.com` y `www.xeniapms.com` en la configuración del alojamiento de la home. Se guardaron los dos destinos A, el CNAME y cuatro TXT de validación devueltos por el proveedor, con evidencia de estado pendiente.

Se preparó el anexo operativo con los valores exactos y el recorrido de gestión de Donweb contrastado con su documentación. Falta la carga en la zona DNS de la cuenta de Marcelo, la validación externa y el certificado. El correo sigue siendo provisional. No se cambió el acceso privado de la home, no se configuraron redirecciones en Donweb y no se contrataron servicios de correo.

## Alcance de los cambios de planificación

La rama de planificación cambia archivos de `docs/xenia/`: documentación, evidencias y una herramienta de lectura. La home y el panel tienen ramas separadas. La home pasó a publicación pública con autorización de Marcelo y éste cargó los registros DNS y configuró el servicio del panel desde sus cuentas. Durante estas entregas no se modificaron código operativo, datos, numeradores, cobros ni configuración de producción de Maran. Las ramas de planificación y multihotel no se fusionan con `main` como parte de esta actualización.

## Cómo actualizar la evidencia

Desde el checkout elegido, actualizar primero las referencias remotas por el procedimiento habitual y ejecutar:

```bash
python docs/xenia/relevar_entorno.py --output docs/xenia/evidencia/inventario-AAAA-MM-DD.json
```

El script lee referencias locales y salud pública. No consulta tablas de huéspedes ni administra servicios. La ejecución guarda la fecha exacta y debe conservarse como nueva evidencia cuando cambie el día o el hito.
