# Estado de ejecución de Xenia y continuidad de Maran

Actualización: 18 de noviembre de 2026. Frentes activos: **continuidad de Maran; enlace del panel multihotel con una instalación completa del PMS de pruebas**. Los apartados iniciales conservan la evidencia histórica del 16 de noviembre.

## Hito vigente: panel multihotel probado

Marcelo confirmó el ingreso remoto a `app.xeniapms.com`, dos establecimientos activos y las pruebas de reservas y perfiles. Aurora y Brisa conservan reservas distintas después de recargar. Responsable opera ambos; recepción sólo Aurora; consulta sólo Brisa sin escritura. Los tres perfiles de prueba no acceden a la administración central.

El panel usa un servicio independiente y tres bases nuevas en `observant-possibility`. La [PR 119](https://github.com/marcesvetliza-ui/maran-pms/pull/119) conserva el código de esta entrega, sus 24 pruebas PostgreSQL/HTTP y las verificaciones de navegador y Docker. Sigue en borrador, sin integrarse en Maran. El [acta](https://github.com/marcesvetliza-ui/maran-pms/blob/feat/xenia-multihotel-foundation-20261117/docs/xenia/evidencia/multihotel-aceptacion-2026-11-17.json) identifica lo probado por el propietario y lo pendiente.

La web comercial ya está pública en `xeniapms.com`; Marcelo confirmó las redirecciones de `.store` y `.online` y la recepción y respuesta de `contacto@xeniapms.com`. El registro de `.com.ar` seguía pendiente en el último estado comunicado. La comprobación externa de salud, la revisión exacta servida y la recuperación remota no están cerradas.

## Paso 2 implementado en revisión

La [PR 130](https://github.com/marcesvetliza-ui/maran-pms/pull/130), en la rama `feat/xenia-pms-integration-20261118`, conecta los PMS ficticios de Aurora y Brisa con el panel. Conserva la primera entrega y las correcciones de `main` hasta `8a6e98cb`, sin fusionar ni publicar en Maran. Marcelo informó que el panel tiene buena salud; la revisión remota exacta sigue pendiente de registrar.

El paquete agrega preparación limpia de bases operativas nuevas, ingreso central con códigos de un uso y sesiones locales, permisos comprobados por el servidor, ficha privada de variables y marca/contexto visibles. Se verificaron localmente dos PMS compilados por HTTPS, planning, creación desde el formulario real, edición, consulta sin escritura, revocación y cierre central. GitHub ejecuta las verificaciones del paquete, incluida la construcción de imágenes, antes de publicarlo.

La [ficha con el paso a paso de Railway y Donweb](https://github.com/marcesvetliza-ui/maran-pms/blob/feat/xenia-pms-integration-20261118/docs/xenia/PASO_2_PUBLICAR_PMS_AURORA.md) contiene los nombres, comandos, puerto, variables y dominios reales previstos. El orden de publicación es: actualizar sólo Xenia-Control; generar la ficha de Aurora; crear su base operativa y servicio nuevos; conectar su dominio; aceptar Aurora; repetir con Brisa.

## Próximos hitos

1. Completar los controles automáticos de la PR 130 y publicar el paquete de pruebas siguiendo su ficha.
2. Aceptar los PMS en Railway con Marcelo y registrar la revisión servida de cada servicio.
3. Ensayar actualización independiente y restauración, y resolver continuidad ante una caída central antes de incorporar un hotel en uso.
4. Incorporar los demás circuitos por módulo. El asistente continúa después de esta base.

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
