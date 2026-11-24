# Hospitalidad: servicios incluidos entre áreas · piloto en Xenia

Destino: demo completa `https://demo.maranpms.com.ar`, rama base
`feature/xenia-support-approval-foundation`. Esta entrega no se integra a `main`
ni cambia Maran. El pase a Maran queda sujeto a la revisión del propietario.

## Recorrido de prueba

1. En Paquetes, crear o editar una propuesta. Después de guardar el producto,
   abrir Editar y configurar **Servicios incluidos de otras áreas**. Tildar
   Restaurant, SPA o Recepción; indicar servicio, cantidad, cálculo y condiciones.
   Pulsar **Guardar incluidos**. Este guardado es independiente del precio y los
   ítems descriptivos que ya tenía el paquete.
2. Ejemplo ficticio: cena, 1 por persona y noche, sin bebidas; masaje, 1 por persona
   por estadía. Una reserva nueva de 2 personas por 2 noches genera 4 cenas y 2
   masajes. El selector de paquete guarda su ID; no se interpreta texto de notas
   para atribuir beneficios a reservas anteriores.
3. En Restaurant y SPA, abrir **Hospitalidad**. En Reservas se dispone del mismo
   botón; Planning → detalle de reserva → Datos → Hospitalidad muestra los de
   esa estadía. Hospitalidad también tiene la pestaña **Servicios incluidos**.
4. Revisar Hoy, Próximos, Todos los pendientes e Historial. El número del botón
   cuenta registros de servicios pendientes y vigentes de hoy, no personas,
   cantidades ni avisos sin leer. Cada noche puede tener su propio registro.
   Los servicios aún sin fecha se encuentran en Todos los pendientes.
5. **Visto** solo confirma lectura. **Coordinar** informa el próximo horario de
   atención pendiente y deja historial. **Registrar atención** solicita cantidad
   y detalle, descuenta solo esa cantidad y registra operador y momento.
6. Para media pensión vendida aparte: abrir la estadía y **Agregar incluidos /
   media pensión**. Registrar lo acordado y la referencia de la venta. Aquí se
   comunica un servicio; su importe debe registrarse en el folio por el circuito
   habitual. Coordinación puede retirar los pendientes con motivo, conservando
   atenciones e historial. Cambiar luego la reserva no reactiva ese retiro.
7. En SPA, editar un tratamiento o circuito ya creado y guardar sus incluidos.
   La cantidad se aplica por turno o unidad vendida: un almuerzo para dos usa
   cantidad 2. Una noche incluida se informa a Recepción para coordinar fechas y
   disponibilidad. No se asigna una habitación automáticamente.
8. La venta anticipada de SPA genera un único cupo, inicialmente a coordinar y a
   nombre del comprador. Los turnos que reclaman esa venta no duplican el cupo.
   El área registra beneficiario/referencia en la coordinación y la atención.
   Al completar SPA, el área ve que hay una atención SPA completada; ese aviso
   no significa que todos los beneficiarios de una venta múltiple terminaron.

## Reglas de esta etapa

- Las condiciones se copian al crear la reserva, venta o turno. Cambiar la
  plantilla solo afecta ventas posteriores. No se generan beneficios históricos
  al desplegar, leer listados ni editar un producto.
- Cambios de habitación y titular se reflejan desde la estadía actual. Los
  incluidos no dependen del número de habitación ni alteran la ficha del huésped.
- Las cantidades de hotel usan los pasajeros declarados, incluyendo menores.
  Si el acuerdo alcanza a otra cantidad, recepción debe configurar el adicional
  correspondiente; escribir «solo adultos» en condiciones no calcula edades.
- Los servicios por noche corresponden a ingreso inclusive y egreso exclusive.
  Los de una sola vez son válidos durante la estadía, incluido el día de salida.
- Cambiar fechas/pasajeros recalcula los pendientes desde las reglas vendidas;
  nunca borra atención registrada. Los casos afectados quedan para revisión.
- Cancelar o marcar no-show retira pendientes. El historial de lo prestado queda.
  Un cambio de paquete deja los anteriores en historial y conserva sus consumos.
- Las escrituras usan bloqueo por origen, revisión e identificador de intento.
  Un reintento no repite atención; dos empleados no consumen la misma unidad.
  El evento de historial y la atención se guardan en la misma transacción.
- Restaurant ve y atiende Restaurant; SPA ve y atiende SPA. Los roles de
  coordinación autorizados ven las áreas correspondientes. La configuración
  conserva los permisos de Paquetes y de escritura SPA; no se conceden permisos
  nuevos por desplegar.

## Límite operativo visible

Esta etapa registra derechos, avisos, coordinación y atención. No reserva mesas,
gabinetes ni habitaciones. No modifica comandas, stock, cargos, pagos o facturas,
ni descuenta automáticamente los incluidos de un ticket. El personal debe usar
el circuito habitual para registrar la prestación y separar sus adicionales.
La integración automática con comandas y turnos corresponde a la siguiente etapa.

La migración es aditiva, sin backfill. Los disparadores guardan/reconcilian los
incluidos dentro de la transacción del origen, incluidos los escritores que usan
SQL directo. El SQL se incluye en el artefacto de producción y la migración se
comprueba dos veces sobre PostgreSQL descartable. No cambiar el proyecto, bases,
secretos ni las variables del asistente para desplegar este cambio.
