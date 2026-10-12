import {it,expect} from 'vitest';
import {diagnosisState,type SupportDiagnosis} from '../../shared/programming-support';
const report:SupportDiagnosis={summary:'Coincide',certainty:'sustentado_en_codigo',cause:'',proposal:'',proposedTests:[],questions:[],dataRepair:'',limitations:[],evidence:[]};
it('no bloquea un diagnóstico sustentado por preguntas adicionales',()=>{
  expect(diagnosisState({...report,questions:['¿Querés ampliar el alcance?']})).toBe('proposal_ready');
});
it('mantiene pendiente una conclusión que requiere información aunque no haya preguntas',()=>{
  expect(diagnosisState({...report,certainty:'falta_informacion'})).toBe('needs_info');
});
it('presenta una hipótesis como propuesta sin confundirla con evidencia confirmada',()=>{
  expect(diagnosisState({...report,certainty:'hipotesis'})).toBe('proposal_ready');
});
