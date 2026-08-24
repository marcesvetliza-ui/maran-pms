import{r as y,g as p,b as w,j as e,I as k,B as x,R as v,n as h,L as g,p as A,m as T}from"./index-BOoQLd09.js";import{S as O}from"./skeleton-7jY1qwhH.js";import{P as S}from"./printer-C52O4fBS.js";function c(s){if(!s)return"-";const[d,i,o]=s.split("-");return`${o}/${i}/${d}`}function l(s){return s==null?"-":`$${s.toLocaleString("es-AR",{minimumFractionDigits:0,maximumFractionDigits:0})}`}function I(s){return s?new Date(s+"T12:00:00").toLocaleDateString("es-AR",{weekday:"long",year:"numeric",month:"long",day:"numeric",timeZone:"America/Argentina/Buenos_Aires"}):""}const R=`
@page {
  size: A4 portrait;
  margin: 10mm 8mm;
}
@media print {
  /* Ocultar chrome de la app */
  [data-sidebar], nav, header, aside, [data-no-print],
  .no-print { display: none !important; }
  body { background: white !important; color: black !important; margin: 0; padding: 0; font-family: Arial, sans-serif; }

  .print-container {
    padding: 0 !important;
    max-width: 100% !important;
    margin: 0 !important;
    min-height: unset !important;
  }

  /* ── Tabla ultra-compacta ── */
  table {
    font-size: 7.5pt;
    width: 100%;
    border-collapse: collapse;
    table-layout: fixed;
  }
  th {
    background: #d0d0d0 !important;
    print-color-adjust: exact;
    -webkit-print-color-adjust: exact;
    font-size: 6.5pt;
    font-weight: 700;
    text-transform: uppercase;
    padding: 2px 4px !important;
    white-space: nowrap;
    border: 0.5px solid #aaa;
  }
  td {
    padding: 2px 4px !important;
    font-size: 7.5pt;
    vertical-align: middle;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    border: 0.5px solid #ccc;
    line-height: 1.25;
  }
  tr { page-break-inside: avoid; }
  tbody tr:nth-child(even) {
    background: #f4f4f4 !important;
    print-color-adjust: exact;
    -webkit-print-color-adjust: exact;
  }

  /* Highlight filas con saldo */
  .row-pending {
    background: #fff3cd !important;
    print-color-adjust: exact;
    -webkit-print-color-adjust: exact;
  }

  /* Colores de saldo */
  .saldo-pending { color: #b91c1c !important; font-weight: 700; }
  .saldo-ok      { color: #15803d !important; }
  .saldo-credit  { color: #1d4ed8 !important; }

  /* Badge de sección */
  .section-badge {
    print-color-adjust: exact;
    -webkit-print-color-adjust: exact;
    border-radius: 2px !important;
    padding: 1px 6px !important;
    font-size: 8pt !important;
    font-weight: 700;
  }
  .section-badge-red  { background: #dc2626 !important; color: white !important; }
  .section-badge-green{ background: #16a34a !important; color: white !important; }

  /* Espaciado entre secciones */
  .section-gap { margin-top: 8mm !important; }

  /* Ancho de columnas fijo */
  .col-hab   { width: 28px;  }
  .col-guest { width: auto;  }
  .col-tipo  { width: 80px;  }
  .col-n     { width: 24px;  text-align: center; }
  .col-fecha { width: 44px;  }
  .col-rate  { width: 80px;  text-align: right; }
  .col-saldo { width: 70px;  text-align: right; }
  .col-orig  { width: 48px;  }

  /* Header del documento */
  .doc-header { border-bottom: 1.5px solid black; padding-bottom: 3mm; margin-bottom: 3mm; }
}
`;function E(){const[s,d]=y.useState(p()),{data:i,isLoading:o,refetch:u,isRefetching:b}=w({queryKey:["/api/daily-report",s],queryFn:async()=>{const t=await fetch(`/api/daily-report?date=${s}`,{credentials:"include"});if(!t.ok)throw new Error("Error al cargar planilla");return t.json()}}),f=()=>window.print(),j={direct:"Directa",directo:"Directa",phone:"Tel.",telefono:"Tel.",email:"Email",walk_in:"Walk-in",booking:"Booking",expedia:"Expedia",airbnb:"Airbnb",despegar:"Despegar",empresa:"Empresa",agencia:"Agencia",web:"Web",other:"Otro"},a=i?.checkOuts??[],r=i?.checkIns??[];function m(t,n){return t==null?e.jsx("span",{className:"text-gray-400",children:"-"}):e.jsxs("span",{children:[l(t),e.jsx("span",{className:"text-gray-400",children:"/n"}),n!=null&&e.jsxs(e.Fragment,{children:[" · ",l(n)]})]})}return e.jsxs(e.Fragment,{children:[e.jsx("style",{dangerouslySetInnerHTML:{__html:R}}),e.jsxs("div",{className:"print-container min-h-screen bg-background p-4 md:p-6 max-w-[1100px] mx-auto",children:[e.jsxs("div",{className:"flex flex-wrap items-center justify-between gap-3 mb-6 no-print","data-no-print":!0,children:[e.jsxs("div",{children:[e.jsx("h1",{className:"text-2xl font-bold tracking-tight",children:"Planilla Operativa Diaria"}),e.jsx("p",{className:"text-sm text-muted-foreground mt-0.5",children:"Check-outs y check-ins del día"})]}),e.jsxs("div",{className:"flex items-center gap-2",children:[e.jsx(k,{type:"date",value:s,onChange:t=>d(t.target.value),className:"w-40 h-9"}),e.jsx(x,{variant:"outline",size:"sm",onClick:()=>d(p()),children:"Hoy"}),e.jsx(x,{variant:"outline",size:"icon",className:"h-9 w-9",onClick:()=>u(),children:e.jsx(v,{className:`h-4 w-4 ${b?"animate-spin":""}`})}),e.jsxs(x,{size:"sm",onClick:f,className:"gap-1.5",children:[e.jsx(S,{className:"h-4 w-4"}),"Imprimir"]})]})]}),e.jsx("div",{className:"hidden print:block doc-header",children:e.jsxs("div",{className:"flex items-start justify-between",children:[e.jsxs("div",{children:[e.jsx("p",{style:{fontSize:"11pt",fontWeight:"bold",textTransform:"uppercase",letterSpacing:"0.05em"},children:"Maran Suites & Towers"}),e.jsx("p",{style:{fontSize:"7.5pt",color:"#555"},children:"Alameda de la Federación 698, Paraná, Entre Ríos"})]}),e.jsxs("div",{className:"text-right",children:[e.jsx("p",{style:{fontSize:"10pt",fontWeight:"bold"},children:"PLANILLA OPERATIVA DIARIA"}),e.jsx("p",{style:{fontSize:"8.5pt",textTransform:"capitalize"},children:I(s)}),e.jsxs("p",{style:{fontSize:"7pt",color:"#555"},children:["Impreso: ",new Date().toLocaleString("es-AR")]})]})]})}),!o&&e.jsxs("div",{className:"flex gap-3 mb-5 flex-wrap no-print","data-no-print":!0,children:[e.jsxs("div",{className:"flex items-center gap-2 rounded-lg border px-3 py-2 bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-900",children:[e.jsx(h,{className:"h-4 w-4 text-red-600 dark:text-red-400"}),e.jsxs("span",{className:"text-sm font-semibold text-red-700 dark:text-red-300",children:[a.length," salida",a.length!==1?"s":""]})]}),e.jsxs("div",{className:"flex items-center gap-2 rounded-lg border px-3 py-2 bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-900",children:[e.jsx(g,{className:"h-4 w-4 text-green-600 dark:text-green-400"}),e.jsxs("span",{className:"text-sm font-semibold text-green-700 dark:text-green-300",children:[r.length," entrada",r.length!==1?"s":""]})]}),a.some(t=>t.folioBalance>.5)&&e.jsxs("div",{className:"flex items-center gap-2 rounded-lg border px-3 py-2 bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-900",children:[e.jsx(A,{className:"h-4 w-4 text-amber-600 dark:text-amber-400"}),e.jsxs("span",{className:"text-sm font-semibold text-amber-700 dark:text-amber-300",children:[a.filter(t=>t.folioBalance>.5).length," con saldo pendiente"]})]})]}),o?e.jsx("div",{className:"space-y-3",children:[1,2,3,4].map(t=>e.jsx(O,{className:"h-8 w-full"},t))}):e.jsxs(e.Fragment,{children:[e.jsxs("div",{className:"mb-8",children:[e.jsxs("div",{className:"flex items-center gap-2 mb-2",children:[e.jsxs("span",{className:"section-badge section-badge-red bg-red-600 text-white rounded px-3 py-1 font-bold text-sm uppercase tracking-wide",children:[e.jsx(h,{className:"inline h-3.5 w-3.5 mr-1 print:hidden"}),"Salidas del día — ",c(s)]}),e.jsxs("span",{className:"text-sm text-muted-foreground",children:[a.length," habitacion",a.length!==1?"es":""]})]}),a.length===0?e.jsx("div",{className:"rounded-lg border border-dashed p-6 text-center text-muted-foreground text-sm",children:"Sin check-outs programados para esta fecha"}):e.jsx("div",{className:"rounded-lg border overflow-hidden",children:e.jsxs("table",{className:"w-full text-sm",children:[e.jsxs("colgroup",{children:[e.jsx("col",{className:"col-hab",style:{width:36}}),e.jsx("col",{className:"col-guest"}),e.jsx("col",{className:"col-tipo",style:{width:90}}),e.jsx("col",{className:"col-n",style:{width:30}}),e.jsx("col",{className:"col-fecha",style:{width:52}}),e.jsx("col",{className:"col-rate",style:{width:120}}),e.jsx("col",{className:"col-saldo",style:{width:80}})]}),e.jsx("thead",{children:e.jsxs("tr",{className:"bg-muted/60 text-xs uppercase tracking-wide text-muted-foreground",children:[e.jsx("th",{className:"text-left px-2 py-1.5 font-semibold",children:"HAB."}),e.jsx("th",{className:"text-left px-2 py-1.5 font-semibold",children:"HUÉSPED"}),e.jsx("th",{className:"text-left px-2 py-1.5 font-semibold",children:"TIPO / CAMAJE"}),e.jsx("th",{className:"text-center px-2 py-1.5 font-semibold",children:"N"}),e.jsx("th",{className:"text-left px-2 py-1.5 font-semibold",children:"CI"}),e.jsx("th",{className:"text-right px-2 py-1.5 font-semibold",children:"TARIFA · TOTAL"}),e.jsx("th",{className:"text-right px-2 py-1.5 font-semibold",children:"SALDO"})]})}),e.jsx("tbody",{className:"divide-y",children:a.map(t=>e.jsxs("tr",{className:t.folioBalance>.5?"row-pending bg-amber-50 dark:bg-amber-950/20":"hover:bg-muted/30",children:[e.jsx("td",{className:"px-2 py-1 font-bold text-sm col-hab",children:t.roomNumber}),e.jsxs("td",{className:"px-2 py-1 col-guest max-w-0",children:[e.jsx("div",{className:"font-medium leading-tight",children:t.guestName}),e.jsxs("div",{className:"text-xs text-muted-foreground leading-tight print:hidden",children:[[t.guestPhone,t.numberOfGuests>1?`${t.numberOfGuests} pax`:null].filter(Boolean).join(" · "),t.lateCheckOut&&e.jsxs("span",{className:"ml-1 text-amber-700 dark:text-amber-400",children:["· LATE ",t.lateCheckOutTime||""]})]}),e.jsx("div",{className:"hidden print:block text-xs text-gray-500 leading-none",children:[t.guestPhone,t.numberOfGuests>1?`${t.numberOfGuests} pax`:null,t.lateCheckOut?`LATE ${t.lateCheckOutTime||""}`:null].filter(Boolean).join(" · ")})]}),e.jsxs("td",{className:"px-2 py-1 col-tipo text-xs",children:[t.roomTypeName||"",t.bedTypeNotes&&e.jsxs("span",{className:"text-muted-foreground",children:[" · ",t.bedTypeNotes]})]}),e.jsx("td",{className:"px-2 py-1 col-n text-center tabular-nums",children:t.nightsStayed||t.nights}),e.jsx("td",{className:"px-2 py-1 col-fecha text-xs text-muted-foreground whitespace-nowrap",children:c(t.checkInDate)}),e.jsx("td",{className:"px-2 py-1 col-rate text-right tabular-nums text-xs whitespace-nowrap",children:m(t.finalRatePerNight,t.totalRoomAmount)}),e.jsx("td",{className:"px-2 py-1 col-saldo text-right tabular-nums font-semibold whitespace-nowrap",children:t.folioBalance>.5?e.jsx("span",{className:"saldo-pending text-red-600 dark:text-red-400",children:l(t.folioBalance)}):t.folioBalance<-.5?e.jsx("span",{className:"saldo-credit text-blue-600 dark:text-blue-400",children:l(t.folioBalance)}):e.jsx("span",{className:"saldo-ok text-green-600 dark:text-green-400",children:"✓ Saldado"})})]},t.reservationId))}),a.length>0&&e.jsx("tfoot",{children:e.jsxs("tr",{className:"bg-muted/40 font-semibold text-xs",children:[e.jsx("td",{colSpan:5,className:"px-2 py-1 text-right text-muted-foreground uppercase tracking-wide",children:"Totales"}),e.jsx("td",{className:"px-2 py-1 text-right tabular-nums",children:l(a.reduce((t,n)=>t+(n.totalRoomAmount??0),0))}),e.jsx("td",{className:"px-2 py-1 text-right tabular-nums",children:(()=>{const t=a.reduce((n,N)=>n+N.folioBalance,0);return t>.5?e.jsx("span",{className:"saldo-pending text-red-600",children:l(t)}):e.jsx("span",{className:"saldo-ok text-green-600",children:"✓"})})()})]})})]})})]}),e.jsxs("div",{className:"section-gap",children:[e.jsxs("div",{className:"flex items-center gap-2 mb-2",children:[e.jsxs("span",{className:"section-badge section-badge-green bg-green-600 text-white rounded px-3 py-1 font-bold text-sm uppercase tracking-wide",children:[e.jsx(g,{className:"inline h-3.5 w-3.5 mr-1 print:hidden"}),"Entradas del día — ",c(s)]}),e.jsxs("span",{className:"text-sm text-muted-foreground",children:[r.length," habitacion",r.length!==1?"es":""]})]}),r.length===0?e.jsx("div",{className:"rounded-lg border border-dashed p-6 text-center text-muted-foreground text-sm",children:"Sin check-ins programados para esta fecha"}):e.jsx("div",{className:"rounded-lg border overflow-hidden",children:e.jsxs("table",{className:"w-full text-sm",children:[e.jsxs("colgroup",{children:[e.jsx("col",{style:{width:36}}),e.jsx("col",{}),e.jsx("col",{style:{width:90}}),e.jsx("col",{style:{width:30}}),e.jsx("col",{style:{width:52}}),e.jsx("col",{style:{width:120}}),e.jsx("col",{style:{width:48}})]}),e.jsx("thead",{children:e.jsxs("tr",{className:"bg-muted/60 text-xs uppercase tracking-wide text-muted-foreground",children:[e.jsx("th",{className:"text-left px-2 py-1.5 font-semibold",children:"HAB."}),e.jsx("th",{className:"text-left px-2 py-1.5 font-semibold",children:"HUÉSPED"}),e.jsx("th",{className:"text-left px-2 py-1.5 font-semibold",children:"TIPO / CAMAJE"}),e.jsx("th",{className:"text-center px-2 py-1.5 font-semibold",children:"N"}),e.jsx("th",{className:"text-left px-2 py-1.5 font-semibold",children:"CO"}),e.jsx("th",{className:"text-right px-2 py-1.5 font-semibold",children:"TARIFA · TOTAL"}),e.jsx("th",{className:"text-left px-2 py-1.5 font-semibold",children:"ORIGEN"})]})}),e.jsx("tbody",{className:"divide-y",children:r.map(t=>e.jsxs("tr",{className:"hover:bg-muted/30",children:[e.jsx("td",{className:"px-2 py-1 font-bold text-sm",children:t.roomNumber}),e.jsxs("td",{className:"px-2 py-1 max-w-0",children:[e.jsx("div",{className:"font-medium leading-tight",children:t.guestName}),e.jsxs("div",{className:"text-xs text-muted-foreground leading-tight print:hidden",children:[[t.guestPhone,t.numberOfGuests>1?`${t.numberOfGuests} pax`:null,t.earlyCheckIn?`EARLY ${t.earlyCheckInTime||""}`:null].filter(Boolean).join(" · "),t.status==="web_checkin"&&e.jsx(T,{variant:"outline",className:"ml-1 text-[10px] px-1 py-0 border-blue-300 text-blue-700 dark:border-blue-700 dark:text-blue-300",children:"Web CI"})]}),e.jsx("div",{className:"hidden print:block text-xs text-gray-500 leading-none",children:[t.guestPhone,t.numberOfGuests>1?`${t.numberOfGuests} pax`:null,t.earlyCheckIn?`EARLY ${t.earlyCheckInTime||""}`:null].filter(Boolean).join(" · ")})]}),e.jsxs("td",{className:"px-2 py-1 text-xs",children:[t.roomTypeName||"",t.bedTypeNotes&&e.jsxs("span",{className:"text-muted-foreground",children:[" · ",t.bedTypeNotes]})]}),e.jsx("td",{className:"px-2 py-1 text-center tabular-nums",children:t.nights}),e.jsx("td",{className:"px-2 py-1 text-xs text-muted-foreground whitespace-nowrap",children:c(t.checkOutDate)}),e.jsx("td",{className:"px-2 py-1 text-right tabular-nums text-xs whitespace-nowrap",children:m(t.finalRatePerNight,t.totalRoomAmount)}),e.jsx("td",{className:"px-2 py-1 text-xs text-muted-foreground",children:t.source?j[t.source]||t.source:"-"})]},t.reservationId))}),r.length>0&&e.jsx("tfoot",{children:e.jsxs("tr",{className:"bg-muted/40 font-semibold text-xs",children:[e.jsx("td",{colSpan:5,className:"px-2 py-1 text-right text-muted-foreground uppercase tracking-wide",children:"Totales"}),e.jsx("td",{className:"px-2 py-1 text-right tabular-nums",children:l(r.reduce((t,n)=>t+(n.totalRoomAmount??0),0))}),e.jsx("td",{})]})})]})})]}),e.jsxs("div",{className:"hidden print:block mt-6 pt-3 border-t border-gray-300 text-center text-gray-400",style:{fontSize:"6.5pt"},children:["Planilla Operativa Diaria — Maran Suites & Towers · Generado el ",new Date().toLocaleString("es-AR")]})]})]})]})}export{E as default};
