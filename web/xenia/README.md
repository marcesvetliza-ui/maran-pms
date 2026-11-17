# Xenia PMS — gestión para la hospitalidad

Versión de apertura de la web comercial. El propietario autorizó la apertura pública el 17 de noviembre de 2026; Sites confirmó la audiencia pública y la versión 5. Sitio estático: `dist/index.html`, `dist/styles.css`, `dist/app.js` y los logos originales de Xenia extraídos del repositorio `marcesvetliza-ui/maran-pms`, rama `feature/xenia-channex-staging`.

## Decisiones confirmadas

- Marca: Xenia PMS.
- Posicionamiento: plataforma de gestión para la hospitalidad, con hotelería como eje comercial.
- Áreas con presentación propia: alojamiento, restaurant, spa, eventos y grupos.
- Hostels, apart hoteles y alquileres temporarios: adaptación a definir antes de implementar; las conexiones con Airbnb y otros canales se confirman por instalación.
- Dominio principal adquirido: `xeniapms.com`.
- Alternativos adquiridos: `xeniapms.com.ar`, `xeniapms.store`, `xeniapms.online`.
- Registrador: Donweb.
- `.store` y `.online`: redirecciones al principal configuradas por Marcelo y comprobadas por él en una ventana privada el 17 de noviembre de 2026.
- `.com.ar`: la última captura de Donweb muestra registro pendiente con NIC Argentina; su redirección se completará cuando el dominio se active.
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
- Acceso público habilitado con autorización expresa del propietario y confirmado por Sites. Marcelo confirmó que abre sin sesión en una ventana privada. La comprobación HTTP automática desde este entorno sigue bloqueada por su proxy.

## Próximos pasos

1. Apertura pública completada el 17 de noviembre de 2026. Sitio principal: `https://xeniapms.com/`.
2. Retomar la redirección de `.com.ar` cuando Donweb complete el registro. Las de `.store` y `.online` ya fueron configuradas y comprobadas por el propietario.
3. Acceso de visitante sin sesión y redirecciones de `.store` y `.online` comprobados por Marcelo en una ventana privada.
4. Mantener el ingreso actual al PMS en `https://demo.maranpms.com.ar/`; una dirección propia para la aplicación requiere su configuración separada.

Esta home se desarrolla fuera de la aplicación operativa de Maran. No modifica sus datos ni su publicación.
