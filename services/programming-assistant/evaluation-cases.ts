/** Synthetic prompts for pilot review. Expectations are rubric, never evidence. */
export const pilotEvaluationCases = [
 {
  id:'missing-equivalence',module:'inventario',title:'Error de equivalencia al cargar receta',
  actual:'En Consumo Interno cargo una receta con un ingrediente en cajas sin equivalencia y aparece Error al cargar receta.',
  expected:'Identificar cómo llega el error del endpoint a la pantalla y si se pierde el detalle.',
  endpoint:'/api/inventory/recipe-stock-preview',method:'POST',
  checks:['Leer el catch del endpoint, apiRequest, parser y catch del cliente.','Identificar la equivalencia sin afirmar que ejecutó pruebas.'],
 },
 {
  id:'room-overlap',module:'recepcion',title:'Disponibilidad al cambiar de habitación',
  actual:'Cambio una reserva a una habitación con fechas superpuestas.',
  expected:'Rechazar sin cambiar la reserva original; permitir salida y entrada el mismo día. Revisar pantalla, servidor y aserciones existentes.',
  endpoint:'/api/reservations/:id',method:'PATCH',
  checks:['Distinguir prueba pura de integración.','Verificar persistencia y catch del cliente antes de concluir que todo el flujo funciona.'],
 },
 {
  id:'concurrent-invoice',module:'facturacion',title:'Dos personas facturan el mismo cargo',
  actual:'Dos operadores intentan facturar el mismo cargo de una reserva y uno recibe 409.',
  expected:'Investigar si el rechazo protege de una doble factura y cómo se muestra, sin emitir comprobantes.',
  endpoint:'/api/billing/invoices',method:'POST',
  checks:['Leer validación de saldo, bloqueo y manejo del conflicto.','No tratar todo 409 como defecto ni garantizar concurrencia por un comentario.'],
 },
 {
  id:'credit-refacture',module:'facturacion',title:'Refacturar después de una nota de crédito',
  actual:'Factura de 270000 con débito 180000 y crédito 90000. Una NC de 90000 conserva los pagos y al refacturar indica que no hace falta otro cobro.',
  expected:'Distinguir pendiente de facturación de pendiente de cobro; explicar los pagos conservados y el resumen sin recomendar cobrar otra vez.',
  endpoint:'/api/billing/invoices/:id/nota-credito',method:'POST',
  checks:['Seguir NC, crédito disponible, prefactura y aplicaciones por identificador.','No atribuir a ARCA una edición local ni afirmar que la NC devuelve dinero.'],
 },
] as const;
