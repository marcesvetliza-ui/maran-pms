# Dominios y primera home de Xenia

Fecha: 16 de noviembre de 2026. Prioridad actual: marca y home comercial; el asistente se retoma después. Maran conserva su operación y dirección actuales.

## Dominios confirmados por Marcelo

| Dominio | Proveedor informado | Uso definido o propuesto | Estado |
|---|---|---|---|
| `xeniapms.com` | Donweb | Web principal de Xenia. | Compra confirmada; conexión DNS pendiente. |
| `xeniapms.com.ar` | Donweb | Redirección al principal. | Compra confirmada; conexión y HTTPS pendientes. |
| `xeniapms.store` | Donweb | Redirección al principal. | Compra confirmada; conexión y HTTPS pendientes. |
| `xeniapms.online` | Donweb | Redirección al principal. | Compra confirmada; conexión y HTTPS pendientes. |

La confirmación de compra proviene de Marcelo; no se consultó su cuenta de Donweb. Titularidad, vencimientos, renovación y recuperación se anotarán desde esa cuenta. Los registros DNS de destino se copiarán del alojamiento elegido cuando se prepare la publicación pública, sin inventar valores.

## Identidad disponible

Se encontraron y copiaron sin modificar tres archivos originales de la rama de Xenia en GitHub:

- `client/public/branding/xenia-horizontal.png`.
- `client/public/branding/xenia-compact.png`.
- `client/public/branding/xenia-icon.png`.

La home utiliza el logo horizontal, el ícono y una paleta basada en su azul petróleo. No se generó otro logo.

## Primera entrega

Vista previa privada publicada: https://xenia-pms-home.chalky-yak-9675.chatgpt.site

La publicación está limitada al propietario del sitio. No se conectaron los dominios comprados ni se habilitó acceso público. Se revisaron las pantallas en navegador local antes de publicar; el resultado de publicación fue confirmado por Sites.

Incluye navegación móvil, ejemplos interactivos de planning, cobros y cuenta corriente, detalle de reservas ficticias, contenidos por área, módulos, preguntas frecuentes e información de privacidad de la vista previa.

La consulta se prepara en el navegador: se puede copiar o abrir como borrador en la aplicación de correo. No se envían correos automáticamente ni se almacenan leads. Marcelo autorizó completar el contacto con un dato de maqueta; se propuso `contacto@xeniapms.com`, que continúa pendiente de creación o confirmación.

El enlace de ingreso apunta a la dirección existente de Xenia, `https://demo.maranpms.com.ar/`, y debe confirmarse antes de la publicación comercial. Las pantallas ilustrativas no consultan datos del hotel. La gestión multihotel figura expresamente como desarrollo.

## Código y verificación

Código preparado en una rama independiente de GitHub: `site/xenia-home-20261116`, carpeta `web/xenia/`. La base del checkout es `cbb5838b`, que incorpora la PR 116. No se fusiona esta entrega con `main`.

Fuente publicada de la vista previa: revisión `97ba1c39b497efb6138fcadfe13a5acd32b53598` del repositorio de publicación del sitio. Sus archivos estáticos se conservaron también en GitHub.

Se verificaron anchos de 360, 390, 768, 1024 y 1440 píxeles, carga de recursos, ausencia de desbordes horizontales, pestañas, navegación por teclado, detalles de reserva, menú móvil, desplegables, preparación de consulta y copia al portapapeles. Resultado: sin errores de JavaScript en esas comprobaciones. La sintaxis JavaScript y los enlaces internos también se revisaron.

## Siguiente paso

Marcelo indicó que le gustó la propuesta. Se prepararon `xeniapms.com` y `www.xeniapms.com` en el alojamiento y se obtuvieron los siete registros DNS de conexión y verificación. El anexo `DNS_XENIA_DONWEB_2026-11-16.md` conserva los valores y el recorrido de Donweb. Ambos nombres siguen pendientes de validación; no se modificó la zona DNS ni la audiencia privada de la home.

Sigue la carga en Donweb, la comprobación del certificado, el contacto real y la confirmación de la entrada al PMS. La versión pública retirará los avisos de maqueta y ajustará canonical e indexación al dominio definitivo. Los otros tres dominios se redirigirán después de validar el principal y el soporte de HTTPS de las redirecciones. Las pruebas de esta entrega no modificaron datos, DNS ni publicaciones de Maran.
