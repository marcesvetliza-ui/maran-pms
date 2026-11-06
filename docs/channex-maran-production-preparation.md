# Canales OTAs en Maran: preparación de producción

Se porta a Maran el procesamiento ARI y recepción de revisiones certificado en Xenia. Xenia conserva su rama de pruebas; no se copian cuentas, propiedades, credenciales, mapeos, reservas ni resultados de su base de datos.

## Accesos

El rol admin activo tiene todas las funciones del módulo y administra los accesos. Los demás usuarios empiezan sin acceso y se habilitan individualmente desde Canales OTAs → Permisos, o desde el panel Canales OTAs en Permisos por Rol. Funciones independientes: consultar, configurar conexiones/credenciales/mapeos, gestionar revisiones de reservas y ejecutar sincronizaciones. Cualquier autorización incluye consulta. Las autorizaciones por usuario usan exclusivamente el prefijo api:ota:* de user_permission_overrides; no modifican otros módulos.

La bandeja muestra huésped, habitación y fechas de la reserva aplicada, con enlace al detalle del PMS. Los identificadores técnicos quedan en referencias desplegables. El detalle de reservas USD conserva el importe original y su cotización para quienes tienen consulta del módulo.

Los controles se aplican en el servidor, incluso para rutas directas y los endpoints OTAs anteriores. El rol admin no puede perder su acceso al módulo por una casilla individual. Se retiran de la matriz los controles anteriores de Channex/sidebar OTAs, que ya no gobiernan estas acciones, para evitar permisos aparentes sin efecto. La interfaz usa los mismos permisos por usuario que el servidor.

## Estado al publicar

La conexión real se crea siempre desactivada, con dirección fija https://app.channex.io/api/v1. La clave se valida contra las propiedades accesibles, se cifra con el mecanismo existente y nunca se devuelve. Solo se admiten direcciones exactas que correspondan al entorno. Las credenciales de Xenia no se importan. Las solicitudes de validación de cuenta y catálogo son lecturas expresas del configurador.

Producción está deshabilitada por defecto. No se habilitan variables ni se conectan OTAs reales en este cambio. Los despachadores requieren CHANNEX_PRODUCTION_ENABLED=true y su interruptor específico CHANNEX_ARI_PRODUCTION_ENABLED o CHANNEX_INBOUND_PRODUCTION_ENABLED. Activar una conexión real requiere ambos interruptores específicos. Los despachadores staging en Maran necesitan además CHANNEX_ALLOW_STAGING=true; los entornos de pruebas automatizadas conservan su aislamiento. Crear configuración no arranca los envíos.

El servidor informa otaIntegrationPrepared y otaProductionEnabled en health para verificar la preparación y que producción continúe desactivada. La preparación opcional no retrasa la disponibilidad de los módulos operativos del hotel.

## Inventario, tarifas y reservas

El alcance puede ser un piso o todo el hotel (floor=null). El alcance de todo el hotel excluye el piso 99 de pruebas y las habitaciones virtuales/REUB. Se conservan reglas certificadas de reservas activas, grupos pendientes de asignación y mantenimiento. Antes de habilitar captura se validan los mapeos, la moneda y tarifas positivas/vigentes para los 500 días. Se conserva envío por deltas de campos y fechas, compresión de intervalos, cola durable, límites, Retry-After/backoff y full sync de dos llamadas con límite de una cada 24 horas.

El receptor conserva revisión inmutable, origen y cotización; aplica alta/modificación/cancelación mediante los guardas actuales de inventario, precios por noche y folio. No cambia automáticamente estadías con modificaciones locales o historial financiero. Los secretos de webhook tienen hash y se muestran una sola vez. La integración anterior de previsualización mantiene sus endpoints compatibles, sujetos a los nuevos permisos; no sustituye el receptor real.

Una conexión que ya capturó cambios no puede cambiar de entorno ni propiedad reutilizando el historial. Cambiar mapeos requiere pausar captura; cambiar conexión con recepción activa requiere pausarla. El bloqueo de inventario se hace reentrante para aplicar una reserva de varias habitaciones en una sola transacción sin bloquearse a sí misma.

## Puesta en marcha pendiente

1. Confirmar suscripción Whitelabel y cuenta de producción de Evan.
2. Preparar en el servidor CHANNEX_CREDENTIALS_ENCRYPTION_KEY si no existe: secreto aleatorio de al menos 32 caracteres. Nunca rotarlo sin migrar credenciales existentes ni pegarlo en el chat.
3. Crear/verificar la propiedad real y su moneda en Channex. Guardar su Property ID y clave API en el formulario seguro de Maran. La conexión queda desactivada.
4. Obtener catálogo y revisar mapeos reales, ocupaciones, inventario disponible y moneda de cada plan contra la moneda remota. Revisar precios/restricciones durante todo el horizonte de 500 días. No inventar tarifas futuras ni conversiones.
5. Revisar webhook HTTPS y cotización para reservas USD si corresponde. Instalar su encabezado secreto en Channex.
6. Habilitar expresamente los tres interruptores de producción durante la puesta en marcha acordada; activar conexión, validar/habilitar captura y habilitar recepción. Verificar las dos llamadas iniciales y tareas aceptadas. Comprobar reserva/modificación/cancelación antes de habilitar la venta por los canales reales.

La preparación local y las pruebas no significan que una OTA esté conectada ni que se hayan validado credenciales reales.
