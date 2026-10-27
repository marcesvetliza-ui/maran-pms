# Unidades de consumo y contenido de envases

Las recetas de platos y elaboraciones base permiten elegir unidades compatibles con el artículo. Cambiar la unidad convierte la cantidad ya ingresada y el costo unitario, preservando el importe. Se ofrecen conversiones estándar de masa/volumen/docena y las equivalencias propias guardadas; no se infiere peso a partir de volumen.

El stock y el costo del artículo conservan su unidad base. Al crear o editar un ingrediente vinculado con Inventario, el servidor valida su conversión y toma el costo vigente del artículo convertido a la unidad del ingrediente. No confía en el precio enviado por el navegador. No se reescriben recetas antiguas por el mero despliegue.

Inventario incorpora la carga «1 unidad/caja/paquete contiene X gramos/kilos/ml/litros». Traduce ese contenido al formato existente: unidades de stock por unidad de entrada. Para un envase como unidad base se generan equivalencias de ambas unidades de la dimensión (g/kg o ml/litro). Mantiene la precisión existente de nueve decimales para factores; el stock sigue teniendo tres decimales. Aplicar contenido requiere guardar las equivalencias o el artículo nuevo. No cambia el precio ni el stock por sí solo.

Ejemplos verificados:
- Stock en kg, $6000/kg: 300 g cuestan $1800 y consumen 0,300 kg.
- Stock en litro, $6000/litro: 300 ml cuestan $1800 y consumen 0,300 litro.
- Stock en unidad, envase de 3000 g a $18000: 300 g cuestan $1800 y consumen 0,100 unidad.

Validación: 10 pruebas de interfaz/cálculo, 2 de validación de equivalencias y 16 con PostgreSQL descartable (incluidas cascada y flujos de Inventario). TypeScript global y build aprobados. Sin acceso ni modificación de datos operativos.
