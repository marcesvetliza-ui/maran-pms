# Xenia PMS — gestión para la hospitalidad

Vista previa privada de la marca y el producto. Sitio estático: `dist/index.html`, `dist/styles.css`, `dist/app.js` y los logos originales de Xenia extraídos del repositorio `marcesvetliza-ui/maran-pms`, rama `feature/xenia-channex-staging`.

## Decisiones confirmadas

- Marca: Xenia PMS.
- Posicionamiento: plataforma de gestión para la hospitalidad, con hotelería como eje comercial.
- Áreas con presentación propia: alojamiento, restaurant, spa, eventos y grupos.
- Hostels, apart hoteles y alquileres temporarios: adaptación a definir antes de implementar; las conexiones con Airbnb y otros canales se confirman por instalación.
- Dominio principal adquirido: `xeniapms.com`.
- Alternativos adquiridos: `xeniapms.com.ar`, `xeniapms.store`, `xeniapms.online`.
- Registrador: Donweb.
- Los alternativos se proponen como redirecciones al principal; no son sitios distintos.
- Contacto propuesto, autorizado como dato de maqueta: `contacto@xeniapms.com`. No hay evidencia de que ese buzón exista o esté activo.
- El asistente queda detrás de marca y home en el orden de trabajo.

## Funcionalidad de esta entrega

Navegación responsive, menú móvil, ejemplo de planning interactivo, detalle de reservas ficticias, vistas de cobros y cuenta corriente, cinco recorridos por actividad, cuatro tipos de alojamiento, ocho módulos y preguntas desplegables. El formulario permite indicar la actividad y preparar consultas sin capacidad de alojamiento para restaurant, spa, eventos o grupos. La consulta se prepara localmente: permite copiar el mensaje o abrir un borrador de correo. No se envían mensajes desde el sitio, no se guardan leads y no hay analítica.

Los importes y las habitaciones son ficticios. El acceso al PMS usa la dirección existente de Xenia, `https://demo.maranpms.com.ar/`, en una pestaña aparte. El sitio no tiene credenciales ni consulta ninguna base del hotel. Multihotel figura como desarrollo, no como capacidad ya validada.

## Antes de conectar el dominio comercial

1. Revisar y aprobar contenido, diseño y alcance comercial.
2. Crear o confirmar un canal de contacto y sustituir las indicaciones de maqueta.
3. Confirmar el destino definitivo del ingreso al PMS y de una demo comercial.
4. Revisar textos legales de la versión pública y el tratamiento del formulario si cambia su comportamiento.
5. Habilitar la audiencia pública únicamente al publicar la versión aprobada.
6. Obtener del alojamiento los registros exactos; configurar la zona de Donweb, validar HTTPS y redirecciones para los cuatro dominios y sus variantes necesarias.
7. Actualizar canonical/og:url a `https://xeniapms.com/` y retirar `noindex` cuando la web pública esté lista.

El desarrollo de esta home no modifica código, datos, dominio, DNS ni publicación de Maran PMS.
