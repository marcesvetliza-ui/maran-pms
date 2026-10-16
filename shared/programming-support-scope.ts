import type {SupportDiagnosis} from './programming-support';
const screens:Record<string,string>={
 'client/src/components/planning-reservation-detail.tsx':'Planning',
 'client/src/pages/planning.tsx':'Planning',
 'client/src/pages/reservations.tsx':'Reservas',
 'client/src/pages/inventory.tsx':'Inventario',
 'client/src/pages/spa.tsx':'SPA',
 'client/src/pages/restaurant.tsx':'Restaurante',
 'client/src/pages/billing.tsx':'Facturación',
 'client/src/components/PrefacturaDialog.tsx':'Prefactura de Recepción',
};
/** Screen names derive from cited production files, not from the model's prose. */
export function citedScreens(report:Pick<SupportDiagnosis,'evidence'>):string[]{
 return [...new Set(report.evidence.flatMap(ref=>screens[ref.path]?[screens[ref.path]]:[]))];
}
