type ReviewItem={id:string;name:string;unitCorrectionPending?:boolean;unitCorrectionNote?:string|null};
export function InventoryRecipeCostWarning({items}:{items:ReviewItem[]}) {
 const affected=items.filter(item=>item.unitCorrectionPending);
 if(!affected.length)return null;
 return <div role="status" className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950 dark:bg-amber-950/30 dark:text-amber-100">
  <p className="font-semibold">Recetas pendientes de revisar por corrección de unidades</p>
  <p>Se guardó la nueva unidad de {affected.slice(0,5).map(item=>item.name).join(', ')}{affected.length>5?` y ${affected.length-5} artículos más`:''}. Sus recetas conservan los costos anteriores hasta completar la revisión y el recálculo.</p>
  {affected.length===1 && affected[0].unitCorrectionNote && <p className="mt-1">{affected[0].unitCorrectionNote}</p>}
 </div>;
}
