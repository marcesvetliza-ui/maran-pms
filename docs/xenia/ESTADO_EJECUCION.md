# Estado de ejecución de Xenia y continuidad de Maran

Fecha: 16 de noviembre de 2026. Etapa activa: **0, relevamiento y preparación**.

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

1. Completar inventario de servicios, bases, archivos, correo, tareas, dominios e integraciones, con titular y responsable.
2. Completar matriz funcional, empezando por sesiones, facturación, Caja y cuentas corrientes; conservar los arreglos recientes de Maran.
3. Preparar datos ficticios y casos de aceptación para Recepción y Administración.
4. Confirmar con Marcelo el nombre exacto y titular del dominio para preparar una contratación concreta; todavía no se compra ni configura.
5. Asignar referentes de áreas, cobertura y objetivos de recuperación antes de la puesta en marcha oficial.

## Alcance de los cambios realizados

Todos los archivos de esta etapa están dentro de `docs/xenia/` y corresponden a documentación, evidencias y una herramienta de lectura. No se modificó código de la aplicación, datos operativos, numeradores, comprobantes, cobros, configuración de producción, DNS, proveedores ni publicación automática. No se fusiona esta rama con `main` como parte de la entrega del plan.

## Cómo actualizar la evidencia

Desde el checkout elegido, actualizar primero las referencias remotas por el procedimiento habitual y ejecutar:

```bash
python docs/xenia/relevar_entorno.py --output docs/xenia/evidencia/inventario-AAAA-MM-DD.json
```

El script lee referencias locales y salud pública. No consulta tablas de huéspedes ni administra servicios. La ejecución guarda la fecha exacta y debe conservarse como nueva evidencia cuando cambie el día o el hito.
