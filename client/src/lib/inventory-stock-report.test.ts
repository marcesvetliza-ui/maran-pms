import {it,expect} from 'vitest';
import {stockReportHtml,stockReportCsv,type StockReport} from './inventory-stock-report';
const report:StockReport={date:'2026-10-06',warehouse:'Cocina',filters:'Carnes',historical:true,rows:[{name:'<Carne>',sku:'=PELIGRO()',unit:'kg',quantity:null,cost:100,category:'Carnes'}]};
it('imprime el filtro y fecha elegidos, escapando contenido y sin convertir desconocidos en cero',()=>{
 const html=stockReportHtml(report);expect(html).toContain('06/10/2026');expect(html).toContain('Cocina');expect(html).toContain('Carnes');expect(html).toContain('&lt;Carne&gt;');expect(html).toContain('Sin información histórica');expect(html).not.toContain('Costo unitario actual');
});
it('exporta el mismo saldo histórico y neutraliza fórmulas en planillas',()=>{const csv=stockReportCsv(report);expect(csv).toContain("'=PELIGRO()");expect(csv).toContain('Sin información histórica');expect(csv).toContain('Cierre del día');});
it('los costos actuales se incluyen solo en la vista actual y cuando se proporcionan',()=>{
 expect(stockReportHtml({...report,historical:false})).toContain('Costo unitario actual');expect(stockReportHtml({...report,historical:false,rows:[{name:'Carne',unit:'kg',quantity:2}]})).not.toContain('Costo unitario actual');
});
