# Xenia actualizado desde main — 2026-10-27

Origen operativo: main `359476ae954518b4e5082fc40a88e6040cb2db45`.
Rama del demo: `fix/assistant-diagnostic-format`, previamente `629701ea5877497f7d9adf67adbf309e9521b4e2`.

Se integra main conservando marca Xenia, asistente, rol externo limitado, indicador piloto, marca de agua y bloqueo de comunicaciones reales. Las variantes antiguas de SPA del demo se sustituyen por el circuito actual de main; los permisos de alojamiento usan la matriz actual. No se integra ningún cambio local que todavía no esté en main.

La campaña de cumpleaños incorporada desde main también respeta la política de correo bloqueado del piloto, tanto al consultar disponibilidad como antes de leer configuración o enviar. Las pruebas usan proveedores simulados. No se ejecutaron emisiones fiscales ni modificaciones de datos operativos.

Validación:
- Cliente: 155 archivos / 838 pruebas correctas.
- Servidor sin las pruebas del investigador: 1141 correctas y un timeout de middleware con carga concurrente; el archivo completo (29 pruebas) pasó al repetirlo solo. Los nuevos casos de bloqueo de cumpleaños pasaron (11 pruebas del archivo de correo).
- Finanzas, PostgreSQL sintético aislado: 69 pruebas correctas.
- TypeScript y build de cliente/servidor correctos.
- El servicio del asistente no se modifica. La suite completa del servidor detectó 12 fallos en pruebas antiguas del investigador que usan líneas y contenido de código previos a esta actualización (atribución, revisión, auditoría, presupuesto y descubrimiento). Quedan pendientes para retomar el asistente; no se deshabilitan ni se presentan como pruebas correctas. No se realizaron llamadas reales al modelo.

Publicar exclusivamente la rama del demo; no modifica main ni su despliegue de producción.
