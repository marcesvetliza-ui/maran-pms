# Verificación remota de horas operativas

Fecha de ejecución: 4 de septiembre de 2026.

## Objetivo

Confirmar en un navegador cuya zona horaria no es argentina que las horas
operativas se muestran en `America/Argentina/Buenos_Aires`.

## Entorno y método

- Navegador remoto: Chromium/Playwright.
- Zona horaria del contexto: `America/Los_Angeles`.
- Zona horaria confirmada en JavaScript con
  `Intl.DateTimeFormat().resolvedOptions().timeZone`.
- Sesión autenticada con un usuario administrador del entorno de desarrollo.
- Cada valor esperado se calculó desde el timestamp ISO devuelto por la API,
  usando `Intl.DateTimeFormat("es-AR", { timeZone:
  "America/Argentina/Buenos_Aires" })`.
- Los datos temporales usados para probar el folio cerrado y su PDF se
  eliminaron al terminar.

## Resultado

| Categoría | Ruta / vista | Timestamp ISO | Esperado en Buenos Aires | Visible | Resultado |
| --- | --- | --- | --- | --- | --- |
| Historial | `/cash-register`, Historial de ejecuciones | `2026-09-03T22:46:08.991Z` | `03/09/2026 19:46` | `03/09/2026 19:46` | Pasa |
| Auditoría | `/administration`, Registro de Auditoría | `2026-09-04T00:11:34.703Z` | `03/09/2026 21:11:34` | `03/09/2026 21:11:34` | Pasa |
| Cierre, apertura | `/admin/folios`, FolioViewer | `2026-09-04T03:30:00.000Z` | `04/09/2026 00:30` | `Abierto 04/09/26 00:30` | Pasa |
| Cierre, cierre | `/admin/folios`, FolioViewer | `2026-09-04T04:45:00.000Z` | `04/09/2026 01:45` | `Cerrado 04/09/26 01:45` | Pasa |
| Cierre, movimiento | `/admin/folios`, FolioViewer | `2026-09-04T04:00:00.000Z` | `04/09/2026 01:00` | `04/09/26 01:00` | Pasa |
| Impresión | PDF del mismo folio | `2026-09-04T04:00:00.000Z` | `04/09/2026 01:00` | `04/09/2026 01:00` | Pasa |

Las diferencias de formato de año de cuatro a dos dígitos en FolioViewer son
intencionales. Día, mes, hora y minutos coinciden con Buenos Aires en todos los
casos. La auditoría también coincide en segundos.

## Evidencia visual

Las capturas quedaron asociadas a la ejecución remota con estos identificadores:

- `gmmjmc`: Historial de ejecuciones con `03/09/2026 19:46`.
- `59wkti`: Registro de Auditoría con `03/09/2026 21:11:34`.
- `6xv323`: FolioViewer con apertura, cierre y movimiento.
- `681zi7`: PDF renderizado con el movimiento `04/09/2026 01:00`.

## Fixture y limpieza

El entorno no tenía folios cerrados ni turnos cerrados disponibles. Para cubrir
la vista de cierre y la impresión sin modificar una operación real, se creó un
folio técnico aislado con prefijo `TEST-TZ-`, un movimiento y timestamps
controlados. Después de capturar y comparar la vista y el PDF se eliminaron
primero sus movimientos y luego el folio. Las consultas posteriores confirmaron
cero filas residuales para ambos.

## Conclusión

Con el navegador operando en `America/Los_Angeles`, los historiales, cierres,
auditorías e impresiones representativas mostraron las horas correspondientes a
`America/Argentina/Buenos_Aires`. No se detectaron discrepancias que requieran
cambios de código.