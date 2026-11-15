# Verificación de sesión y reconexión

El cliente reconoce una sesión existente sólo después de consultar `/api/auth/me` y validar la identidad recibida. Un `401` confirma que corresponde volver al ingreso. Un error de red, una respuesta temporal del servidor o un `429` conserva la última identidad verificada y muestra la reconexión; no se trata como vencimiento de la sesión.

La consulta tiene un límite de ocho segundos y hasta tres intentos automáticos. Respeta `Retry-After`; si la espera indicada supera cinco segundos, deja el reintento en manos del usuario al terminar ese plazo. Al agotarse los intentos muestra una acción para reintentar. Sin una identidad verificada no se muestra el contenido privado.

Durante una nueva verificación se conserva la pantalla montada, incluidos los formularios y diálogos abiertos, con un aviso modal que bloquea nuevas acciones. `apiRequest` también impide enviar nuevas escrituras mientras la sesión no esté verificada. Las operaciones ya enviadas conservan su propio circuito de confirmación y recuperación; no se reenvían por recuperar la conexión.

El cierre de sesión manual o recibido desde otra pestaña cancela la verificación pendiente. Una respuesta antigua no puede restaurar la sesión anterior. Los cambios de identidad o rol limpian los datos de la cuenta anterior antes de habilitar la pantalla nueva. Se mantiene el requisito de ingreso por pestaña; una pestaña que cerró sesión no invalida el nuevo ingreso de otra pestaña al recibir su aviso.

La validación del servidor, los permisos y la duración de las sesiones permanecen en su circuito existente. Las pruebas cubren el arranque durante una actualización, errores de red, límite de solicitudes, expiración real, respuestas tardías, varias pestañas y la conservación de una reserva sin guardar en un diálogo abierto.
