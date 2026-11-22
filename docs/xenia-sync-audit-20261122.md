# Revisión de sincronización Maran / Xenia — 22/11/2026

Se consultó `/api/health` de ambos sitios y se comparó el código exacto de las revisiones informadas. Ambos respondieron correctamente. Tener un sitio disponible no implica tener las mismas funcionalidades.

| Sitio | Rama publicada | Revisión |
| --- | --- | --- |
| Maran | `main` | `ac7f256f8b5b29a729cbd5201ed8917b586e6a76` |
| Xenia (`demo.maranpms.com.ar`) | `feature/xenia-support-approval-foundation` | `bc8e06b5a9042fdda3cf4fda2664527cb59c7e38` |

La revisión de Xenia coincide con la punta de su rama publicada. No corresponde compararla únicamente con la antigua rama `feature/xenia-channex-staging`: esa rama no identifica el despliegue actual.

La última sincronización integral identificada es del 15/11. Xenia recibió después cambios propios del asistente (entrega del 20/11 integrada el 21/11, PR 158). Esto no incorporó los cambios posteriores de `main`. El ancestro común es `476b8489256290c4eca71ee5d433e7b7604603ca`, del 15/11. `git cherry <revisión-Xenia> <revisión-Maran>` detecta 74 commits sin merge de Maran sin parche equivalente en Xenia; el número incluye pruebas y documentación y no representa 74 funcionalidades distintas.

## Cambios recientes solicitados que no están incorporados en Xenia

Se verificaron su ausencia en el historial publicado y diferencias en los archivos funcionales, no solo sus números de versión.

| Cambio | Commit de Maran |
| --- | --- |
| Encuestas por área y preguntas abiertas | `fe07d0e9` |
| Eliminación de preguntas de encuestas | `9b29bd72` |
| Primer acompañante en la confirmación PDF | `c35d6a08` |
| Recuperación de sesión/permisos y carga de versiones | `daa0da24` |
| Ver origen en check-out, catálogo por área y búsqueda de proveedores | `2cfb07dd` |
| Finalización de check-out posterior a reapertura | `fb72972b` |
| Precio de paquete según categoría cobrada durante un upgrade | `f6b27164` |
| Descargas PDF/Excel de seguimiento de cuentas corrientes | `4052f3a6` |
| Comparativa de noches realizadas por agencia | `ac7f256f` |

La publicación en Maran no actualiza automáticamente Xenia. La sincronización necesita una integración separada que conserve el asistente, sus controles y la configuración propia de Xenia, con pruebas y despliegue sobre su rama. Esta revisión no modifica datos operativos ni publica o cambia configuración en Xenia.
