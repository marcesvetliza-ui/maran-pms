/** Deterministic request catalog, NOT a reseed. IDs match the synthetic fixtures. */
export function scenarioCatalog() {
  const result:any[]=[];
  for(const id of ["spa-existing","spa-post-cae","spa-mixed"]) {
    const partial=id==="spa-mixed",scope={kind:"spa",id};
    result.push({id,title:partial?"SPA · cobro del faltante":id==="spa-post-cae"?"SPA · recuperar después del CAE":"SPA · facturar cobros existentes",
      description:partial?"$5.000 ya cobrados; se cobran únicamente $90.000 nuevos.":"$95.000 ya cobrados; facturar no crea nuevos pagos ni ingresos.",
      scope,request:{scope,documentId:`${id}:F1`,applications:[{receiptId:`spa:${id}:S1`,amountCents:500_000},...(partial?[]:[{receiptId:`spa:${id}:S2`,amountCents:9_000_000}])],
      newCollections:partial?[{rowId:"faltante",method:"efectivo",amountCents:9_000_000,shiftId:`id-unset`}]:[]},correctionRequest:null});
    if(partial) result[result.length-1].request.newCollections[0].shiftId=`${id}:shift`;
  }
  for(const id of ["reservation-A","reservation-B","reservation-C","reservation-reused"]) {
    const scope={kind:"reservation",id};
    result.push({id,title:id==="reservation-A"?"Folio A · corregir medio":id==="reservation-B"?"Folio B · retirar y restaurar":id==="reservation-C"?"Folio C · refacturar sin cobrar":"Folio · crédito ya reutilizado",
      description:id==="reservation-A"?"Rectificación de turno cerrado sin cambiar el cierre original.":id==="reservation-B"?"La reserva tiene $90.000 pendientes de cobro.":id==="reservation-C"?"Reaplicar $60.000 y $30.000 sin cobrar otra vez.":"Retirar P-C deja obligaciones $60.000 / $30.000.",
      scope,request:id==="reservation-C"?{scope,documentId:`${id}:F2`,applications:[{receiptId:`reservation:${id}:P-D`,amountCents:6_000_000},{receiptId:`reservation:${id}:P-C`,amountCents:3_000_000}],newCollections:[]}:null,
      correctionRequest:id==="reservation-C"?null:{scope,receiptId:`reservation:${id}:P-C`,action:id==="reservation-A"?"change_method":"void_nonexistent",
        ...(id==="reservation-A"?{newMethod:"efectivo"}:{}),historical:["reservation-A","reservation-B"].includes(id),
        reason:"Corrección sintética documentada por supervisor",evidenceRef:"synthetic-proof",
        restorations:id==="reservation-B"?[{receiptId:`reservation:${id}:P-D`,documentId:`${id}:F1`,amountCents:6_000_000}]:[]}});
  }
  return result;
}
