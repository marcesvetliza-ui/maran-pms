export function LodgingNotice({report}:{report?:{advertencias?:Record<string,number>;criterio?:string;proyeccion?:{revenue:number;roomNights:number}}}){
 const warnings=report?.advertencias;
 return <div className="col-span-full rounded border p-3 text-sm space-y-1" data-testid="lodging-methodology">
  <p>Alojamiento realizado: noches de reservas alojadas o finalizadas hasta hoy; la noche de salida no se incluye. Las reservas futuras se separan de lo realizado.</p>
  {report?.proyeccion&&report.proyeccion.roomNights>0&&<p>Reservas por venir: {report.proyeccion.roomNights} noches · $ {report.proyeccion.revenue.toLocaleString('es-AR',{minimumFractionDigits:2,maximumFractionDigits:2})}.</p>}
  {!!warnings?.estimatedNights&&<p>Distribución estimada del total guardado: {warnings.estimatedNights} noches antiguas. No representa una tarifa histórica registrada por día.</p>}
  {!!warnings?.missingRateNights&&<p role="alert" className="text-destructive">Hay {warnings.missingRateNights} noches sin precio válido. Los ingresos son parciales y el ADR usa solo las noches con precio conocido.</p>}
  {!!warnings&&(warnings.overlappingRoomNights>0||warnings.occupiedBlockedNights>0||warnings.invalidStays>0||warnings.unassignedReservations>0)&&<p role="alert" className="text-destructive">Revisar datos: {warnings.overlappingRoomNights} superposiciones, {warnings.occupiedBlockedNights} noches en habitaciones bloqueadas, {warnings.invalidStays} estadías inválidas y {warnings.unassignedReservations} reservas sin habitación asignada.</p>}
  <details><summary className="cursor-pointer">Criterio del cálculo</summary><p>{report?.criterio??'Tarifas netas guardadas por noche; para estadías antiguas se distribuye el total en centavos. Capacidad según inventario operativo actual y bloqueos fechados: no reconstruye altas y bajas históricas. Las cortesías válidas cuentan como noches a $0. Cupos sin asignar no son ocupación física.'}</p></details>
 </div>;
}
