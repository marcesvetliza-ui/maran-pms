import {expect,it} from 'vitest';
import {supportReportText} from './support-report-presentation';
it('removes placeholders and audit prefixes only for presentation',()=>{
 expect(supportReportText(':null')).toBe('');expect(supportReportText('null')).toBe('');
 expect(supportReportText('Corrección: La diferencia es contado menos esperado.')).toBe('La diferencia es contado menos esperado.');
 expect(supportReportText('La API devuelve null en ese campo.')).toBe('La API devuelve null en ese campo.');
});
