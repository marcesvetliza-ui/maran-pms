# Xenia PMS — gestión para la hospitalidad

Versión de apertura de la web comercial. El acceso sigue siendo privado hasta la indicación expresa de apertura pública. Sitio estático: `dist/index.html`, `dist/styles.css`, `dist/app.js` y los logos originales de Xenia extraídos del repositorio `marcesvetliza-ui/maran-pms`, rama `feature/xenia-channex-staging`.

## Decisiones confirmadas

- Marca: Xenia PMS.
- Posicionamiento: plataforma de gestión para la hospitalidad, con hotelería como eje comercial.
- Áreas con presentación propia: alojamiento, restaurant, spa, eventos y grupos.
- Hostels, apart hoteles y alquileres temporarios: adaptación a definir antes de implementar; las conexiones con Airbnb y otros canales se confirman por instalación.
- Dominio principal adquirido: `xeniapms.com`.
- Alternativos adquiridos: `xeniapms.com.ar`, `xeniapms.store`, `xeniapms.online`.
- Registrador: Donweb.
- Los alternativos se proponen como redirecciones al principal; no son sitios distintos.
- Contacto comercial: `contacto@xeniapms.com`. Cuenta creada en Correo Profesional de Donweb. Marcelo confirmó recepción y respuesta desde Webmail el 17 de noviembre de 2026.
- El asistente queda detrás de marca y home en el orden de trabajo.

## Funcionalidad de esta entrega

Navegación responsive, menú móvil, ejemplo de planning interactivo, detalle de reservas ficticias, vistas de cobros y cuenta corriente, cinco recorridos por actividad, cuatro tipos de alojamiento, ocho módulos y preguntas desplegables. El formulario permite indicar la actividad y preparar consultas sin capacidad de alojamiento para restaurant, spa, eventos o grupos. La consulta se prepara localmente: permite copiar el mensaje o abrir un borrador de correo. No se envían mensajes desde el sitio, no se guardan leads y no hay analítica.

Los importes y las habitaciones son ficticios. El acceso al PMS usa la dirección existente de Xenia, `https://demo.maranpms.com.ar/`, en una pestaña aparte. El sitio no tiene credenciales ni consulta ninguna base del hotel. Multihotel figura como desarrollo, no como capacidad ya validada.

## Estado de apertura al 17 de noviembre de 2026

- Enfoque y diseño de hospitalidad aprobados por Marcelo.
- Correo comercial probado por el titular para recepción y respuesta.
- Alojamiento confirma `xeniapms.com` y `www.xeniapms.com` activos, con HTTPS.
- La versión de apertura retira el cartel de vista previa y usa el dominio principal en canonical, Open Graph, robots y sitemap.
- Las pantallas e importes de ejemplo siguen identificados como ilustrativos.
- El formulario prepara una consulta local y un borrador para el correo comercial; no incorpora envío automático ni una base de leads.
- La audiencia actual continúa siendo privada y sólo permite al propietario.

## Próximos pasos

1. Habilitar la audiencia pública cuando Marcelo lo indique expresamente.
2. Configurar y comprobar redirecciones de `.com.ar`, `.store` y `.online` al dominio principal desde Donweb. No están dadas por configuradas.
3. Verificar la navegación de un visitante sin sesión al abrir la audiencia.
4. Mantener el ingreso actual al PMS en `https://demo.maranpms.com.ar/`; una dirección propia para la aplicación requiere su configuración separada.

Esta home se desarrolla fuera de la aplicación operativa de Maran. No modifica sus datos ni su publicación.
