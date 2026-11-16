# Matriz inicial de diferencias por área

Fecha de corte: 16 de noviembre de 2026. Base: `494a59cd`. Referencias exactas en la evidencia JSON.

Esta clasificación automática cuenta rutas distintas, con una categoría por ruta. Un archivo puede afectar varias áreas; el orden de clasificación influye. **No sustituye la matriz funcional ni demuestra qué rama conserva una corrección.**

| Área | Rutas distintas Xenia | Rutas distintas piloto | Próxima comprobación |
|---|---:|---:|---|
| Asistente y soporte | 117 | 146 | Identificar comportamiento, dependencias y casos de aceptación. |
| Caja y cuentas corrientes | 40 | 25 | Identificar comportamiento, dependencias y casos de aceptación. |
| Channex y OTAs | 69 | 27 | Identificar comportamiento, dependencias y casos de aceptación. |
| Documentación | 11 | 17 | Identificar comportamiento, dependencias y casos de aceptación. |
| Esquema y persistencia | 8 | 6 | Identificar comportamiento, dependencias y casos de aceptación. |
| Facturación | 79 | 44 | Identificar comportamiento, dependencias y casos de aceptación. |
| Identidad y acceso | 13 | 12 | Identificar comportamiento, dependencias y casos de aceptación. |
| Otras áreas | 127 | 121 | Identificar comportamiento, dependencias y casos de aceptación. |
| Publicación y herramientas | 9 | 5 | Identificar comportamiento, dependencias y casos de aceptación. |
| Reservas y grupos | 47 | 11 | Identificar comportamiento, dependencias y casos de aceptación. |
| Restaurante y SPA | 10 | 8 | Identificar comportamiento, dependencias y casos de aceptación. |

## Referencias críticas revisadas inicialmente

- `server/db.ts`: conexión principal por instalación mediante `DATABASE_URL`.
- `shared/schema.ts`: sin alcance general multihotel detectado por nombres de hotel u organización.
- `client/src/App.tsx`: almacenamiento de punto de venta y comunicación de sesión que deben revisarse al introducir selección de hotel.
- `.github/workflows/xenia-revision.yml`: destino de revisión `demo.maranpms.com.ar`; la configuración de Railway sigue pendiente de contraste.

## Trabajo funcional pendiente

Para cada módulo: comportamiento actual de Maran, mejora de Xenia, dependencia de esquema/configuración, prueba, riesgo, estrategia de integración y responsable. Empezar por sesiones, facturación y cuentas corrientes. Las correcciones urgentes posteriores al corte se agregan antes de integrar.
