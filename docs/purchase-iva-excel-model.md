# Excel de Libro IVA Compras según modelo de Administración

El botón **Excel Libro IVA Compras** de **Administración → Consultas Contables →
Compras** descarga un libro con estas hojas:

1. **Libro IVA Compras**: las 32 columnas del archivo aportado
   `MODELO COMPROBANTES COMPRAS.xlsx`, en el mismo orden. Se normalizan únicamente
   los espacios sobrantes al final de los títulos. Sin filas adicionales de título
   ni totales entre los comprobantes.
2. **Detalle contable**: el formato anterior con sus datos internos y totales,
   conservado para no perder información que no está en el modelo nuevo.

**Número Hasta** y **Cód. Autorización** se conservan, marcadas en rojo y vacías:
no se inventan números finales ni autorizaciones que no están registradas.
Punto de venta, número y CUIT se guardan como texto para conservar ceros y precisión.

Tipo de comprobante usa el código ARCA seguido de su denominación: por ejemplo
`1 - Factura A`, `11 - Factura C`, `3 - Nota de Crédito A`, `15 - Recibo C` y
`4 - Recibo A`, exactamente como los ejemplos aportados. El catálogo de códigos
incluye las letras A/B/C y facturas/notas M conocidas. No asigna un código de
Factura A a documentos internos sin una correspondencia conocida.

Los importes proceden de los mismos comprobantes y período que antes. Las bases
por alícuota conservan el cálculo existente (renglones almacenados cuando existen;
comportamiento histórico del libro para los demás casos). La base al 0% se obtiene
solo de renglones almacenados con esa tasa. Las percepciones IIBB e IVA tienen sus
columnas propias y no se repiten en **Otros Tributos**, que reúne impuestos internos,
Ley 25.413 y percepciones de Ganancias. Descuentos/envíos mantienen los importes ya
registrados: la exportación no recalcula ni modifica la compra.

Receptor: CUIT y moneda del reporte existente de Maran (`33681100089`, pesos,
tipo de cambio 1), coincidentes con el modelo. No se altera la configuración del
hotel ni se agregan cambios a los TXT de CBTE/Alícuotas o al Libro IVA Ventas.

## Validación

- Se conserva el archivo aportado como fixture y se comparan sus 32 encabezados y
  cinco ejemplos de códigos con el libro generado.
- Pruebas de serialización XLSX, columnas opcionales sin datos, identificación como
  texto, IVA/percepciones separados, totales y documento desconocido.
- PostgreSQL de pruebas: exportación con 100 netos al 21% y 300 al 10,5%, descarga
  Excel, hoja contable conservada, TXT y exclusión de registros de gasto.
- Comprobación de tipos, compilación y formato por rama destino.

Las pruebas usan datos ficticios y no consultan compras del hotel.
