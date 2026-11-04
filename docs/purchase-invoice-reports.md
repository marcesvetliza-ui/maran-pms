# Descargas de Comprobantes de Compra

En `/purchase-invoices`, pestaña Comprobantes: Desde/Hasta por fecha de emisión (inclusive), proveedor, estado, período y búsqueda. Lista, Excel y PDF comparten la misma función de filtrado. Campos vacíos no limitan ese extremo. Un rango invertido deshabilita las descargas y se valida también en el servidor.

`GET /api/exports/purchase-invoices?format=xlsx|pdf` exige sesión, solo consulta registros y no modifica documentos, pagos, stock ni contabilidad. La consulta SQL parametriza fecha/proveedor y el reporte aplica todos los filtros antes de generar el archivo, sin límite de paginación.

Excel: primeras 30 columnas del archivo adjunto “Mis Comprobantes Recibidos - CUIT 33681100089 (27).xlsx”. Números y CUIT conservados como texto, importes numéricos, encabezados fijos, autofiltro y hoja Resumen. Agrega estado, saldo, descuento y envío incluidos. No se fabrican códigos de autorización ni bases por alícuota: el PMS no los guarda; quedan vacíos. Neto según carga PMS (B/C son importes finales), moneda ARS. No reemplaza el archivo fiscal de ARCA. Se exportan solo comprobantes cargados, incluidos tipos internos que aparecen en la lista.

PDF: A4 horizontal, filas con datos principales y estado/saldo, encabezados repetidos, páginas numeradas y resumen. Otros = no gravado + exento + tributos/percepciones. Los detalles completos por IVA están en Excel. El resumen resta NC y excluye anulados, conservando sus filas identificadas en detalle. Descuento/envío no se suman otra vez.

Pruebas: filtros inclusive/proveedor/estado/búsqueda, validación de fechas, importes NC/anulados, Excel reabierto, PDF de 360 documentos, autenticación y ambos formatos HTTP, filtros/UI/descarga/regresión de anulación. Revisión visual del PDF y lectura con pdfinfo/pdftotext; TypeScript y build.
