# Prefactura: respuesta HTML de gateway y resultado incierto

La captura posterior al despliegue contiene una página HTML de Cloudflare 504, con Browser y Cloudflare funcionando y Host en error. Marca temporal: 2026-10-29 11:47:06 UTC (08:47:06 de Argentina). El usuario confirma que las otras pantallas siguen funcionando.

Esto demuestra un timeout de esa solicitud, no el estado fiscal final ni que no se haya registrado un cobro. No permite distinguir bloqueo de base, espera de pool, servicio externo o interrupción del proceso. No es prueba de que haya fallado la consulta del último número ARCA corregida anteriormente.

## Cambio acotado

La capa HTTP conserva el estado original, pero reemplaza las respuestas HTML de error por un mensaje legible. parseApiError también maneja HTML de errores previos o encapsulado en JSON. Los JSON de validación/advertencias normales se conservan sin modificar.

La recuperación financiera no se cambia: un 504 conserva el snapshot de factura, importes, métodos y claves originales de pago. No se envía un cobro después de un error de emisión ni se borra el intento para empezar de nuevo.

## Validación

848 pruebas cliente (157 archivos), TypeScript y compilación cliente/servidor aprobados. Incluye HTML de 502/503/504/524, consultas, mensajes previos, JSON estructurados y persistencia/reapertura del intento frente a un 504. Sin acceso a ARCA ni base operativa.

## Investigación operativa pendiente

Consultar Deploy Logs del servicio PMS de Maran alrededor de 11:47 UTC y correlacionar con la solicitud de facturación: inicio/fin de petición, errores SQL/pool/bloqueos, WSAA/WSFE y posibles reinicios. Revisar la operación y su comprobante persistidos antes de reintentar. No atribuir el 504 a una causa sin esos datos ni tratar la mejora del mensaje como solución de la espera del servidor.
