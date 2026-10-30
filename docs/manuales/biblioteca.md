# Biblioteca de manuales

Ruta de usuario: `/manuales`, acceso permanente al pie del menú lateral para usuarios autenticados.

Entrega documental recibida el 29/10/2026: 18 manuales y 18 guías rápidas, 405 páginas, edición 1. Se conservan los PDF originales y sus avisos de borrador. La incorporación no acredita la validación operativa del contenido.

Los documentos se almacenan en `server/assets/manual-library`, fuera del directorio público. El build existente copia los assets a `dist/server/assets`. `shared/manual-library.ts` contiene títulos, palabras clave, páginas y clasificación. La búsqueda inicial es por título y palabras clave, no por el texto completo de los PDF.

`GET /api/manuals` devuelve el catálogo autorizado. `GET /api/manuals/:topic/:kind` sirve únicamente los documentos enumerados en el catálogo, con autenticación, comprobación de permisos y `private, no-store`. `?download=1` ofrece descarga; los lectores PDF pueden solicitar rangos de bytes con las mismas comprobaciones.

Configuración y Técnica requieren `api:manuals:restricted`, concedido inicialmente solo a `admin`. El permiso se administra desde Permisos por Rol y se siembra mediante el mecanismo existente, sin restaurar concesiones revocadas. Los demás 16 temas son de consulta para usuarios autenticados. La biblioteca no concede permisos para ejecutar las acciones descritas en un manual.

Para actualizar: sustituir el PDF original aprobado en su carpeta y actualizar metadatos, páginas, fecha y estado. Mantener los archivos fuera de `client/public` y `dist/public`. Los archivos descargados por un usuario autorizado no pueden revocarse de su dispositivo.

Este cambio no incluye trabajos de Channex ni modifica reservas, pagos, facturación o caja.
