# Conectar la web de Xenia en Donweb

Fecha: 16 de noviembre de 2026. Dominio principal: `xeniapms.com`.

## Estado

El diseño fue aceptado por Marcelo. La home sigue publicada de forma privada en https://xenia-pms-home.chalky-yak-9675.chatgpt.site.

Se prepararon `xeniapms.com` y `www.xeniapms.com` en el alojamiento. Ambos están pendientes de DNS y validación del certificado. Esta preparación no cambia los registros de Donweb ni habilita acceso público.

## 1. Abrir la zona del dominio principal

Ingresá a [Mi cuenta de Donweb](https://micuenta.donweb.com/) y buscá el dominio en **Mis Servicios → Dominios**. Abrí **Gestionar** y la sección **Nameservers y Zona DNS**. Es el recorrido indicado en la [guía oficial de zona DNS](https://soporte.donweb.com/es/articles/15901641-dominios-y-zona-dns-gestionar-la-zona-dns-de-tu-dominio).

Si la zona todavía no existe, se puede crear usando la primera IP A de la tabla y luego completar los demás registros. Guardá una copia o captura de la configuración actual antes de editar.

La zona se administra donde estén delegados los nameservers; la compra en Donweb no prueba por sí sola que la zona activa siga allí.

## 2. Cargar estos siete registros

Los valores fueron devueltos por el alojamiento para estos nombres. Usá los nombres completos, incluido `xeniapms.com`, como pide el campo Nombre de Donweb. Para agregar se usa **Agregar registro**; un registro existente se modifica con el lápiz. Conservá el TTL predeterminado del panel.

| Tipo | Nombre completo en Donweb | Contenido |
|---|---|---|
| A | `xeniapms.com` | `162.159.143.30` |
| A | `xeniapms.com` | `172.66.3.26` |
| TXT | `_openai-site-verification.xeniapms.com` | `openai-site-verification=Iu4RXFG1q6ug8HBHGK3GzBJz2H3zD6zWry9DmNkmq_4` |
| TXT | `_cf-custom-hostname.xeniapms.com` | `394f2338-f2bc-4eac-914c-3992b4f03789` |
| CNAME | `www.xeniapms.com` | `custom-domains.chatgpt.site.` |
| TXT | `_openai-site-verification.www.xeniapms.com` | `openai-site-verification=O-299jmrs1NG81SCwVAMzJ1KtYSwVfon4zppEr8sk4w` |
| TXT | `_cf-custom-hostname.www.xeniapms.com` | `d7b1c738-2f43-4515-8b59-07c464d8aecf` |

Los dos registros A tienen el mismo nombre y diferentes IP: deben quedar ambos. El CNAME se copia como nombre de servidor, sin `https://`. Los valores TXT se pegan completos, sin comillas adicionales.

Si hay registros web de estacionamiento para esos mismos nombres, corresponde ajustar esos registros en lugar de conservar destinos contradictorios. Revisá también cualquier AAAA del dominio raíz que apunte al alojamiento anterior. Conservá los registros ajenos a la web, especialmente MX y los TXT del correo. Donweb explica ese alcance en su [guía para mantener el correo al conectar un proveedor externo](https://soporte.donweb.com/es/articles/15901209-dominios-y-zona-dns-vincular-el-dominio-a-otro-proveedor-manteniendo-el-correo-en-donweb).

## 3. Validar dominio y HTTPS

Después de guardar, se comprueban los siete registros públicos y se actualiza la validación del alojamiento. La propagación puede demorar; no se considera listo hasta que el proveedor informe dominio y certificado activos.

La apertura pública es un paso separado de la validación DNS: la home mantiene su acceso privado actual. La versión pública debe completar el contacto real, confirmar el enlace de ingreso al PMS, retirar los avisos de maqueta y actualizar canonical e indexación al dominio principal.

## 4. Configurar los otros tres dominios

Destino previsto en los tres casos: `https://xeniapms.com/`.

- `xeniapms.com.ar`.
- `xeniapms.store`.
- `xeniapms.online`.

Para un dominio sin hosting asociado, Donweb ofrece **Redirección y Parking** dentro de su gestión. Allí se puede indicar el destino. La [guía de redirección de Donweb](https://soporte.donweb.com/es/articles/15871307-dominios-y-zona-dns-redireccionar-un-dominio) distingue esta opción de las reglas de Ferozo.

Primero debe funcionar el principal. Después se verifica cada alternativa por HTTP y HTTPS, con y sin www cuando corresponda. El soporte de certificado en el origen de la redirección y el estado HTTP efectivo deben comprobarse; la guía no basta para darlos por garantizados. El resultado buscado es redirección permanente al principal, no una segunda copia de la web. También se verificará la redirección canónica del www del dominio principal.

## 5. Activar el contacto comercial

Propuesta actual: `contacto@xeniapms.com`. El nombre que aparece en la maqueta no crea una casilla.

Revisá si la cuenta de Donweb ya dispone de servicio de correo. Si existe un plan adecuado, se asocia el dominio y se crea la cuenta desde su gestión; si no, se define proveedor y costo antes de contratar. La [guía oficial de creación de cuentas](https://soporte.donweb.com/es/articles/15770090-correo-profesional-crear-y-eliminar-una-cuenta-de-correo) describe el circuito de Correo Profesional.

Se copiarán los MX, SPF y DKIM reales del proveedor y se probarán recepción y respuesta. Esos valores no se inventan ni se sustituyen por los registros web. Después se retiran de la home las indicaciones de contacto provisional.

## Qué se realizó y qué sigue pendiente

Preparado: nombres del alojamiento, valores DNS y esta guía.

Pendiente: carga en Donweb, validación externa, HTTPS activo, contacto real, confirmación del ingreso al PMS, acceso público y redirecciones verificadas.

No se modificaron el dominio, la aplicación ni operaciones de Maran.
