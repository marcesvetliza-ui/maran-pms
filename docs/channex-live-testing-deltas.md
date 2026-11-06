# Channex: preparación para live testing, 06/11/2026

Channex informó al usuario que todos los tests de certificación pasaron, con observaciones sobre deltas de campos, mínimos de estadía y rangos. Solicitó un nuevo video: reserva PMS de una noche, traslado siete días después y Full Sync de dos llamadas. La aprobación de producción sigue pendiente.

## Ajuste

- Outbox agrega `changed_fields text[]` nullable de forma aditiva. Los triggers del calendario comparan OLD/NEW y agrupan fechas contiguas con el mismo conjunto de campos modificados. Las modificaciones de tarifa base conservando categoría, moneda y vigencia registran sólo `rate`.
- Dispatcher construye valores absolutos por campo modificado, contrasta con lo publicado y comprime la salida parcial. Las restricciones/precios no editados no rompen secuencias de deltas iguales. Conserva el formato de rangos `date_from`/`date_to`, sin inventar nuevas propiedades del protocolo.
- La caché de publicación combina sólo los campos enviados después de éxito. No considera publicada información que no viajó. En fallo se conservan máscaras y último estado confirmado; los reintentos recomputan valores absolutos actuales.
- Eventos anteriores sin máscara mantienen comparación de campos contra su última publicación; un destino sin baseline puede requerir el estado completo. Full Sync siempre publica todo, aunque no haya diferencias.
- Planes mapeados a Channex: editar cualquiera de los mínimos actualiza ambos y se ve en preview; valores explícitos contradictorios se rechazan. Los planes sin mapeo conservan mínimos independientes. Preview y apply normalizan de la misma forma y conservan el token de revisión.
- Los históricos desiguales no se reescriben automáticamente. Para el envío de estos datos se toma Arrival como referencia y se publica el mismo valor en Through, incluida recuperación completa. Los cambios nuevos de mínimos persisten ambos iguales.
- Se mantienen staging-only, limitador, reintentos, cola transaccional, horizonte móvil de 500 días, eventos explícitos futuros, límite de Full Sync de 24 horas y dos clases de llamada. No se ejecuta Full Sync automáticamente por este parche.

## Verificación

PostgreSQL local aislado: captura de máscaras, mínimos por plan, preview/apply, rollback, errores y reintentos, delta sin baseline, separación de campos entre planes, rangos contiguos, precios decimales, borrado de overrides, disponibilidad de reserva de una noche/traslado de una semana, Full Sync de exactamente dos llamadas cubriendo 500 días, límite de 24 horas, staging y horizontes.

Unitarias: payload exacto sin campos adicionales, false/zero, pares de mínimos, compresión con gaps/cambios, transporte, calendario y permisos. No hay llamadas reales a Channex desde estas pruebas. La nueva grabación y sus logs remotos siguen pendientes.

La documentación oficial de rangos no pudo consultarse desde este entorno (403). Se conserva el formato de intervalos ya utilizado y aceptado en los tests del proveedor; no se afirma haber validado un campo literal `date_range` nuevo.
