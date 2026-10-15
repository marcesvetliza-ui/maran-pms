# SPA: mejoras operativas para el piloto

Base: `fix/assistant-diagnostic-format` en `8f9efde5`. Desarrollo aislado en
`feature/spa-operations`. El commit de SPA puede seleccionarse por separado;
no se debe integrar toda la rama del piloto a main, porque contiene Xenia y otros trabajos.
No incluye Revenue ni implementa la corrección financiera de Replit.

## Comportamiento implementado

- Crear un turno abre el diálogo fiscal existente dentro de SPA, sin navegar al
  centro de comprobantes. Cancelar permite seguir en la agenda; desde un folio,
  cancelar el diálogo fiscal vuelve al folio. Emitir con éxito cierra ambos.
- El cierre ofrece Factura electrónica, sin inventar la condición IVA a partir de
  A/B. El diálogo fiscal compartido conserva su buscador de empresa/agencia/huésped,
  revisión del receptor, validación y cobro. Los cargos son los del folio, bloqueados.
- La empresa vinculada tiene prioridad como receptor, pero sus campos faltantes
  no se rellenan con datos fiscales del huésped. Si no se conoce condición IVA,
  queda vacía para revisión, en lugar de asignar Consumidor Final silenciosamente.
- Tratamientos: Activos/Inactivos/Todos. La desactivación no elimina filas; editar
  un inactivo permite reactivarlo. DELETE antiguo también desactiva por compatibilidad.
  Los rótulos de turnos conservan el nombre de tratamientos inactivos.
- Crear un tratamiento mantiene su edición abierta para configurar insumos.
- Insumos: búsqueda por nombre/SKU y costo por unidad de stock claramente rotulada.
- Editor: cantidades sin ceros innecesarios, costo estimado por insumo y suma,
  conversión estándar o explícita con el mismo motor de unidades de Inventario.
  Falta de costo/equivalencia se informa como estimación parcial, nunca como costo cero.
  Consultar el estimado no descuenta stock ni cambia precios. No representa el costo
  total del servicio ni calcula márgenes o gastos no configurados.
- Navegación y fila de agregado de insumos se adaptan al celular sin desborde del diálogo.

## Límite financiero pendiente: coordinar con Replit

Sigue protegida la facturación de un folio con pagos previos. Ahora se explica el
bloqueo y se indica no volver a cobrar ni anular cobros reales para continuar.
Esta entrega **no resuelve todavía** facturar cobros ya registrados: requiere
el mecanismo de Replit de aplicaciones financieras y conciliación de pagos/Caja.
No se quita el guard del cliente ni la validación de `link-invoice` del servidor.

Antes de habilitarlo se necesita un contrato que identifique pagos por ID, capacidad
real disponible, aplicaciones anteriores, dinero nuevo necesario, operación
idempotente y recuperación posterior a autorización fiscal. Debe contemplar pagos
divididos, cobros parciales/totales, NC y turnos cerrados sin duplicar Caja.
Los cambios de esta entrega no modifican los endpoints de emisión ni conciliación.

## Revisión del consumo parcial

La versión revisada usa `queueAutomaticConsumption`, validación de todo el documento
antes de escrituras y transacción para su consumo. Una prueba PostgreSQL con dos
insumos confirma: si uno no alcanza, no descuenta ninguno; queda pendiente; tras
reponerlo, consume ambos; el siguiente reintento no duplica los movimientos.
No se confirmó en esta versión el riesgo de consumo parcial mencionado en el informe.
No se cambió ese motor.

## Validación local

- 29 pruebas PostgreSQL de SPA, incluyendo 5 nuevas de recuperación de tratamientos,
  costos/conversiones sin escrituras y consumo pendiente/reintentos.
- 8 pruebas de cliente: receptor fiscal y recorridos de edición, reactivación,
  búsqueda, regreso al folio y protección de cobros existentes.
- 5 pruebas de permisos de SPA existentes.
- TypeScript y compilación de producción.
- Chromium con respuestas API de prueba: creación de tratamiento mediante el botón
  real, continuación en insumos, vista 1440x1000 y 390x844, sin errores de ejecución
  ni desborde horizontal del diálogo. No es una prueba de emisión real ni de ARCA.

## Recorrido de aceptación en demo

1. Desactivar un tratamiento de prueba y localizarlo en Inactivos. Editar su estado
   a Activo. Verificar que sus turnos previos conservan el nombre.
2. Crear un tratamiento: después de guardar, configurar insumos en la misma ventana.
3. Para un artículo de $20.000/litro y consumo de 50 ml, esperar costo $1.000.
   Si falta una equivalencia, esperar aviso y total parcial, sin movimiento de stock.
4. Buscar un insumo por SKU, tanto en escritorio como en celular.
5. Crear un turno sin cobros anteriores: revisar receptor y comprobante dentro de
   SPA; cancelar y comprobar que continúa en la agenda. Usar sólo modo fiscal ficticio.
6. Desde un folio sin pagos, abrir el diálogo fiscal y volver al mismo folio.
7. En un folio ya pagado, verificar la explicación del bloqueo. No registrar otro
   cobro ni anular uno verdadero para intentar superar la protección.

La validación local no confirma qué versión quedó desplegada en Railway ni revisa
los movimientos o datos del sistema real.
