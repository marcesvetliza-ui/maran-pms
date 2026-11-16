# Estado de ejecución de Xenia y continuidad de Maran

Fecha: 16 de noviembre de 2026. Frentes activos: **relevamiento y preparación de Maran; marca y home de Xenia**.

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

## Próximo paquete

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

## Alcance de los cambios realizados

La rama de planificación cambia archivos de `docs/xenia/`: documentación, evidencias y una herramienta de lectura. La home se preparó en un proyecto estático separado y se conserva en otra rama de GitHub bajo `web/xenia/`. La publicación de la home es privada e independiente. No se modificó código operativo de Maran, datos, numeradores, comprobantes, cobros, configuración de producción, DNS ni publicación automática del PMS. Ninguna de estas ramas se fusiona con `main` como parte de esta entrega.

## Cómo actualizar la evidencia

Desde el checkout elegido, actualizar primero las referencias remotas por el procedimiento habitual y ejecutar:

```bash
python docs/xenia/relevar_entorno.py --output docs/xenia/evidencia/inventario-AAAA-MM-DD.json
```

El script lee referencias locales y salud pública. No consulta tablas de huéspedes ni administra servicios. La ejecución guarda la fecha exacta y debe conservarse como nueva evidencia cuando cambie el día o el hito.
