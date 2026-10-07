# Descuentos generales en facturas de compras

La sección Descuentos aparece entre Percepciones y Observaciones para FACT-A, FACT-B y FACT-C.

- A y C admiten descripción, porcentaje o importe. La base es neto + exento + no gravado, antes de impuestos y percepciones. En A, el IVA se reduce proporcionalmente; las percepciones y otros impuestos informados permanecen iguales.
- B admite únicamente el descuento final en pesos informado por el proveedor, sobre los importes finales cargados. No se infiere IVA ni se ofrece porcentaje.
- Los artículos ingresan con la cantidad y costo unitario originales. No se distribuye el descuento general entre artículos ni recetas.
- El servidor calcula el descuento y conserva los importes originales en purchase_invoices.descuento para editar sin aplicarlo dos veces. El total, la deuda pendiente y el asiento usan los importes resultantes.
- La edición de un comprobante pendiente bloquea su fila y vuelve a comprobar el estado antes de actualizar; clientes antiguos deben actualizar la pantalla para editar un comprobante con descuento.
- La migración agrega una columna JSONB nullable; no recalcula facturas anteriores.

Validación: pruebas de cálculo A/B/C, redondeo y límites; formulario y edición; PostgreSQL con alta, edición, deuda, asiento y costo de stock; suite del servidor, TypeScript y build.
